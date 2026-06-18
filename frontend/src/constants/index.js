export const SESSION_KEY = 'pp_support_session';

export const DASHBOARD_ROLES = ['mom', 'therapist', 'trusted'];

export const ROLE_COPY = {
  mom: {
    title: 'New Mom',
    subtitle: 'Use Bloom Today for your own postpartum support journey.',
  },
  therapist: {
    title: 'Therapist / Doctor',
    subtitle: 'Track and support moms who connect with you.',
  },
  trusted: {
    title: 'Trusted Person',
    subtitle: 'Stay in the loop for someone you care about.',
  },
};

export const AVATAR_IDS = ['brunette', 'mpfb', 'avaturn', 'avatarsdk'];

export function getPostLoginRoute(user) {
  if (user?.auth_role && user.auth_role !== 'mom') {
    return user.full_name ? '/dashboard' : '/choose-role';
  }
  if (!user?.preferred_dashboard_role) {
    return '/choose-role';
  }
  if (user.preferred_dashboard_role === 'mom' && !user.onboarding_completed) {
    return '/onboarding';
  }
  return '/dashboard';
}

export const frequencyOptions = [
  { value: 'not_at_all', label: 'Not at all' },
  { value: 'several_days', label: 'Several days' },
  { value: 'more_than_half', label: 'More than half the days' },
  { value: 'nearly_every_day', label: 'Nearly every day' },
];

/*
 * New simplified onboarding wizard steps.
 * Types: text, number, single, textarea, avatarVoice, transition, register, shareKey, done
 */
export const onboardingSteps = [
  {
    id: 'name',
    key: 'fullName',
    title: 'Hi there! What\'s your name?',
    subtitle: 'We\'d love to know what to call you.',
    type: 'text',
    placeholder: 'Your first name',
  },
  {
    id: 'age',
    key: 'dob',
    title: 'When is your birthday?',
    subtitle: 'This helps us personalise your experience.',
    type: 'date',
  },
  {
    id: 'babyAge',
    key: 'babyAgeWeeks',
    title: 'How long ago did you welcome your little one?',
    subtitle: 'In weeks — use 0 if your baby was born this week.',
    type: 'number',
    min: 0,
    max: 260,
  },
  {
    id: 'seeingDoctor',
    key: 'seeingDoctor',
    title: 'Have you been seeing a doctor regarding your mental health?',
    subtitle: 'No judgement at all — just helps us understand where you\'re at.',
    type: 'single',
    options: [
      { value: true, label: 'Yes, I have' },
      { value: false, label: 'Not yet' },
    ],
  },
  {
    id: 'transition',
    title: 'Thank you for sharing that with us',
    subtitle: 'Your openness means a lot. Now, let\'s get you set up with a caring AI companion who\'s here for you — anytime you need.',
    type: 'transition',
  },
  {
    id: 'companionAvatar',
    title: 'Choose your companion',
    subtitle: 'Pick the one that feels right for you.',
    type: 'avatarPick',
  },
  {
    id: 'companionVoice',
    title: 'Now, hear them speak',
    subtitle: 'Choose a voice for your companion. Pick one from the dropdown and hit play to preview.',
    type: 'voicePick',
  },
  {
    id: 'companionName',
    key: 'companionName',
    title: 'What would you like to name your companion?',
    subtitle: 'Pick any name that feels warm and comforting to you.',
    type: 'text',
    placeholder: 'e.g. Nura, Luna, Sage…',
  },
  {
    id: 'companionInstructions',
    key: 'companionInstructions',
    title: 'Any special instructions for your companion? (Optional)',
    subtitle: 'Preferred tone, language, topics to focus on or avoid — anything at all.',
    type: 'textarea',
    placeholder: 'e.g. "Be extra gentle", "Remind me to rest"…',
  },
  {
    id: 'register',
    title: 'Setting things up for you…',
    subtitle: 'We\'re creating your personalised AI companion right now. Just a moment!',
    type: 'register',
  },
  {
    id: 'connectTherapist',
    key: 'wantsTherapist',
    title: 'Would you like to connect a therapist?',
    subtitle: 'If you have a therapist, you can share a special code with them so they can stay connected with your journey.',
    type: 'single',
    options: [
      { value: true, label: 'Yes, I\'d love that' },
      { value: false, label: 'Maybe later' },
    ],
  },
  {
    id: 'shareTherapistKey',
    title: 'Here\'s your connection code',
    subtitle: 'Share this code with your therapist — they can enter it on Bloom Today to connect with you.',
    type: 'shareKey',
    connectionType: 'therapist',
  },
  {
    id: 'connectTrusted',
    key: 'wantsTrusted',
    title: 'Would you like to connect a trusted person?',
    subtitle: 'A partner, parent, or close friend who you trust to be part of your support network.',
    type: 'single',
    options: [
      { value: true, label: 'Yes, absolutely' },
      { value: false, label: 'Not right now' },
    ],
  },
  {
    id: 'shareTrustedKey',
    title: 'Here\'s your connection code',
    subtitle: 'Share this code with your trusted person so they can join your circle of support.',
    type: 'shareKey',
    connectionType: 'trusted',
  },
  {
    id: 'done',
    title: 'You\'re all set!',
    subtitle: 'Your companion is ready and waiting for you. Remember, you\'re not alone on this journey.',
    type: 'done',
  },
];

