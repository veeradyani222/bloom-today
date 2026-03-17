import { registeredWorklets } from './audioworklet-registry';

export class AudioStreamer {
  constructor(context) {
    this.context = context;
    this.sampleRate = 24000;
    this.bufferSize = 7680;
    this.audioQueue = [];
    this.isPlaying = false;
    this.isStreamComplete = false;
    this.checkInterval = null;
    this.scheduledTime = 0;
    // Reduced from 0.08 → 0.02 for lower first-byte latency
    this.initialBufferTime = 0.02;
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);

    // Track active sources for clean interrupt
    this._activeSources = new Set();

    // Handle tab visibility — resume AudioContext when user returns
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.context.state === 'suspended') {
        this.context.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  processPCM16Chunk(chunk) {
    const float32Array = new Float32Array(chunk.length / 2);
    const dataView = new DataView(chunk.buffer);
    for (let index = 0; index < chunk.length / 2; index += 1) {
      float32Array[index] = dataView.getInt16(index * 2, true) / 32768;
    }
    return float32Array;
  }

  createAudioBuffer(audioData) {
    const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(audioData);
    return audioBuffer;
  }

  addPCM16(chunk) {
    // Auto-resume suspended AudioContext (critical for background tab recovery)
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }

    this.isStreamComplete = false;
    let processingBuffer = this.processPCM16Chunk(chunk);

    while (processingBuffer.length >= this.bufferSize) {
      this.audioQueue.push(processingBuffer.slice(0, this.bufferSize));
      processingBuffer = processingBuffer.slice(this.bufferSize);
    }

    if (processingBuffer.length > 0) {
      this.audioQueue.push(processingBuffer);
    }

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      // Reset gain to 1 — critical after stop() which ramps gain to 0
      try {
        this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
        this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
      } catch (_) {}
      this.scheduleNextBuffer();
    }
  }

  scheduleNextBuffer() {
    // Reduced from 0.2 → 0.1 for tighter scheduling
    const scheduleAheadTime = 0.1;
    while (
      this.audioQueue.length > 0 &&
      this.scheduledTime < this.context.currentTime + scheduleAheadTime
    ) {
      const audioData = this.audioQueue.shift();
      if (!audioData) break;

      const audioBuffer = this.createAudioBuffer(audioData);
      const source = this.context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      this._activeSources.add(source);
      source.onended = () => {
        this._activeSources.delete(source);
        // When the last active source ends and queue is empty, mark not playing
        if (this._activeSources.size === 0 && this.audioQueue.length === 0) {
          this.isPlaying = false;
        }
      };

      const worklets = registeredWorklets.get(this.context);
      if (worklets) {
        Object.values(worklets).forEach((graph) => {
          if (!graph.node) return;
          source.connect(graph.node);
          graph.node.port.onmessage = (event) => {
            graph.handlers.forEach((handler) => handler.call(graph.node.port, event));
          };
          graph.node.connect(this.context.destination);
        });
      }

      const startTime = Math.max(this.scheduledTime, this.context.currentTime);
      source.start(startTime);
      this.scheduledTime = startTime + audioBuffer.duration;
    }

    if (this.audioQueue.length === 0) {
      if (this.isStreamComplete) {
        this.isPlaying = false;
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
          this.checkInterval = null;
        }
      } else if (!this.checkInterval) {
        // Reduced from 100ms → 25ms for tighter polling
        this.checkInterval = window.setInterval(() => {
          if (this.audioQueue.length > 0) {
            this.scheduleNextBuffer();
          }
        }, 25);
      }
    } else {
      const nextCheckTime = (this.scheduledTime - this.context.currentTime) * 1000;
      setTimeout(() => this.scheduleNextBuffer(), Math.max(0, nextCheckTime - 50));
    }
  }

  async resume() {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.isStreamComplete = false;
    this.scheduledTime = this.context.currentTime + this.initialBufferTime;
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
  }

  stop() {
    this.isPlaying = false;
    this.isStreamComplete = true;
    this.audioQueue = [];
    this.scheduledTime = this.context.currentTime;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Immediately stop all active playing sources for clean barge-in
    for (const source of this._activeSources) {
      try {
        source.stop(0);
        source.disconnect();
      } catch (_) {
        // Source may have already finished
      }
    }
    this._activeSources.clear();

    // Quick gain ramp to zero to avoid click
    try {
      this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.context.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.03);
    } catch (_) {
      // Context may be closed
    }
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }
}
