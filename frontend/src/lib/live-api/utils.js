const audioContextMap = new Map();

export async function audioContext(options = {}) {
  const didInteract = new Promise((resolve) => {
    window.addEventListener('pointerdown', resolve, { once: true });
    window.addEventListener('keydown', resolve, { once: true });
  });

  async function createContext() {
    if (options.id && audioContextMap.has(options.id)) {
      return audioContextMap.get(options.id);
    }

    const context = new AudioContext(options);
    if (options.id) {
      audioContextMap.set(options.id, context);
    }
    return context;
  }

  try {
    const unlockAudio = new Audio();
    unlockAudio.src =
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    await unlockAudio.play();
    return createContext();
  } catch {
    await didInteract;
    return createContext();
  }
}

export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
