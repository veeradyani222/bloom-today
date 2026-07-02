export const DEFAULT_COMPANION_VOICE_NAME = 'Aoede';
export const COMPANION_VOICE_NAMES = [
  'Achernar',
  'Achird',
  'Algenib',
  'Algieba',
  'Alnilam',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Charon',
  'Despina',
  'Enceladus',
  'Erinome',
  'Fenrir',
  'Gacrux',
  'Iapetus',
  'Kore',
  'Laomedeia',
  'Leda',
  'Orus',
  'Pulcherrima',
  'Puck',
  'Rasalgethi',
  'Sadachbia',
  'Sadaltager',
  'Schedar',
  'Sulafat',
  'Umbriel',
  'Vindemiatrix',
  'Zephyr',
  'Zubenelgenubi',
];

export function resolveCompanionVoiceName(user, fallback = DEFAULT_COMPANION_VOICE_NAME) {
  const voiceName = (
    user?.companion_voice_name
    || user?.companionVoiceName
    || user?.companion_voice
    || user?.companionVoice
    || fallback
  );

  return COMPANION_VOICE_NAMES.includes(voiceName) ? voiceName : fallback;
}
