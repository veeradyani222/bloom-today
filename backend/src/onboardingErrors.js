const { z } = require('zod');

function isGeminiQuotaError(error) {
  const status = Number(error?.status || error?.error?.code || 0);
  if (status === 429) return true;

  const message = String(error?.message || '').toLowerCase();
  return message.includes('resource_exhausted') || message.includes('quota');
}

function getOnboardingErrorResponse(error) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      error: error.issues[0]?.message || 'Invalid onboarding payload.',
    };
  }

  if (isGeminiQuotaError(error)) {
    return {
      status: 503,
      error: 'Our AI service is temporarily at capacity. Please try again in a few minutes.',
    };
  }

  return {
    status: 502,
    error: 'Could not create your companion right now. Please try again in a moment.',
  };
}

module.exports = { getOnboardingErrorResponse };

