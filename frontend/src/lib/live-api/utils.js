const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContextMap = new Map();

/**
 * Get or create an AudioContext. Safari-compatible:
 * - Uses webkitAudioContext fallback
 * - Must be called during a user gesture (click/tap handler) for Safari
 * - Automatically resumes suspended contexts
 */
export async function audioContext(options = {}) {
  if (options.id && audioContextMap.has(options.id)) {
    const existing = audioContextMap.get(options.id);
    // Safari may suspend or interrupt contexts — always try to resume
    if (existing.state === 'suspended' || existing.state === 'interrupted') {
      try { await existing.resume(); } catch (_) {}
    }
    return existing;
  }

  const context = new AudioContextClass(options);

  // Immediately resume — this works when called within a user-gesture call-stack
  if (context.state === 'suspended' || context.state === 'interrupted') {
    try { await context.resume(); } catch (_) {}
  }

  if (options.id) {
    audioContextMap.set(options.id, context);
  }
  return context;
}

export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
