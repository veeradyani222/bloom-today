import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTalkingHeadAvatarId } from './avatarSelection.js';

test('resolveTalkingHeadAvatarId keeps known avatar ids', () => {
  assert.equal(resolveTalkingHeadAvatarId('avatarsdk'), 'avatarsdk');
});

test('resolveTalkingHeadAvatarId falls back when the stored avatar id is unknown', () => {
  assert.equal(resolveTalkingHeadAvatarId('olivia'), 'brunette');
  assert.equal(resolveTalkingHeadAvatarId(''), 'brunette');
  assert.equal(resolveTalkingHeadAvatarId(null), 'brunette');
});
