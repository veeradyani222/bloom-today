import assert from 'node:assert/strict';
import test from 'node:test';

import { createGreetingAudioGate } from './greeting-audio-gate.js';

test('greeting audio gate holds realtime mic audio until the greeting turn completes', () => {
  const gate = createGreetingAudioGate({ timeoutMs: 8000 });

  gate.waitForGreeting(1000);
  assert.equal(gate.shouldSendRealtimeAudio(1200), false);

  gate.markGreetingSent(1300);
  assert.equal(gate.shouldSendRealtimeAudio(1400), false);

  gate.markGreetingComplete();
  assert.equal(gate.shouldSendRealtimeAudio(1500), true);
});

test('greeting audio gate releases mic audio after timeout if no greeting completes', () => {
  const gate = createGreetingAudioGate({ timeoutMs: 8000 });

  gate.waitForGreeting(1000);
  gate.markGreetingSent(1200);

  assert.equal(gate.shouldSendRealtimeAudio(5000), false);
  assert.equal(gate.shouldSendRealtimeAudio(9300), true);
  assert.equal(gate.snapshot().holding, false);
});
