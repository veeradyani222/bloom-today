const dotenv = require('dotenv');

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  port: Number(process.env.PORT || 8080),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5000',
  databaseUrl: required('DATABASE_URL'),
  googleClientId: required('GOOGLE_CLIENT_ID'),
  jwtSecret: required('APP_JWT_SECRET'),
  geminiApiKey:
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
};

if (!config.geminiApiKey) {
  throw new Error('Missing required environment variable: GEMINI_API_KEY');
}

// ADK/GenAI SDK reads GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY).
process.env.GEMINI_API_KEY = config.geminiApiKey;

module.exports = { config };
