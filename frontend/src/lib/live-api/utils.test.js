import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { audioContext } from './utils.js';

const originalAudio = globalThis.Audio;
const originalAudioContext = globalThis.AudioContext;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.Audio = originalAudio;
  globalThis.AudioContext = originalAudioContext;
  globalThis.window = originalWindow;
});

test('audioContext creates a context instead of waiting forever when Safari blocks unlock playback', async () => {
  let created = false;

  globalThis.window = {
    addEventListener() {},
  };
  globalThis.Audio = class {
    async play() {
      throw new Error('play() requires a user gesture');
    }
  };
  globalThis.AudioContext = class {
    constructor(options) {
      created = true;
      this.options = options;
      this.state = 'running';
    }
  };

  const result = await Promise.race([
    audioContext({ sampleRate: 16000 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('audioContext hung')), 25)),
  ]);

  assert.equal(created, true);
  assert.equal(result.options.sampleRate, 16000);
});
