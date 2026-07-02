import { callDebug } from './call-debug.js';

const audioContextMap = new Map();

export async function audioContext(options = {}) {
  async function createContext() {
    if (options.id && audioContextMap.has(options.id)) {
      callDebug('audio-context', 'reuse', {
        id: options.id,
        state: audioContextMap.get(options.id)?.state,
      });
      return audioContextMap.get(options.id);
    }

    const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextConstructor) {
      callDebug('audio-context', 'unsupported', {
        hasAudioContext: Boolean(globalThis.AudioContext),
        hasWebkitAudioContext: Boolean(globalThis.webkitAudioContext),
      });
      throw new Error('Web Audio is not supported in this browser.');
    }

    callDebug('audio-context', 'create-start', {
      id: options.id || '',
      sampleRate: options.sampleRate || '',
      constructorName: AudioContextConstructor.name || 'AudioContext',
    });
    const context = new AudioContextConstructor(options);
    if (options.id) {
      audioContextMap.set(options.id, context);
    }
    if (context.state === 'suspended') {
      callDebug('audio-context', 'resume-start', {
        id: options.id || '',
        state: context.state,
      });
      await context.resume?.();
    }
    callDebug('audio-context', 'create-done', {
      id: options.id || '',
      state: context.state,
      sampleRate: context.sampleRate,
      hasAudioWorklet: Boolean(context.audioWorklet),
    });
    return context;
  }

  try {
    const unlockAudio = new Audio();
    unlockAudio.src =
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    callDebug('audio-context', 'unlock-play-start');
    await unlockAudio.play();
    callDebug('audio-context', 'unlock-play-ok');
  } catch {
    callDebug('audio-context', 'unlock-play-blocked');
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
