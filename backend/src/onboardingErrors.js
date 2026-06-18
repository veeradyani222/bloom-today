const { z } = require('zod');

function getOnboardingErrorResponse(error) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      error: error.issues[0]?.message || 'Invalid onboarding payload.',
    };
  }

  return {
    status: 502,
    error: 'Could not create your companion right now. Please try again in a moment.',
  };
}

module.exports = { getOnboardingErrorResponse };

