export function shouldAutoRegisterOnboarding({
  stepType,
  registered,
  saving,
  hasAttemptedRegister,
}) {
  return stepType === 'register' && !registered && !saving && !hasAttemptedRegister;
}

