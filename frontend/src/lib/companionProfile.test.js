import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCompanionVoiceName } from './companionProfile.js';

test('resolveCompanionVoiceName reads backend and frontend voice field names', () => {
  assert.equal(resolveCompanionVoiceName({ companion_voice_name: 'Kore' }), 'Kore');
  assert.equal(resolveCompanionVoiceName({ companionVoiceName: 'Aoede' }), 'Aoede');
  assert.equal(resolveCompanionVoiceName({ companion_voice: 'Leda' }), 'Leda');
  assert.equal(resolveCompanionVoiceName({ companionVoice: 'Puck' }), 'Puck');
});

test('resolveCompanionVoiceName falls back to Aoede when no voice is stored', () => {
  assert.equal(resolveCompanionVoiceName({}), 'Aoede');
  assert.equal(resolveCompanionVoiceName(null), 'Aoede');
});

test('resolveCompanionVoiceName falls back to Aoede when the stored voice is unknown', () => {
  assert.equal(resolveCompanionVoiceName({ companion_voice_name: 'NotARealGeminiVoice' }), 'Aoede');
});
