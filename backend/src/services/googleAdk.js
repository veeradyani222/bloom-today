const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const { config } = require('../config');

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const sessions = new Map();
const COMPANION_MODEL = process.env.GEMINI_COMPANION_MODEL || 'gemini-2.5-flash';
const COMPANION_MODEL_ROTATION = (process.env.GEMINI_COMPANION_MODEL_ROTATION
  || `${COMPANION_MODEL},gemini-2.5-flash-lite`)
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

function uniqueStrings(values, limit = 8) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error) {
  return Number(error?.status || error?.error?.code || 0);
}

function isRetryableGeminiError(error) {
  const status = getErrorStatus(error);
  if ([429, 500, 502, 503, 504].includes(status)) return true;

  const message = String(error?.message || '').toLowerCase();
  if (status === 404 && message.includes('not found')) return true;

  return message.includes('resource_exhausted')
    || message.includes('quota')
    || message.includes('high demand')
    || message.includes('unavailable')
    || message.includes('try again later')
    || message.includes('temporar')
    || message.includes('timeout');
}

function getCompanionModelCandidates() {
  return uniqueStrings(COMPANION_MODEL_ROTATION, 8);
}

function getResponseText(response) {
  if (response?.text) return response.text;
  const part = response?.candidates?.[0]?.content?.parts?.find((item) => typeof item?.text === 'string');
  return part?.text || '';
}

function buildInstruction({ companionName, companionInstructions }) {
  return `
You are ${companionName}, a compassionate postpartum emotional support companion.
Be warm, concise, and non-judgmental. Prioritize emotional safety and gentle check-ins.
Do not provide medical diagnosis. Encourage reaching out to trusted people or therapists when needed.
${companionInstructions ? `User preference instructions: ${companionInstructions}` : ''}
`.trim();
}

function getSession({ userId, sessionId }) {
  if (sessionId && sessions.has(sessionId)) {
    return {
      id: sessionId,
      history: sessions.get(sessionId),
    };
  }

  const id = sessionId || crypto.randomUUID();
  const history = [];
  sessions.set(id, history);
  console.log(`[GENAI] session_created userId=${userId} sessionId=${id}`);
  return { id, history };
}

async function runCompanionTurn({
  userId,
  companionName,
  companionInstructions,
  sessionId,
  message,
}) {
  console.log(
    `[GENAI] turn_start userId=${userId} companion=${companionName} message_len=${message.length} sessionId=${sessionId || 'new'}`,
  );

  const session = getSession({ userId, sessionId });
  const contents = [
    ...session.history,
    {
      role: 'user',
      parts: [{ text: message }],
    },
  ];

  const modelCandidates = getCompanionModelCandidates();
  let response;
  let model = modelCandidates[0] || COMPANION_MODEL;

  for (let attempt = 0; attempt < modelCandidates.length; attempt += 1) {
    model = modelCandidates[attempt] || COMPANION_MODEL;

    try {
      response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: buildInstruction({ companionName, companionInstructions }),
        },
      });
      break;
    } catch (error) {
      const canRetry = isRetryableGeminiError(error) && attempt < modelCandidates.length - 1;
      if (!canRetry) throw error;

      const delayMs = (500 * (attempt + 1)) + Math.floor(Math.random() * 200);
      console.warn(
        `[GENAI] companion_retry userId=${userId} model=${model} attempt=${attempt + 1}/${modelCandidates.length} delayMs=${delayMs} status=${getErrorStatus(error) || 'n/a'}`,
      );
      await wait(delayMs);
    }
  }

  const responseText = getResponseText(response).trim();
  if (!responseText) {
    console.error(`[GENAI] turn_empty_response userId=${userId} sessionId=${session.id}`);
    throw new Error(
      'Gemini did not return any text response. Check GEMINI_API_KEY, project quota, and model access.',
    );
  }

  session.history.push(
    {
      role: 'user',
      parts: [{ text: message }],
    },
    {
      role: 'model',
      parts: [{ text: responseText }],
    },
  );

  console.log(
    `[GENAI] turn_success userId=${userId} sessionId=${session.id} response_len=${responseText.length}`,
  );
  return {
    sessionId: session.id,
    responseText,
    agentName: `companion-${slugify(companionName || userId.slice(0, 8))}`.slice(0, 40),
    model,
  };
}

async function createGoogleAdkCompanion({ userId, companionName, companionInstructions }) {
  console.log(`[GENAI] companion_create_start userId=${userId} companion=${companionName}`);

  const session = getSession({ userId, sessionId: undefined });
  const agentName = `companion-${slugify(companionName || userId.slice(0, 8))}`.slice(0, 40);

  return {
    provider: 'google-genai',
    agentId: agentName,
    sessionId: session.id,
    welcomeMessage: null,
    model: COMPANION_MODEL,
  };
}

module.exports = {
  createGoogleAdkCompanion,
  runCompanionTurn,
  _private: {
    getCompanionModelCandidates,
    isRetryableGeminiError,
  },
};
