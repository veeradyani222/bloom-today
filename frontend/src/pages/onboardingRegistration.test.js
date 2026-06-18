import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAutoRegisterOnboarding } from './onboardingRegistration.js';

test('auto registration is blocked after a failed attempt until the user retries', () => {
  assert.equal(
    shouldAutoRegisterOnboarding({
      stepType: 'register',
      registered: false,
      saving: false,
      hasAttemptedRegister: true,
    }),
    false,
  );
});

test('auto registration is allowed on the first visit to the register step', () => {
  assert.equal(
    shouldAutoRegisterOnboarding({
      stepType: 'register',
      registered: false,
      saving: false,
      hasAttemptedRegister: false,
    }),
    true,
  );
});
