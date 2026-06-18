const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const { config } = require('../config');

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const sessions = new Map();

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents,
    config: {
      systemInstruction: buildInstruction({ companionName, companionInstructions }),
    },
  });

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
  };
}

async function createGoogleAdkCompanion({ userId, companionName, companionInstructions }) {
  console.log(`[GENAI] companion_create_start userId=${userId} companion=${companionName}`);
  const kickoff = await runCompanionTurn({
    userId,
    companionName,
    companionInstructions,
    sessionId: undefined,
    message: 'Introduce yourself in 2-3 lines and ask a gentle first check-in question.',
  });

  return {
    provider: 'google-genai',
    agentId: kickoff.agentName,
    sessionId: kickoff.sessionId,
    welcomeMessage: kickoff.responseText,
    model: config.geminiModel,
  };
}

module.exports = { createGoogleAdkCompanion, runCompanionTurn };
