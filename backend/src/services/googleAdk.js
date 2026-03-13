const { createUserContent } = require('@google/genai');
const {
  InMemoryRunner,
  LlmAgent,
  LogLevel,
  setLogLevel,
  isFinalResponse,
  stringifyContent,
} = require('@google/adk');
const { config } = require('../config');

const APP_NAME = 'calmnest-companion';
const runners = new Map();
setLogLevel(LogLevel.ERROR);

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getOrCreateRunner({ userId, companionName, companionInstructions }) {
  const key = `${userId}:${companionName}:${companionInstructions || ''}`;
  if (runners.has(key)) {
    console.log(`[ADK] runner_reused key=${key.slice(0, 40)} model=${config.geminiModel}`);
    return runners.get(key);
  }

  const agent = new LlmAgent({
    name: `companion-${slugify(companionName || userId.slice(0, 8))}`.slice(0, 40),
    model: config.geminiModel,
    instruction: `
You are ${companionName}, a compassionate postpartum emotional support companion.
Be warm, concise, and non-judgmental. Prioritize emotional safety and gentle check-ins.
Do not provide medical diagnosis. Encourage reaching out to trusted people or therapists when needed.
${companionInstructions ? `User preference instructions: ${companionInstructions}` : ''}
`.trim(),
  });

  const runner = new InMemoryRunner({
    appName: APP_NAME,
    agent,
  });

  console.log(`[ADK] runner_created agent=${agent.name} model=${config.geminiModel}`);
  runners.set(key, runner);
  return runner;
}

async function ensureSession({ runner, userId, sessionId }) {
  if (sessionId) {
    console.log(`[ADK] session_lookup userId=${userId} sessionId=${sessionId}`);
    const existing = await runner.sessionService.getSession({
      appName: APP_NAME,
      userId,
      sessionId,
    });
    if (existing) {
      console.log(`[ADK] session_reused userId=${userId} sessionId=${existing.id}`);
      return existing.id;
    }
  }

  const created = await runner.sessionService.createSession({
    appName: APP_NAME,
    userId,
  });
  console.log(`[ADK] session_created userId=${userId} sessionId=${created.id}`);
  return created.id;
}

async function runCompanionTurn({
  userId,
  companionName,
  companionInstructions,
  sessionId,
  message,
}) {
  console.log(
    `[ADK] turn_start userId=${userId} companion=${companionName} message_len=${message.length} sessionId=${sessionId || 'new'}`,
  );
  const runner = getOrCreateRunner({ userId, companionName, companionInstructions });
  const finalSessionId = await ensureSession({ runner, userId, sessionId });

  let finalText = '';
  let fallbackText = '';
  let eventCount = 0;
  for await (const event of runner.runAsync({
    userId,
    sessionId: finalSessionId,
    newMessage: createUserContent(message),
  })) {
    eventCount += 1;
    const anyText = stringifyContent(event).trim();
    console.log(
      `[ADK] event index=${eventCount} author=${event.author || 'unknown'} final=${isFinalResponse(event)} text_len=${anyText.length}`,
    );
    if (anyText) {
      fallbackText = anyText;
    }

    if (isFinalResponse(event)) {
      finalText = anyText || fallbackText;
    }
  }

  if (!finalText && fallbackText) {
    finalText = fallbackText;
  }

  if (!finalText) {
    console.error(
      `[ADK] turn_empty_response userId=${userId} sessionId=${finalSessionId} events=${eventCount}`,
    );
    throw new Error(
      'ADK did not return any text response. Check GEMINI_API_KEY, project quota, and model access.',
    );
  }

  console.log(
    `[ADK] turn_success userId=${userId} sessionId=${finalSessionId} events=${eventCount} response_len=${finalText.length}`,
  );
  return {
    sessionId: finalSessionId,
    responseText: finalText,
    agentName: runner.agent.name,
  };
}

async function createGoogleAdkCompanion({ userId, companionName, companionInstructions }) {
  console.log(`[ADK] companion_create_start userId=${userId} companion=${companionName}`);
  const kickoff = await runCompanionTurn({
    userId,
    companionName,
    companionInstructions,
    sessionId: undefined,
    message: 'Introduce yourself in 2-3 lines and ask a gentle first check-in question.',
  });

  return {
    provider: 'google-adk',
    agentId: kickoff.agentName,
    sessionId: kickoff.sessionId,
    welcomeMessage: kickoff.responseText,
    model: config.geminiModel,
  };
}

module.exports = { createGoogleAdkCompanion, runCompanionTurn };
