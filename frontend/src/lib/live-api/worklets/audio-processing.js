const AudioProcessingWorklet = `
class AudioProcessingWorklet extends AudioWorkletProcessor {
  // 512 samples at 16kHz = 32ms chunks — optimal for low-latency streaming
  // Best practice: flush every 20-40ms for minimal round-trip latency
  buffer = new Int16Array(512);
  bufferWriteIndex = 0;

  process(inputs) {
    if (inputs[0].length) {
      const channel0 = inputs[0][0];
      this.processChunk(channel0);
    }
    return true;
  }

  sendAndClearBuffer() {
    this.port.postMessage({
      event: 'chunk',
      data: {
        int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
      },
    });
    this.bufferWriteIndex = 0;
  }

  processChunk(float32Array) {
    for (let index = 0; index < float32Array.length; index += 1) {
      const int16Value = float32Array[index] * 32768;
      this.buffer[this.bufferWriteIndex] = int16Value;
      this.bufferWriteIndex += 1;
      if (this.bufferWriteIndex >= this.buffer.length) {
        this.sendAndClearBuffer();
      }
    }

    // Flush any remaining partial data immediately (don't wait to fill buffer)
    if (this.bufferWriteIndex > 0) {
      this.sendAndClearBuffer();
    }
  }
}
`;

export default AudioProcessingWorklet;
