import EventEmitter from 'eventemitter3';
import { audioContext } from './utils';
import AudioProcessingWorklet from './worklets/audio-processing';
import VolMeterWorklet from './worklets/vol-meter';
import { createWorkletFromSrc } from './audioworklet-registry';
import { callDebug } from './call-debug.js';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
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
    this._chunkCount = 0;
    this._volumeCount = 0;
  }

  async start(options = {}) {
    const { stream: providedStream } = options;
    if (!navigator.mediaDevices?.getUserMedia) {
      callDebug('audio-recorder', 'get-user-media-missing');
      throw new Error('Microphone access is not supported in this browser.');
    }

    if (this.recording || this.starting) {
      callDebug('audio-recorder', 'start-skipped', {
        recording: this.recording,
        starting: Boolean(this.starting),
      });
      return;
    }

    callDebug('audio-recorder', 'start-requested', {
      sampleRate: this.sampleRate,
      hasProvidedStream: Boolean(providedStream),
      providedAudioTracks: providedStream?.getAudioTracks?.().map((track) => ({
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: typeof track.getSettings === 'function' ? track.getSettings() : {},
      })) || [],
    });

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
        callDebug('audio-recorder', 'stream-ready', {
          tracks: this.stream.getAudioTracks().map((track) => ({
            id: track.id,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            settings: typeof track.getSettings === 'function' ? track.getSettings() : {},
          })),
        });
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        callDebug('audio-recorder', 'audio-context-ready', {
          state: this.audioContext.state,
          sampleRate: this.audioContext.sampleRate,
          hasAudioWorklet: Boolean(this.audioContext.audioWorklet),
        });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const recorderWorkletName = 'audio-recorder-worklet';
        callDebug('audio-recorder', 'recorder-worklet-load-start');
        await this.audioContext.audioWorklet.addModule(
          createWorkletFromSrc(recorderWorkletName, AudioProcessingWorklet),
        );
        callDebug('audio-recorder', 'recorder-worklet-load-ok');

        this.recordingWorklet = new AudioWorkletNode(this.audioContext, recorderWorkletName);
        this.recordingWorklet.port.onmessage = (event) => {
          const arrayBuffer = event?.data?.data?.int16arrayBuffer;
          if (arrayBuffer) {
            this._chunkCount += 1;
            if (this._chunkCount <= 5 || this._chunkCount % 50 === 0) {
              callDebug('audio-recorder', 'chunk', {
                chunkCount: this._chunkCount,
                bytes: arrayBuffer.byteLength,
                recording: this.recording,
                contextState: this.audioContext?.state,
              });
            }
            this.emit('data', arrayBufferToBase64(arrayBuffer));
          }
        };

        const vuWorkletName = 'vu-meter';
        callDebug('audio-recorder', 'vu-worklet-load-start');
        await this.audioContext.audioWorklet.addModule(
          createWorkletFromSrc(vuWorkletName, VolMeterWorklet),
        );
        callDebug('audio-recorder', 'vu-worklet-load-ok');
        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (event) => {
          const volume = event?.data?.volume || 0;
          this._volumeCount += 1;
          if (this._volumeCount <= 5 || this._volumeCount % 50 === 0 || (volume > 0.03 && this._volumeCount % 10 === 0)) {
            callDebug('audio-recorder', 'volume', {
              volume,
              volumeCount: this._volumeCount,
              contextState: this.audioContext?.state,
            });
          }
          this.emit('volume', volume);
        };

        this.source.connect(this.recordingWorklet);
        this.source.connect(this.vuWorklet);
        this.recording = true;
        this.starting = null;
        callDebug('audio-recorder', 'start-ok', {
          contextState: this.audioContext.state,
          chunkCount: this._chunkCount,
        });
        resolve();
      } catch (error) {
        this.starting = null;
        callDebug('audio-recorder', 'start-failed', { error });
        reject(error);
      }
    });

    await this.starting;
  }

  stop() {
    const handleStop = () => {
      callDebug('audio-recorder', 'stop', {
        recording: this.recording,
        chunkCount: this._chunkCount,
        volumeCount: this._volumeCount,
        contextState: this.audioContext?.state,
        tracks: this.stream?.getAudioTracks?.().map((track) => ({
          id: track.id,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
        })) || [],
      });
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
      this.recording = false;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this._chunkCount = 0;
      this._volumeCount = 0;
    };

    if (this.starting) {
      this.starting.then(handleStop).catch(handleStop);
      return;
    }

    handleStop();
  }
}
