const { GoogleGenAI, Type } = require('@google/genai');
const { config } = require('../config');
const { pool } = require('../db');

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const ANALYSIS_MODEL = process.env.GEMINI_ANALYSIS_MODEL || config.geminiModel;
const ANALYSIS_FALLBACK_MODEL = process.env.GEMINI_ANALYSIS_FALLBACK_MODEL || '';
const DEFAULT_TIMEZONE = process.env.DASHBOARD_TIMEZONE || 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;

function clampScore(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function uniqueStrings(values, limit = 8) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getResponseText(response) {
  if (response?.text) return response.text;
  const part = response?.candidates?.[0]?.content?.parts?.find((item) => typeof item?.text === 'string');
  return part?.text || '';
}

function dayKey(input, timeZone = DEFAULT_TIMEZONE) {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function timeLabel(input, timeZone = DEFAULT_TIMEZONE) {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function relativeLabel(offset) {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return `${offset}d ago`;
}

function buildTranscriptText(messages, userName, companionName) {
  return messages
    .map((message, index) => {
      const speaker = message.role === 'user' ? userName : companionName;
      return `${index + 1}. ${speaker}: ${message.content}`;
    })
    .join('\n');
}

function sanitizeConcerningExcerpts(excerpts = []) {
  return excerpts
    .filter((item) => item?.quote || item?.reason)
    .slice(0, 5)
    .map((item) => ({
      quote: String(item.quote || '').trim().slice(0, 220),
      reason: String(item.reason || '').trim().slice(0, 160),
    }))
    .filter((item) => item.quote || item.reason);
}

function normalizeCallAnalysis(raw, session) {
  const risk = raw?.risk || {};
  const signals = raw?.signalScores || {};
  const themes = raw?.themes || {};
  const observations = raw?.observations || {};
  const reflection = raw?.momReflection || {};
  const therapistView = raw?.therapistView || {};
  const trustedPersonView = raw?.trustedPersonView || {};

  return {
    conversationSummary: String(raw?.conversationSummary || '').trim(),
    overallEmotionalTone: {
      label: String(raw?.overallEmotionalTone?.label || 'mixed').trim(),
      intensity: String(raw?.overallEmotionalTone?.intensity || 'moderate').trim(),
      explanation: String(raw?.overallEmotionalTone?.explanation || '').trim(),
    },
    moodDirection: {
      label: String(raw?.moodDirection?.label || 'steady').trim(),
      explanation: String(raw?.moodDirection?.explanation || '').trim(),
    },
    signalScores: {
      moodBalance: clampScore(signals.moodBalance, 50),
      energyLevel: clampScore(signals.energyLevel, 50),
      sleepQuality: clampScore(signals.sleepQuality, 50),
      stressLoad: clampScore(signals.stressLoad, 50),
      supportConnection: clampScore(signals.supportConnection, 50),
      selfKindness: clampScore(signals.selfKindness, 50),
      copingCapacity: clampScore(signals.copingCapacity, 50),
      bondingConnection: clampScore(signals.bondingConnection, 50),
    },
    themes: {
      positiveMoments: uniqueStrings(themes.positiveMoments),
      copingSuccesses: uniqueStrings(themes.copingSuccesses),
      whatHelped: uniqueStrings(themes.whatHelped),
      stressors: uniqueStrings(themes.stressors),
      supportMentions: uniqueStrings(themes.supportMentions),
    },
    observations: {
      anxietyMarkers: uniqueStrings(observations.anxietyMarkers),
      sadnessMarkers: uniqueStrings(observations.sadnessMarkers),
      selfWorthMarkers: uniqueStrings(observations.selfWorthMarkers),
      physicalRecoveryMentions: uniqueStrings(observations.physicalRecoveryMentions),
      socialConnectionSignal: String(observations.socialConnectionSignal || 'mixed').trim(),
      functioningSignal: String(observations.functioningSignal || 'mixed').trim(),
      babyBondingSignal: String(observations.babyBondingSignal || 'mixed').trim(),
    },
    risk: {
      level: String(risk.level || 'low').trim(),
      requiresImmediateAttention: Boolean(risk.requiresImmediateAttention),
      flags: uniqueStrings(risk.flags, 6),
      therapistAlertNote: String(risk.therapistAlertNote || '').trim(),
      trustedPersonGuidance: String(risk.trustedPersonGuidance || '').trim(),
    },
    momReflection: {
      headline: String(reflection.headline || '').trim(),
      encouragement: String(reflection.encouragement || '').trim(),
      nextStep: String(reflection.nextStep || '').trim(),
    },
    therapistView: {
      clinicalSummary: String(therapistView.clinicalSummary || '').trim(),
      symptomSignals: uniqueStrings(therapistView.symptomSignals, 8),
      recommendedActions: uniqueStrings(therapistView.recommendedActions, 6),
      concerningExcerpts: sanitizeConcerningExcerpts(therapistView.concerningExcerpts),
    },
    trustedPersonView: {
      statusLabel: String(trustedPersonView.statusLabel || 'keep supporting').trim(),
      summary: String(trustedPersonView.summary || '').trim(),
      suggestedActions: uniqueStrings(trustedPersonView.suggestedActions, 5),
      whatToSay: uniqueStrings(trustedPersonView.whatToSay, 4),
    },
    meta: {
      callType: session.call_type,
      startedAt: session.started_at,
      endedAt: session.ended_at,
    },
  };
}

const callAnalysisSchema = {
  type: Type.OBJECT,
  required: [
    'conversationSummary',
    'overallEmotionalTone',
    'moodDirection',
    'signalScores',
    'themes',
    'observations',
    'risk',
    'momReflection',
    'therapistView',
    'trustedPersonView',
  ],
  properties: {
    conversationSummary: { type: Type.STRING },
    overallEmotionalTone: {
      type: Type.OBJECT,
      required: ['label', 'intensity', 'explanation'],
      properties: {
        label: { type: Type.STRING },
        intensity: { type: Type.STRING },
        explanation: { type: Type.STRING },
      },
    },
    moodDirection: {
      type: Type.OBJECT,
      required: ['label', 'explanation'],
      properties: {
        label: { type: Type.STRING },
        explanation: { type: Type.STRING },
      },
    },
    signalScores: {
      type: Type.OBJECT,
      required: [
        'moodBalance',
        'energyLevel',
        'sleepQuality',
        'stressLoad',
        'supportConnection',
        'selfKindness',
        'copingCapacity',
        'bondingConnection',
      ],
      properties: {
        moodBalance: { type: Type.INTEGER },
        energyLevel: { type: Type.INTEGER },
        sleepQuality: { type: Type.INTEGER },
        stressLoad: { type: Type.INTEGER },
        supportConnection: { type: Type.INTEGER },
        selfKindness: { type: Type.INTEGER },
        copingCapacity: { type: Type.INTEGER },
        bondingConnection: { type: Type.INTEGER },
      },
    },
    themes: {
      type: Type.OBJECT,
      required: ['positiveMoments', 'copingSuccesses', 'whatHelped', 'stressors', 'supportMentions'],
      properties: {
        positiveMoments: { type: Type.ARRAY, items: { type: Type.STRING } },
        copingSuccesses: { type: Type.ARRAY, items: { type: Type.STRING } },
        whatHelped: { type: Type.ARRAY, items: { type: Type.STRING } },
        stressors: { type: Type.ARRAY, items: { type: Type.STRING } },
        supportMentions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    observations: {
      type: Type.OBJECT,
      required: [
        'anxietyMarkers',
        'sadnessMarkers',
        'selfWorthMarkers',
        'physicalRecoveryMentions',
        'socialConnectionSignal',
        'functioningSignal',
        'babyBondingSignal',
      ],
      properties: {
        anxietyMarkers: { type: Type.ARRAY, items: { type: Type.STRING } },
        sadnessMarkers: { type: Type.ARRAY, items: { type: Type.STRING } },
        selfWorthMarkers: { type: Type.ARRAY, items: { type: Type.STRING } },
        physicalRecoveryMentions: { type: Type.ARRAY, items: { type: Type.STRING } },
        socialConnectionSignal: { type: Type.STRING },
        functioningSignal: { type: Type.STRING },
        babyBondingSignal: { type: Type.STRING },
      },
    },
    risk: {
      type: Type.OBJECT,
      required: ['level', 'requiresImmediateAttention', 'flags', 'therapistAlertNote', 'trustedPersonGuidance'],
      properties: {
        level: { type: Type.STRING },
        requiresImmediateAttention: { type: Type.BOOLEAN },
        flags: { type: Type.ARRAY, items: { type: Type.STRING } },
        therapistAlertNote: { type: Type.STRING },
        trustedPersonGuidance: { type: Type.STRING },
      },
    },
    momReflection: {
      type: Type.OBJECT,
      required: ['headline', 'encouragement', 'nextStep'],
      properties: {
        headline: { type: Type.STRING },
        encouragement: { type: Type.STRING },
        nextStep: { type: Type.STRING },
      },
    },
    therapistView: {
      type: Type.OBJECT,
      required: ['clinicalSummary', 'symptomSignals', 'recommendedActions', 'concerningExcerpts'],
      properties: {
        clinicalSummary: { type: Type.STRING },
        symptomSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommendedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
        concerningExcerpts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ['quote', 'reason'],
            properties: {
              quote: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
          },
        },
      },
    },
    trustedPersonView: {
      type: Type.OBJECT,
      required: ['statusLabel', 'summary', 'suggestedActions', 'whatToSay'],
      properties: {
        statusLabel: { type: Type.STRING },
        summary: { type: Type.STRING },
        suggestedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
        whatToSay: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
  },
};

const rollupSchema = {
  type: Type.OBJECT,
  required: ['mom', 'therapist', 'trusted'],
  properties: {
    mom: {
      type: Type.OBJECT,
      required: ['day', 'week', 'month'],
      properties: {
        day: {
          type: Type.OBJECT,
          required: ['headline', 'summary', 'encouragement', 'nextStep'],
          properties: {
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            encouragement: { type: Type.STRING },
            nextStep: { type: Type.STRING },
          },
        },
        week: {
          type: Type.OBJECT,
          required: ['headline', 'summary', 'encouragement', 'nextStep'],
          properties: {
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            encouragement: { type: Type.STRING },
            nextStep: { type: Type.STRING },
          },
        },
        month: {
          type: Type.OBJECT,
          required: ['headline', 'summary', 'encouragement', 'nextStep'],
          properties: {
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            encouragement: { type: Type.STRING },
            nextStep: { type: Type.STRING },
          },
        },
      },
    },
    therapist: {
      type: Type.OBJECT,
      required: ['currentStatus', 'clinicalSummary', 'topConcerns', 'recommendedActions'],
      properties: {
        currentStatus: { type: Type.STRING },
        clinicalSummary: { type: Type.STRING },
        topConcerns: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommendedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    trusted: {
      type: Type.OBJECT,
      required: ['statusLabel', 'summary', 'suggestedActions', 'gentleReminder'],
      properties: {
        statusLabel: { type: Type.STRING },
        summary: { type: Type.STRING },
        suggestedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
        gentleReminder: { type: Type.STRING },
      },
    },
  },
};

const quickTipsSchema = {
  type: Type.OBJECT,
  required: ['summary', 'tips'],
  properties: {
    summary: { type: Type.STRING },
    tips: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
};

const resourceRecommendationsSchema = {
  type: Type.OBJECT,
  required: ['summary', 'resources'],
  properties: {
    summary: { type: Type.STRING },
    resources: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['title', 'reason', 'youtubeUrl'],
        properties: {
          title: { type: Type.STRING },
          reason: { type: Type.STRING },
          youtubeUrl: { type: Type.STRING },
        },
      },
    },
  },
};

function extractYouTubeVideoId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
      return url.pathname.replace(/^\/+/, '').split('/')[0] || '';
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v') || '';
      }

      const parts = url.pathname.split('/').filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === 'embed' || part === 'shorts' || part === 'live');
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }
    }
  } catch {
    // noop
  }

  const watchMatch = raw.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watchMatch?.[1]) return watchMatch[1];

  const shortMatch = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (shortMatch?.[1]) return shortMatch[1];

  return '';
}

function normalizeYouTubeVideoId(videoId) {
  const normalized = String(videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{6,}$/.test(normalized)) return '';
  return normalized;
}

function buildYouTubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function buildYouTubeEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

function buildFallbackResourceRecommendations() {
  const fallback = [
    {
      title: '4-7-8 Breathing for Stress Relief',
      reason: 'A short guided breathing exercise can lower stress quickly when your nervous system feels overloaded.',
      videoId: '1Dv-ldGLnIY',
    },
    {
      title: 'Postpartum Pelvic Floor Basics',
      reason: 'A gentle recovery routine can help if your body feels tense, sore, or heavy during postpartum healing.',
      videoId: 'Qvm1OYkvYOo',
    },
    {
      title: '5 Minute Mindfulness Meditation',
      reason: 'A quick reset can help when your mind keeps racing and you need a steadier moment.',
      videoId: 'inpok4MKVLM',
    },
    {
      title: 'Gentle Neck and Shoulder Release',
      reason: 'This can ease upper-body tension that often builds up after long feeding and carrying sessions.',
      videoId: 'SedzswEwpPw',
    },
  ];

  return {
    summary: 'These picks are practical resets you can try right away on harder days.',
    resources: fallback.map((item) => ({
      title: item.title,
      reason: item.reason,
      youtubeUrl: buildYouTubeWatchUrl(item.videoId),
      embedUrl: buildYouTubeEmbedUrl(item.videoId),
      videoId: item.videoId,
    })),
  };
}

function normalizeResourceRecommendations(raw, fallback) {
  const rawItems = Array.isArray(raw?.resources) ? raw.resources : [];
  const normalizedResources = (raw?.resources || [])
    .map((item) => {
      const detectedVideoId = normalizeYouTubeVideoId(extractYouTubeVideoId(item?.youtubeUrl));
      if (!detectedVideoId) return null;

      return {
        title: String(item?.title || '').trim().slice(0, 120),
        reason: String(item?.reason || '').trim().slice(0, 260),
        youtubeUrl: buildYouTubeWatchUrl(detectedVideoId),
        embedUrl: buildYouTubeEmbedUrl(detectedVideoId),
        videoId: detectedVideoId,
      };
    })
    .filter(Boolean)
    .slice(0, 4);

  const droppedCount = Math.max(0, rawItems.length - normalizedResources.length);
  console.log(
    `[DASHBOARD] resources_normalization raw=${rawItems.length} normalized=${normalizedResources.length} dropped=${droppedCount}`,
  );
  if (droppedCount > 0) {
    const badUrls = rawItems
      .map((item) => String(item?.youtubeUrl || '').trim())
      .filter((url) => !normalizeYouTubeVideoId(extractYouTubeVideoId(url)))
      .slice(0, 6);
    console.warn('[DASHBOARD] resources_invalid_urls', badUrls);
  }

  return {
    summary: String(raw?.summary || fallback.summary || '').trim() || fallback.summary,
    // Keep only normalized AI resources here; fallback is merged later with clearer source accounting.
    resources: normalizedResources,
  };
}

function isDefinitiveUnembeddableStatus(status) {
  return [401, 403, 404, 410].includes(Number(status));
}

async function isYouTubeVideoEmbeddable(videoId) {
  if (!videoId) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(buildYouTubeWatchUrl(videoId))}&format=json`;
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      // 4xx like 403/404 generally indicates a truly unembeddable or unavailable video.
      if (isDefinitiveUnembeddableStatus(response.status)) {
        return false;
      }
      // Network edge and transient upstream failures should not disqualify otherwise valid AI links.
      return null;
    }

    const payload = await response.json().catch(() => null);
    if (!payload) return null;
    return Boolean(payload?.title);
  } catch {
    // Treat request failure as unknown embeddability instead of invalid.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function keepEmbeddableResources(resources = []) {
  const checked = await Promise.all(
    (resources || []).map(async (item) => {
      const embeddable = await isYouTubeVideoEmbeddable(item.videoId);
      return { item, embeddable };
    }),
  );

  const valid = checked
    .filter((entry) => entry.embeddable !== false)
    .map((entry) => entry.item);
  const confirmed = checked.filter((entry) => entry.embeddable === true).length;
  const unknown = checked.filter((entry) => entry.embeddable === null).length;
  const invalid = checked.filter((entry) => entry.embeddable === false).map((entry) => entry.item.videoId);

  console.log(
    `[DASHBOARD] resources_embed_check kept=${valid.length} confirmed=${confirmed} unknown=${unknown} invalid=${invalid.length}`,
  );
  if (unknown > 0) {
    console.warn('[DASHBOARD] resources_embed_check_partial_validation', {
      unknown,
      note: 'oEmbed validation unavailable for some videos; preserving candidates.',
    });
  }
  if (invalid.length) {
    console.warn('[DASHBOARD] resources_unembeddable_video_ids', invalid);
  }

  return valid;
}

async function getDashboardSourceData({ userId }) {
  const userRes = await pool.query(
    `
    SELECT full_name, preferred_dashboard_role
    FROM users
    WHERE id = $1
    `,
    [userId],
  );

  if (!userRes.rows.length) {
    throw new Error('User not found.');
  }

  const analysesRes = await pool.query(
    `
    SELECT cs.id AS call_id, cs.call_type, cs.started_at, cs.ended_at,
           csa.summary_text, csa.analysis_json, csa.analyzed_at
    FROM call_session_analyses csa
    JOIN call_sessions cs ON cs.id = csa.call_session_id
    WHERE csa.user_id = $1
    ORDER BY cs.ended_at DESC NULLS LAST, cs.started_at DESC
    LIMIT 60
    `,
    [userId],
  );

  const analyses = analysesRes.rows
    .map((row) => ({
      callId: row.call_id,
      callType: row.call_type,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      analyzedAt: row.analyzed_at,
      analysis: row.analysis_json,
    }))
    .filter((row) => row.analysis && row.analysis.signalScores);

  return {
    user: userRes.rows[0],
    analyses,
  };
}

function buildFallbackQuickTips({ analyses }) {
  const latest = analyses[0]?.analysis || null;

  if (!latest) {
    return {
      summary: 'Bloom will tailor these tips once you have a few more check-ins to learn from.',
      tips: [
        'Protect one 10-minute pocket today that is only for your own reset, not chores.',
        'Send one specific support ask instead of a broad message so it is easier for someone to say yes.',
        'Pick the next small thing that would help you feel steadier and let that be enough for today.',
      ],
    };
  }

  const scores = latest.signalScores || {};
  const themes = latest.themes || {};
  const reflections = latest.momReflection || {};
  const tips = [];
  const summarySignals = [];

  if ((scores.stressLoad || 0) >= 65) {
    summarySignals.push('stress has been running high');
    tips.push('Give yourself one no-input reset today: step away for 10 minutes, unclench your shoulders, and slow your breathing.');
  }

  if ((scores.sleepQuality || 0) <= 45) {
    summarySignals.push('rest looks thin');
    tips.push('Protect the next rest window you can find, even if it is only 20 minutes lying down without your phone.');
  }

  if ((scores.energyLevel || 0) <= 45) {
    summarySignals.push('energy looks low');
    tips.push('Choose one task to drop or delay today so your limited energy goes to the thing that matters most.');
  }

  if ((scores.moodBalance || 0) <= 50) {
    summarySignals.push('your mood has felt a bit strained');
    tips.push('Plan one small lift you can actually do today, like sunlight, a shower, or a five-minute walk.');
  }

  if ((scores.supportConnection || 0) <= 45) {
    tips.push('Ask one person for one concrete thing today, like holding the baby, bringing food, or taking over one chore.');
  }

  if ((scores.selfKindness || 0) <= 45) {
    tips.push('When you catch the thought that you should be doing more, answer it with the next single thing you have already done well.');
  }

  if (themes.whatHelped?.length) {
    tips.push(`Repeat one thing that already helped recently: ${themes.whatHelped[0]}.`);
  }

  if (themes.stressors?.length) {
    tips.push(`Plan around ${themes.stressors[0].toLowerCase()} by trimming one nonessential demand before it stacks up.`);
  }

  if (latest.risk?.requiresImmediateAttention) {
    tips.unshift('Reach out to your clinician or trusted support person today and let them know this has felt heavier than usual.');
  }

  if (reflections.nextStep) {
    tips.push(reflections.nextStep);
  }

  return {
    summary: summarySignals.length
      ? `Based on your latest check-ins, ${summarySignals.slice(0, 2).join(' and ')}.`
      : 'These tips are shaped by the patterns in your latest check-ins.',
    tips: uniqueStrings(tips, 3).slice(0, 3),
  };
}

function normalizeQuickTips(raw, fallback) {
  const tips = uniqueStrings(
    (raw?.tips || []).map((tip) => String(tip || '').trim()).filter(Boolean),
    3,
  ).slice(0, 3);

  return {
    summary: String(raw?.summary || fallback.summary || '').trim() || 'These tips are shaped by your recent check-ins.',
    tips: tips.length ? tips : fallback.tips,
  };
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
  return message.includes('high demand')
    || message.includes('unavailable')
    || message.includes('try again later')
    || message.includes('temporar')
    || message.includes('timeout');
}

async function generateStructuredJson({ prompt, schema, label = 'structured-json', maxRetries = 3 }) {
  const modelCandidates = [ANALYSIS_MODEL, ANALYSIS_FALLBACK_MODEL].filter(Boolean);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const model = modelCandidates[Math.min(attempt, modelCandidates.length - 1)] || ANALYSIS_MODEL;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.3,
        },
      });

      const rawText = getResponseText(response);
      const parsed = safeJsonParse(rawText);
      if (!parsed) {
        throw new Error('Gemini did not return valid JSON.');
      }
      return parsed;
    } catch (error) {
      const retryable = isRetryableGeminiError(error);
      const canRetry = retryable && attempt < maxRetries;
      if (!canRetry) throw error;

      const delayMs = (700 * (2 ** attempt)) + Math.floor(Math.random() * 300);
      console.warn(
        `[DASHBOARD] gemini_retry label=${label} model=${model} attempt=${attempt + 1}/${maxRetries + 1} delayMs=${delayMs} status=${getErrorStatus(error) || 'n/a'}`,
      );
      await wait(delayMs);
    }
  }

  throw new Error('Gemini retries exhausted.');
}

async function analyzeCallSession({ callId, userId }) {
  const sessionRes = await pool.query(
    `
    SELECT cs.id, cs.user_id, cs.call_type, cs.started_at, cs.ended_at,
           u.full_name, u.companion_name, u.onboarding_assessment
    FROM call_sessions cs
    JOIN users u ON u.id = cs.user_id
    WHERE cs.id = $1 AND cs.user_id = $2
    `,
    [callId, userId],
  );

  if (!sessionRes.rows.length) {
    return null;
  }

  const session = sessionRes.rows[0];
  const messagesRes = await pool.query(
    `
    SELECT role, content, created_at
    FROM call_messages
    WHERE call_session_id = $1
    ORDER BY created_at ASC, id ASC
    `,
    [callId],
  );

  const messages = messagesRes.rows;
  if (!messages.length) {
    return null;
  }

  const userName = session.full_name || 'Mom';
  const companionName = session.companion_name || 'Companion';
  const transcriptText = buildTranscriptText(messages, userName, companionName);
  const onboardingAssessment = session.onboarding_assessment || {};

  const prompt = `
You are analyzing a completed postpartum support companion call for product insights.

Important rules:
- Base every conclusion only on this call transcript and the provided intake context.
- Be supportive and non-diagnostic in the mom-facing fields.
- momReflection fields (headline, encouragement, nextStep) must ALWAYS address the user in second person ("you", "your", "you're"). Never use third person ("she", "her", "they") in momReflection — even mid-sentence.
- Keep therapist-facing fields practical, plain-language, and non-diagnostic.
- If evidence is weak, stay conservative.
- Scores must be integers from 0 to 100.
- stressLoad is higher when stress is heavier.
- moodBalance, energyLevel, sleepQuality, supportConnection, selfKindness, copingCapacity, and bondingConnection are higher when doing better.
- If there is any self-harm, baby-harm, or psychosis-like content, reflect it in risk.

Context:
- User name: ${userName}
- Companion name: ${companionName}
- Call type: ${session.call_type}
- Started at: ${session.started_at}
- Ended at: ${session.ended_at || 'unknown'}
- Intake context: ${JSON.stringify(onboardingAssessment)}

Transcript:
${transcriptText}
`.trim();

  const rawAnalysis = await generateStructuredJson({
    prompt,
    schema: callAnalysisSchema,
    label: 'call-analysis',
    maxRetries: 3,
  });
  const analysis = normalizeCallAnalysis(rawAnalysis, session);

  await pool.query(
    `
    INSERT INTO call_session_analyses (call_session_id, user_id, model_name, summary_text, analysis_json, analyzed_at, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
    ON CONFLICT (call_session_id)
    DO UPDATE SET
      model_name = EXCLUDED.model_name,
      summary_text = EXCLUDED.summary_text,
      analysis_json = EXCLUDED.analysis_json,
      analyzed_at = NOW(),
      updated_at = NOW()
    `,
    [callId, userId, ANALYSIS_MODEL, analysis.conversationSummary, JSON.stringify(analysis)],
  );

  return analysis;
}

function averageScore(items, key) {
  if (!items.length) return 0;
  const total = items.reduce((sum, item) => sum + clampScore(item.analysis.signalScores?.[key], 0), 0);
  return Math.round(total / items.length);
}

function riskPriority(level) {
  return {
    low: 0,
    moderate: 1,
    high: 2,
    urgent: 3,
  }[String(level || 'low').toLowerCase()] ?? 0;
}

function aggregateWindow(items) {
  const allAnalyses = items.map((item) => item.analysis);
  const latest = allAnalyses[0] || null;
  const counts = {
    totalCalls: items.length,
    voiceCalls: items.filter((item) => item.callType === 'voice').length,
    videoCalls: items.filter((item) => item.callType === 'video').length,
  };

  const positives = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.themes.positiveMoments), 8);
  const wins = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.themes.copingSuccesses), 8);
  const helped = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.themes.whatHelped), 8);
  const stressors = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.themes.stressors), 8);
  const supports = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.themes.supportMentions), 6);
  const flags = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.risk.flags), 8);
  const therapistSignals = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.therapistView.symptomSignals), 8);
  const recommendedActions = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.therapistView.recommendedActions), 6);
  const trustedActions = uniqueStrings(allAnalyses.flatMap((analysis) => analysis.trustedPersonView.suggestedActions), 6);
  const riskLevel = allAnalyses.reduce(
    (best, analysis) => (riskPriority(analysis.risk.level) > riskPriority(best) ? analysis.risk.level : best),
    'low',
  );

  return {
    latest,
    counts,
    averages: {
      moodBalance: averageScore(items, 'moodBalance'),
      energyLevel: averageScore(items, 'energyLevel'),
      sleepQuality: averageScore(items, 'sleepQuality'),
      stressLoad: averageScore(items, 'stressLoad'),
      supportConnection: averageScore(items, 'supportConnection'),
      selfKindness: averageScore(items, 'selfKindness'),
      copingCapacity: averageScore(items, 'copingCapacity'),
      bondingConnection: averageScore(items, 'bondingConnection'),
    },
    positiveMoments: positives,
    wins,
    whatHelped: helped,
    stressors,
    supportMentions: supports,
    riskFlags: flags,
    therapistSignals,
    recommendedActions,
    trustedActions,
    concerningExcerpts: allAnalyses.flatMap((analysis) => analysis.therapistView.concerningExcerpts).slice(0, 5),
    riskLevel,
  };
}

function buildTrendPoints(items, timeZone = DEFAULT_TIMEZONE, days = 7) {
  const byDay = new Map();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * DAY_MS);
    const key = dayKey(date, timeZone);
    byDay.set(key, {
      key,
      label: relativeLabel(offset),
      date,
      items: [],
    });
  }

  items.forEach((item) => {
    const key = dayKey(item.endedAt || item.startedAt, timeZone);
    if (byDay.has(key)) {
      byDay.get(key).items.push(item);
    }
  });

  return [...byDay.values()].map((entry) => ({
    key: entry.key,
    label: entry.label,
    callCount: entry.items.length,
    moodBalance: averageScore(entry.items, 'moodBalance'),
    energyLevel: averageScore(entry.items, 'energyLevel'),
    sleepQuality: averageScore(entry.items, 'sleepQuality'),
    stressLoad: averageScore(entry.items, 'stressLoad'),
  }));
}

async function generateRollupNarratives({ userName, analyses, timeZone }) {
  const rows = analyses.slice(-30).map((item) => ({
    day: dayKey(item.endedAt || item.startedAt, timeZone),
    callType: item.callType,
    summary: item.analysis.conversationSummary,
    tone: item.analysis.overallEmotionalTone.label,
    moodDirection: item.analysis.moodDirection.label,
    scores: item.analysis.signalScores,
    positives: item.analysis.themes.positiveMoments,
    wins: item.analysis.themes.copingSuccesses,
    stressors: item.analysis.themes.stressors,
    risk: item.analysis.risk,
  }));

  const prompt = `
You are creating dashboard narratives for a postpartum support app.

Rules:
- Mom copy must be warm, affirming, and never diagnostic.
- Mom copy must ALWAYS address the user in second person ("you", "your", "you're"). Never use third person ("she", "her", "they") when writing for the mom audience — even mid-sentence.
- Therapist copy must be concise, clear, and practical in everyday language.
- Trusted person copy must be plain-language, compassionate, and action-oriented.
- Base everything only on the provided analyzed call summaries.
- If there is limited data, say so plainly.

User: ${userName}
Timezone: ${timeZone}
Analyzed calls:
${JSON.stringify(rows)}
`.trim();

  return generateStructuredJson({
    prompt,
    schema: rollupSchema,
    label: 'rollup-narratives',
    maxRetries: 3,
  });
}

async function getContextualQuickTips({ userId, timeZone = DEFAULT_TIMEZONE }) {
  const { user, analyses } = await getDashboardSourceData({ userId });
  const fallback = buildFallbackQuickTips({ analyses });

  if (!analyses.length) {
    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      source: 'fallback',
      ...fallback,
    };
  }

  const now = Date.now();
  const daily = analyses.filter((item) => now - new Date(item.endedAt || item.startedAt).getTime() <= DAY_MS);
  const weekly = analyses.filter((item) => now - new Date(item.endedAt || item.startedAt).getTime() <= 7 * DAY_MS);
  const latest = analyses[0]?.analysis || {};
  const previous = analyses[1]?.analysis || null;
  const weekRollup = aggregateWindow(weekly);
  const dayRollup = aggregateWindow(daily);

  const prompt = `
You are creating contextual quick tips for the home screen of a postpartum support app.

Rules:
- Return exactly 3 tips.
- Each tip must be a single sentence and immediately actionable today.
- Make the tips specific to the supplied signals, recent themes, and recent direction of change.
- Be warm, direct, and practical.
- Avoid generic affirmations, repeated ideas, emojis, icons, hashtags, or bullet labels.
- Do not diagnose.
- If the provided data suggests higher-risk strain, gently prioritize reaching out to trusted or clinical support.
- Base everything only on the data below.

User: ${user.full_name || 'Mom'}
Timezone: ${timeZone}
Latest analysis:
${JSON.stringify({
  tone: latest.overallEmotionalTone,
  direction: latest.moodDirection,
  signalScores: latest.signalScores,
  themes: latest.themes,
  observations: latest.observations,
  risk: latest.risk,
  reflection: latest.momReflection,
})}

Previous analysis for comparison:
${JSON.stringify(previous ? {
  signalScores: previous.signalScores,
  tone: previous.overallEmotionalTone,
  direction: previous.moodDirection,
} : null)}

Today rollup:
${JSON.stringify(dayRollup)}

This week rollup:
${JSON.stringify(weekRollup)}

Respond as JSON with:
- summary: one short sentence explaining what the tips are responding to
- tips: array of exactly 3 strings
`.trim();

  try {
    const generated = await generateStructuredJson({
      prompt,
      schema: quickTipsSchema,
      label: 'quick-tips',
      maxRetries: 4,
    });
    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      source: 'ai',
      ...normalizeQuickTips(generated, fallback),
    };
  } catch (error) {
    console.error('[DASHBOARD] quick_tips_generation_error', error);
    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      source: 'fallback',
      ...fallback,
    };
  }
}

async function getConversationResourceRecommendations({ user, analyses, timeZone = DEFAULT_TIMEZONE }) {
  const fallback = buildFallbackResourceRecommendations();

  if (!analyses.length) {
    console.log('[DASHBOARD] resources_fallback reason=no_analyses');
    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      source: 'fallback',
      ...fallback,
    };
  }

  const now = Date.now();
  const weekly = analyses.filter((item) => now - new Date(item.endedAt || item.startedAt).getTime() <= 7 * DAY_MS);
  const latest = analyses[0]?.analysis || null;
  const weekRollup = aggregateWindow(weekly);

  const prompt = `
You are selecting YouTube resources for a supportive wellness app, personalized from conversation analysis.

Rules:
- Return exactly 4 resources.
- Every resource must be a real YouTube URL using this format: https://www.youtube.com/watch?v=VIDEO_ID
- No playlists, channels, shorts pages, or non-YouTube domains.
- Prioritize practical, gentle, non-diagnostic support content for postpartum stress, sleep, recovery, emotional regulation, and support seeking.
- Avoid sensational, shaming, or fear-based content.
- title must be short and clear.
- reason must be one sentence explaining why this resource fits her recent conversation signals.
- Base your recommendations only on the provided data.

User: ${user.full_name || 'Mom'}
Timezone: ${timeZone}
Latest analysis:
${JSON.stringify(latest ? {
  overallEmotionalTone: latest.overallEmotionalTone,
  moodDirection: latest.moodDirection,
  signalScores: latest.signalScores,
  themes: latest.themes,
  observations: latest.observations,
  risk: latest.risk,
  momReflection: latest.momReflection,
} : null)}

This week rollup:
${JSON.stringify(weekRollup)}

Respond as JSON with:
- summary: one short sentence for why these resources were chosen
- resources: array of 4 objects with title, reason, youtubeUrl
`.trim();

  try {
    const generated = await generateStructuredJson({
      prompt,
      schema: resourceRecommendationsSchema,
      label: 'resources',
      maxRetries: 4,
    });
    const generatedCount = Array.isArray(generated?.resources) ? generated.resources.length : 0;
    console.log(`[DASHBOARD] resources_ai_generated count=${generatedCount}`);

    if (!generatedCount) {
      console.warn('[DASHBOARD] resources_ai_empty_payload', generated);
    }

    const normalized = normalizeResourceRecommendations(generated, fallback);
    const validatedAi = await keepEmbeddableResources(normalized.resources);
    const fallbackFill = fallback.resources.filter(
      (item) => !validatedAi.some((aiItem) => aiItem.videoId === item.videoId),
    );
    const finalResources = [...validatedAi, ...fallbackFill].slice(0, 4);

    if (!finalResources.length) {
      console.warn('[DASHBOARD] resources_fallback reason=no_normalized_resources');
    } else if (!validatedAi.length) {
      console.warn('[DASHBOARD] resources_fallback reason=all_ai_urls_invalid_or_unembeddable');
    } else if (validatedAi.length < 4) {
      console.log(`[DASHBOARD] resources_partial_ai ai=${validatedAi.length} fallback_fill=${4 - validatedAi.length}`);
    }

    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      source: validatedAi.length ? 'ai' : 'fallback',
      summary: normalized.summary,
      resources: finalResources,
    };
  } catch (error) {
    console.error('[DASHBOARD] resources_generation_error', {
      message: error?.message,
      stack: error?.stack,
    });
    console.log('[DASHBOARD] resources_fallback reason=generation_error');
    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      source: 'fallback',
      ...fallback,
    };
  }
}

async function getDashboardInsights({ userId, role = 'mom', timeZone = DEFAULT_TIMEZONE }) {
  const { user, analyses } = await getDashboardSourceData({ userId });

  const now = Date.now();
  const daily = analyses.filter((item) => now - new Date(item.endedAt || item.startedAt).getTime() <= DAY_MS);
  const weekly = analyses.filter((item) => now - new Date(item.endedAt || item.startedAt).getTime() <= 7 * DAY_MS);
  const monthly = analyses.filter((item) => now - new Date(item.endedAt || item.startedAt).getTime() <= 30 * DAY_MS);

  const trendPoints = buildTrendPoints(monthly, timeZone, 7);
  const rollups = {
    day: aggregateWindow(daily),
    week: aggregateWindow(weekly),
    month: aggregateWindow(monthly),
  };

  let narratives = null;
  if (analyses.length) {
    try {
      narratives = await generateRollupNarratives({
        userName: user.full_name || 'Mom',
        analyses: monthly,
        timeZone,
      });
    } catch (error) {
      console.error('[DASHBOARD] narrative_generation_error', error);
    }
  }

  let resources = {
    generatedAt: new Date().toISOString(),
    timeZone,
    source: 'none',
    summary: '',
    resources: [],
  };

  if ((role || user.preferred_dashboard_role || 'mom') === 'mom') {
    resources = await getConversationResourceRecommendations({ user, analyses, timeZone });
  }

  return {
    role: role || user.preferred_dashboard_role || 'mom',
    generatedAt: new Date().toISOString(),
    timeZone,
    hasData: analyses.length > 0,
    activity: {
      totalCalls: analyses.length,
      callsToday: daily.length,
      callsThisWeek: weekly.length,
      callsThisMonth: monthly.length,
      lastCallAt: analyses[0]?.endedAt || analyses[0]?.startedAt || null,
    },
    mom: {
      current: analyses[0]?.analysis || null,
      narratives: narratives?.mom || null,
      day: rollups.day,
      week: rollups.week,
      month: rollups.month,
      trendPoints,
      resources,
    },
    therapist: {
      narratives: narratives?.therapist || null,
      week: rollups.week,
      month: rollups.month,
    },
    trusted: {
      narratives: narratives?.trusted || null,
      week: rollups.week,
    },
  };
}

async function getMoodPointSeries({ userId, timeZone = DEFAULT_TIMEZONE, date }) {
  const analysesRes = await pool.query(
    `
    SELECT cs.id AS call_id, cs.call_type, cs.started_at, cs.ended_at, csa.analysis_json
    FROM call_session_analyses csa
    JOIN call_sessions cs ON cs.id = csa.call_session_id
    WHERE csa.user_id = $1
    ORDER BY cs.ended_at ASC NULLS LAST, cs.started_at ASC
    LIMIT 180
    `,
    [userId],
  );

  const rows = analysesRes.rows
    .map((row) => ({
      callId: row.call_id,
      callType: row.call_type,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      analysis: row.analysis_json,
    }))
    .filter((row) => row.analysis?.signalScores);

  const requestedDay = date || dayKey(new Date(), timeZone);
  const todayPoints = rows
    .filter((row) => dayKey(row.endedAt || row.startedAt, timeZone) === requestedDay)
    .map((row, index) => ({
      id: row.callId,
      order: index + 1,
      time: timeLabel(row.endedAt || row.startedAt, timeZone),
      timestamp: row.endedAt || row.startedAt,
      mood: Number((clampScore(row.analysis.signalScores.moodBalance, 0) / 10).toFixed(1)),
      energy: Number((clampScore(row.analysis.signalScores.energyLevel, 0) / 10).toFixed(1)),
      sleep: Number((clampScore(row.analysis.signalScores.sleepQuality, 0) / 10).toFixed(1)),
      stress: Number((clampScore(row.analysis.signalScores.stressLoad, 0) / 10).toFixed(1)),
      tone: row.analysis.overallEmotionalTone?.label || '',
    }));

  const monthMap = new Map();
  rows
    .filter((row) => Date.now() - new Date(row.endedAt || row.startedAt).getTime() <= 30 * DAY_MS)
    .forEach((row) => {
      const key = dayKey(row.endedAt || row.startedAt, timeZone);
      const entry = monthMap.get(key) || {
        date: key,
        mood: [],
        energy: [],
        sleep: [],
        stress: [],
        callCount: 0,
      };
      entry.mood.push(clampScore(row.analysis.signalScores.moodBalance, 0) / 10);
      entry.energy.push(clampScore(row.analysis.signalScores.energyLevel, 0) / 10);
      entry.sleep.push(clampScore(row.analysis.signalScores.sleepQuality, 0) / 10);
      entry.stress.push(clampScore(row.analysis.signalScores.stressLoad, 0) / 10);
      entry.callCount += 1;
      monthMap.set(key, entry);
    });

  const monthPoints = [...monthMap.values()].map((entry) => ({
    date: entry.date,
    label: entry.date.slice(5),
    callCount: entry.callCount,
    mood: Number((entry.mood.reduce((sum, value) => sum + value, 0) / entry.mood.length).toFixed(1)),
    energy: Number((entry.energy.reduce((sum, value) => sum + value, 0) / entry.energy.length).toFixed(1)),
    sleep: Number((entry.sleep.reduce((sum, value) => sum + value, 0) / entry.sleep.length).toFixed(1)),
    stress: Number((entry.stress.reduce((sum, value) => sum + value, 0) / entry.stress.length).toFixed(1)),
  }));

  const latestPoint = todayPoints[todayPoints.length - 1] || null;

  return {
    date: requestedDay,
    timeZone,
    today: {
      totalConversations: todayPoints.length,
      latestPoint,
      averageMood: todayPoints.length
        ? Number((todayPoints.reduce((sum, item) => sum + item.mood, 0) / todayPoints.length).toFixed(1))
        : 0,
      points: todayPoints,
    },
    month: {
      totalDaysTracked: monthPoints.length,
      points: monthPoints,
    },
  };
}

// ── Hierarchical user memory ──────────────────────────────────────────────────
// After each call we extract one insight about the user and store it in a
// tiered compression table. One slot per day (level 0). When a level reaches
// 10 items it is compressed into a single item at the next level, keeping the
// total list short indefinitely.

async function compressMemoriesIfNeeded(userId, level) {
  const rows = await pool.query(
    `SELECT id, content, bucket_date
     FROM user_memories
     WHERE user_id = $1 AND level = $2
     ORDER BY bucket_date ASC`,
    [userId, level],
  );
  if (rows.rows.length < 10) return;

  const items = rows.rows;
  const ids = items.map((r) => r.id);
  const contentList = items.map((r, i) => `${i + 1}. ${r.content}`).join('\n');
  const oldestDate = items[0].bucket_date;

  const compressRes = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: [{
      role: 'user',
      parts: [{ text: `Compress these ${items.length} personal insights about the same postpartum mom into 1 sentence (max 45 words), capturing the most important recurring patterns. Be specific, not generic.\n\n${contentList}\n\nCompressed insight:` }],
    }],
    config: { temperature: 0.2, maxOutputTokens: 100 },
  });

  const compressed = getResponseText(compressRes)?.trim();
  if (!compressed) return;

  await pool.query('BEGIN');
  try {
    await pool.query(`DELETE FROM user_memories WHERE id = ANY($1)`, [ids]);
    await pool.query(
      `INSERT INTO user_memories (user_id, content, level, bucket_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, level, bucket_date)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [userId, compressed, level + 1, oldestDate],
    );
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}

async function recordCallMemory({ callId, userId }) {
  // Fetch session + transcript
  const sessionRes = await pool.query(
    `SELECT cs.id, u.full_name, u.companion_name
     FROM call_sessions cs
     JOIN users u ON u.id = cs.user_id
     WHERE cs.id = $1 AND cs.user_id = $2`,
    [callId, userId],
  );
  if (!sessionRes.rows.length) return;

  const session = sessionRes.rows[0];
  const msgRes = await pool.query(
    `SELECT role, content FROM call_messages WHERE call_session_id = $1 ORDER BY created_at ASC, id ASC`,
    [callId],
  );
  // Need at least a couple of real exchanges to extract anything meaningful
  const userMessages = msgRes.rows.filter((m) => m.role === 'user');
  if (userMessages.length < 2) return;

  const userName = session.full_name || 'the user';
  const companionName = session.companion_name || 'Companion';
  const transcriptText = buildTranscriptText(msgRes.rows, userName, companionName);

  // Generate a 1-sentence insight about the user from this call
  const insightRes = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: [{
      role: 'user',
      parts: [{ text: `From the following postpartum support conversation, extract ONE specific personal insight about the mom that would help a future companion support her better.\n\nRules:\n- One sentence only, max 28 words\n- Be specific and personal — not generic\n- Focus on: preferences, fears, joys, what helps her, what she finds hard, her situation or personality\n- If nothing meaningful is observable, reply with exactly: SKIP\n- Start with "She", "Prefers", or "Tends to"\n\nTranscript:\n${transcriptText}\n\nOne insight:` }],
    }],
    config: { temperature: 0.3, maxOutputTokens: 70 },
  });

  const newInsight = getResponseText(insightRes)?.trim();
  if (!newInsight || newInsight.toUpperCase() === 'SKIP') return;

  // Upsert today's level-0 slot (one per day)
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const existing = await pool.query(
    `SELECT id, content FROM user_memories WHERE user_id = $1 AND level = 0 AND bucket_date = $2`,
    [userId, today],
  );

  if (existing.rows.length) {
    // Merge today's existing insight + the new one into one updated sentence
    const mergeRes = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: [{
        role: 'user',
        parts: [{ text: `Combine these two personal insights about the same postpartum mom into one sentence (max 35 words), keeping the most specific details:\n1. ${existing.rows[0].content}\n2. ${newInsight}\n\nCombined insight:` }],
      }],
      config: { temperature: 0.2, maxOutputTokens: 80 },
    });
    const merged = getResponseText(mergeRes)?.trim();
    const finalContent = merged || newInsight;
    await pool.query(
      `UPDATE user_memories SET content = $1, updated_at = NOW() WHERE id = $2`,
      [finalContent, existing.rows[0].id],
    );
  } else {
    await pool.query(
      `INSERT INTO user_memories (user_id, content, level, bucket_date)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (user_id, level, bucket_date) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [userId, newInsight, today],
    );
  }

  // Cascade compression: level 0 → 1 → 2
  await compressMemoriesIfNeeded(userId, 0);
  await compressMemoriesIfNeeded(userId, 1);
}

module.exports = {
  analyzeCallSession,
  getContextualQuickTips,
  getDashboardInsights,
  getMoodPointSeries,
  recordCallMemory,
};
