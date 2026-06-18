const assert = require('node:assert/strict');
const test = require('node:test');
const { getOnboardingErrorResponse } = require('./onboardingErrors');

test('non-validation onboarding failures are reported as setup failures', () => {
  const response = getOnboardingErrorResponse(new Error('model unavailable'));

  assert.equal(response.status, 502);
  assert.equal(response.error, 'Could not create your companion right now. Please try again in a moment.');
});

