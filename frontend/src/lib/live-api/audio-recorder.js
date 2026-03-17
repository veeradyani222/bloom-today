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
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

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
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
      this.recording = false;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
    };

    if (this.starting) {
      this.starting.then(handleStop).catch(handleStop);
      return;
    }

    handleStop();
  }
}
