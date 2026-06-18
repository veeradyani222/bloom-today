const { GoogleGenAI, Modality } = require('@google/genai');
const { config } = require('../config');

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';

// Current Gemini TTS prebuilt voices, aligned to Google's documented voice_name values.
const GEMINI_VOICE_OPTIONS = [
  { id: 'Achernar', label: 'Achernar', blurb: 'Soft' },
  { id: 'Achird', label: 'Achird', blurb: 'Friendly' },
  { id: 'Algenib', label: 'Algenib', blurb: 'Gravelly' },
  { id: 'Algieba', label: 'Algieba', blurb: 'Smooth' },
  { id: 'Alnilam', label: 'Alnilam', blurb: 'Firm' },
  { id: 'Aoede', label: 'Aoede', blurb: 'Breezy' },
  { id: 'Autonoe', label: 'Autonoe', blurb: 'Bright' },
  { id: 'Callirrhoe', label: 'Callirrhoe', blurb: 'Easy-going' },
  { id: 'Charon', label: 'Charon', blurb: 'Informative' },
  { id: 'Despina', label: 'Despina', blurb: 'Smooth' },
  { id: 'Enceladus', label: 'Enceladus', blurb: 'Breathy' },
  { id: 'Erinome', label: 'Erinome', blurb: 'Clear' },
  { id: 'Fenrir', label: 'Fenrir', blurb: 'Excitable' },
  { id: 'Gacrux', label: 'Gacrux', blurb: 'Mature' },
  { id: 'Iapetus', label: 'Iapetus', blurb: 'Clear' },
  { id: 'Kore', label: 'Kore', blurb: 'Firm' },
  { id: 'Laomedeia', label: 'Laomedeia', blurb: 'Upbeat' },
  { id: 'Leda', label: 'Leda', blurb: 'Youthful' },
  { id: 'Orus', label: 'Orus', blurb: 'Firm' },
  { id: 'Pulcherrima', label: 'Pulcherrima', blurb: 'Forward' },
  { id: 'Puck', label: 'Puck', blurb: 'Upbeat' },
  { id: 'Rasalgethi', label: 'Rasalgethi', blurb: 'Informative' },
  { id: 'Sadachbia', label: 'Sadachbia', blurb: 'Lively' },
  { id: 'Sadaltager', label: 'Sadaltager', blurb: 'Knowledgeable' },
  { id: 'Schedar', label: 'Schedar', blurb: 'Even' },
  { id: 'Sulafat', label: 'Sulafat', blurb: 'Warm' },
  { id: 'Umbriel', label: 'Umbriel', blurb: 'Easy-going' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix', blurb: 'Gentle' },
  { id: 'Zephyr', label: 'Zephyr', blurb: 'Bright' },
  { id: 'Zubenelgenubi', label: 'Zubenelgenubi', blurb: 'Casual' },
];
const GEMINI_VOICE_IDS = GEMINI_VOICE_OPTIONS.map((voice) => voice.id);
const DEFAULT_GEMINI_VOICE = 'Aoede';

/* ── In-memory TTS cache (keyed by "voiceName::text") ── */
const ttsCache = new Map();
const TTS_CACHE_MAX = 200;
const TTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getTtsCacheKey(voiceName, text) {
  return `${voiceName}::${text}`;
}

function pcmToWavBuffer(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function synthesizePreviewSpeech({ text, voiceName }) {
  /* Check cache first */
  const cacheKey = getTtsCacheKey(voiceName, text);
  const cached = ttsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTS_CACHE_TTL_MS) {
    return { audioBuffer: cached.audioBuffer, mimeType: cached.mimeType };
  }

  const response = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    },
  });

  const part = response?.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new Error('Gemini TTS did not return audio data.');
  }

  const mimeType = part.inlineData.mimeType || 'audio/L16;rate=24000';
  const rawBuffer = Buffer.from(part.inlineData.data, 'base64');

  const result = mimeType.includes('wav')
    ? { audioBuffer: rawBuffer, mimeType: 'audio/wav' }
    : { audioBuffer: pcmToWavBuffer(rawBuffer), mimeType: 'audio/wav' };

  /* Store in cache (evict oldest if at capacity) */
  if (ttsCache.size >= TTS_CACHE_MAX) {
    const oldest = ttsCache.keys().next().value;
    ttsCache.delete(oldest);
  }
  ttsCache.set(cacheKey, { ...result, ts: Date.now() });

  return result;
}

module.exports = {
  DEFAULT_GEMINI_VOICE,
  GEMINI_VOICE_IDS,
  GEMINI_VOICE_OPTIONS,
  synthesizePreviewSpeech,
};
