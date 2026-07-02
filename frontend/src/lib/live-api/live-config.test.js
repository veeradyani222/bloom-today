import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLiveConnectConfig,
  LOW_LATENCY_REPLY_INSTRUCTION,
} from './live-config.js';

test('buildLiveConnectConfig does not request live transcription by default', () => {
  const config = buildLiveConnectConfig({
    responseModalities: ['AUDIO'],
  });

  assert.equal('inputAudioTranscription' in config, false);
  assert.equal('outputAudioTranscription' in config, false);
});

test('buildLiveConnectConfig can opt into live transcription for debugging', () => {
  const config = buildLiveConnectConfig(
    { responseModalities: ['AUDIO'] },
    { liveTranscription: true },
  );

  assert.deepEqual(config.inputAudioTranscription, {});
  assert.deepEqual(config.outputAudioTranscription, {});
});

test('low latency reply instruction asks for one to two short sentences', () => {
  assert.match(LOW_LATENCY_REPLY_INSTRUCTION, /1 to 2 short sentences/);
});
