const assert = require('node:assert/strict');
const test = require('node:test');
const { getOnboardingErrorResponse } = require('./onboardingErrors');

test('non-validation onboarding failures are reported as setup failures', () => {
  const response = getOnboardingErrorResponse(new Error('model unavailable'));

  assert.equal(response.status, 502);
  assert.equal(response.error, 'Could not create your companion right now. Please try again in a moment.');
});

test('Gemini quota errors return a capacity message', () => {
  const error = new Error('RESOURCE_EXHAUSTED');
  error.status = 429;

  const response = getOnboardingErrorResponse(error);

  assert.equal(response.status, 503);
  assert.match(response.error, /temporarily at capacity/i);
});

