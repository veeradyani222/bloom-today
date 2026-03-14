/**
 * Calls Gemini generateContent with automatic model fallback.
 * Tries models in order until one succeeds (non-5xx response).
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} body - Request body (contents, generationConfig, etc.)
 * @returns {Promise<object|null>} Parsed JSON response, or null if all models fail
 */

const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash-lite',
];

export async function geminiGenerateWithFallback(apiKey, body) {
  for (const model of FALLBACK_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      // If server error (503, 500, 429, etc.), try next model
      if (res.status >= 500 || res.status === 429) {
        continue;
      }
      // 404 = model doesn't exist, skip
      if (res.status === 404) {
        continue;
      }
      const data = await res.json();
      return data;
    } catch (err) {
      continue;
    }
  }
  return null;
}
