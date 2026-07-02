import { talkingHeadAvatarPresets } from './avatarPresets.js';

export const DEFAULT_TALKING_HEAD_AVATAR_ID = 'brunette';

export function resolveTalkingHeadAvatarId(avatarId, fallbackId = DEFAULT_TALKING_HEAD_AVATAR_ID) {
  if (avatarId && talkingHeadAvatarPresets[avatarId]) {
    return avatarId;
  }

  if (fallbackId && talkingHeadAvatarPresets[fallbackId]) {
    return fallbackId;
  }

  return Object.keys(talkingHeadAvatarPresets)[0];
}
