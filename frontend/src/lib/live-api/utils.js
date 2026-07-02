const audioContextMap = new Map();

export async function audioContext(options = {}) {
  async function createContext() {
    if (options.id && audioContextMap.has(options.id)) {
      return audioContextMap.get(options.id);
    }

    const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error('Web Audio is not supported in this browser.');
    }

    const context = new AudioContextConstructor(options);
    if (options.id) {
      audioContextMap.set(options.id, context);
    }
    if (context.state === 'suspended') {
      await context.resume?.();
    }
    return context;
  }

  try {
    const unlockAudio = new Audio();
    unlockAudio.src =
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    await unlockAudio.play();
  } catch {
    // Safari can reject play() after an already-consumed tap. Do not wait for
    // another gesture here; the call startup path should continue immediately.
  }
  return createContext();
}

export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
