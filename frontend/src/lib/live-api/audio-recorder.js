import EventEmitter from 'eventemitter3';
import { audioContext } from './utils';
import AudioProcessingWorklet from './worklets/audio-processing';
import VolMeterWorklet from './worklets/vol-meter';
import { createWorkletFromSrc } from './audioworklet-registry';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

/**
 * Detect whether AudioWorklet is supported.
 * Safari < 14.1 doesn't support AudioWorklet at all.
 * Some Safari versions support AudioWorklet but can't load Blob URLs.
 */
function isAudioWorkletSupported() {
  return typeof AudioWorkletNode !== 'undefined'
    && typeof window.AudioContext?.prototype?.audioWorklet !== 'undefined';
}

/**
 * ScriptProcessorNode fallback for Safari versions that don't support
 * AudioWorklet or can't load Blob URL modules.
 * Downsamples from context.sampleRate → targetRate and emits int16 PCM.
 */
function createScriptProcessorRecorder(context, source, targetRate, emitData) {
  const bufferSize = 4096;
  const processor = context.createScriptProcessor(bufferSize, 1, 1);
  const ratio = context.sampleRate / targetRate;

  processor.onaudioprocess = (event) => {
    const inputData = event.inputBuffer.getChannelData(0);
    // Downsample
    const outputLength = Math.floor(inputData.length / ratio);
    const int16 = new Int16Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = Math.floor(i * ratio);
      int16[i] = inputData[srcIndex] * 32768;
    }
    emitData(arrayBufferToBase64(int16.buffer));
  };

  source.connect(processor);
  processor.connect(context.destination); // ScriptProcessor requires connection to destination
  return processor;
}

function createScriptProcessorVolMeter(context, source, emitVolume) {
  const bufferSize = 2048;
  const processor = context.createScriptProcessor(bufferSize, 1, 1);
  let volume = 0;

  processor.onaudioprocess = (event) => {
    const samples = event.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    volume = Math.max(rms, volume * 0.7);
    emitVolume(volume);
  };

  source.connect(processor);
  processor.connect(context.destination);
  return processor;
}

export class AudioRecorder extends EventEmitter {
  constructor(sampleRate = 16000) {
    super();
    this.sampleRate = sampleRate;
    this.recording = false;
    this.starting = null;
    this.stream = undefined;
    this.source = undefined;
    this.audioContext = undefined;
    this.recordingWorklet = undefined;
    this.vuWorklet = undefined;
    // ScriptProcessor fallback refs
    this._spRecorder = undefined;
    this._spVolMeter = undefined;
    this._usingFallback = false;
  }

  async start(options = {}) {
    const { stream: providedStream } = options;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }

    if (this.recording || this.starting) {
      return;
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        if (providedStream) {
          const hasAudioTrack = providedStream.getAudioTracks().some((track) => track.readyState === 'live');
          if (!hasAudioTrack) {
            throw new Error('Provided microphone stream has no live audio track.');
          }
          this.stream = providedStream;
        } else {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        // Reuse existing audioContext if available, or create one with the target sample rate
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        // Try AudioWorklet first, fall back to ScriptProcessor for Safari
        let workletSuccess = false;
        if (isAudioWorkletSupported()) {
          try {
            const recorderWorkletName = 'audio-recorder-worklet';
            await this.audioContext.audioWorklet.addModule(
              createWorkletFromSrc(recorderWorkletName, AudioProcessingWorklet),
            );

            this.recordingWorklet = new AudioWorkletNode(this.audioContext, recorderWorkletName);
            this.recordingWorklet.port.onmessage = (event) => {
              const arrayBuffer = event?.data?.data?.int16arrayBuffer;
              if (arrayBuffer) {
                this.emit('data', arrayBufferToBase64(arrayBuffer));
              }
            };

            const vuWorkletName = 'vu-meter';
            await this.audioContext.audioWorklet.addModule(
              createWorkletFromSrc(vuWorkletName, VolMeterWorklet),
            );
            this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
            this.vuWorklet.port.onmessage = (event) => {
              this.emit('volume', event?.data?.volume || 0);
            };

            this.source.connect(this.recordingWorklet);
            this.source.connect(this.vuWorklet);
            workletSuccess = true;
          } catch (workletError) {
            console.warn('[AudioRecorder] AudioWorklet failed, falling back to ScriptProcessor:', workletError?.message || workletError);
            // Clean up any partial worklet setup
            this.recordingWorklet = undefined;
            this.vuWorklet = undefined;
          }
        }

        if (!workletSuccess) {
          // ScriptProcessor fallback (works on all Safari versions)
          this._usingFallback = true;
          this._spRecorder = createScriptProcessorRecorder(
            this.audioContext, this.source, this.sampleRate,
            (base64) => this.emit('data', base64),
          );
          this._spVolMeter = createScriptProcessorVolMeter(
            this.audioContext, this.source,
            (vol) => this.emit('volume', vol),
          );
        }

        this.recording = true;
        this.starting = null;
        resolve();
      } catch (error) {
        this.starting = null;
        reject(error);
      }
    });

    await this.starting;
  }

  stop() {
    const handleStop = () => {
      this.source?.disconnect();
      // Disconnect ScriptProcessor nodes if using fallback
      if (this._spRecorder) {
        try { this._spRecorder.disconnect(); } catch (_) {}
        this._spRecorder = undefined;
      }
      if (this._spVolMeter) {
        try { this._spVolMeter.disconnect(); } catch (_) {}
        this._spVolMeter = undefined;
      }
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
      this.recording = false;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this._usingFallback = false;
      // NOTE: We intentionally do NOT close the audioContext here.
      // Safari limits concurrent AudioContexts (~4-6). Reusing is critical.
    };

    if (this.starting) {
      this.starting.then(handleStop).catch(handleStop);
      return;
    }

    handleStop();
  }
}
