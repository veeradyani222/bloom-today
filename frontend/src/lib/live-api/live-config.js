export const LOW_LATENCY_REPLY_INSTRUCTION =
  'Keep replies to 1 to 2 short sentences. Be warm and useful, but respond quickly and never monologue.';

export function buildLiveConnectConfig(config, options = {}) {
  const fullConfig = {
    ...config,
    thinkingConfig: {
      thinkingBudget: 0,
    },
    contextWindowCompression: {
      slidingWindow: { targetTokens: 6000 },
      triggerTokens: 15000,
    },
    sessionResumption: {
      handle: options.resumptionHandle || undefined,
    },
  };

  if (options.liveTranscription) {
    fullConfig.inputAudioTranscription = {};
    fullConfig.outputAudioTranscription = {};
  }

  return fullConfig;
}
