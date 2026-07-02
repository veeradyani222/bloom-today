const STORAGE_KEY = 'bloom-call-debug-log';
const MAX_ENTRIES = 600;
const SENSITIVE_KEYS = /token|key|secret|credential|authorization|data|audio|base64|text|message/i;
const HOT_PATH_EVENTS = new Set([
  'add-pcm16',
  'audio-chunk',
  'chunk',
  'message-received',
  'remote-audio',
  'schedule-buffer',
  'send-realtime-input',
  'volume',
]);

let entries = [];
let sessionId = null;

function nowIso() {
  return new Date().toISOString();
}

function getWindow() {
  return typeof window !== 'undefined' ? window : globalThis.window;
}

function getNavigator() {
  return typeof navigator !== 'undefined' ? navigator : globalThis.navigator;
}

function getDocument() {
  return typeof document !== 'undefined' ? document : globalThis.document;
}

function getSessionId() {
  if (!sessionId) {
    sessionId = `call-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return sessionId;
}

function redactValue(value) {
  if (typeof value === 'string') return `[redacted:${value.length}]`;
  if (value instanceof ArrayBuffer) return `[arraybuffer:${value.byteLength}]`;
  if (ArrayBuffer.isView(value)) return `[typedarray:${value.byteLength}]`;
  return '[redacted]';
}

export function sanitizeForCallDebug(value, depth = 0) {
  if (value == null) return value;
  if (depth > 4) return '[depth-limit]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? value.stack.split('\n').slice(0, 4).join('\n') : '',
    };
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return redactValue(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForCallDebug(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.test(key) ? redactValue(item) : sanitizeForCallDebug(item, depth + 1),
      ]),
    );
  }
  return value;
}

export function getBrowserDiagnostics() {
  const w = getWindow() || {};
  const nav = getNavigator() || {};
  const doc = getDocument() || {};
  const mediaDevices = nav.mediaDevices || {};

  return {
    href: w.location?.href ? w.location.href.split(/[?#]/)[0] : '',
    userAgent: nav.userAgent || '',
    platform: nav.platform || '',
    maxTouchPoints: nav.maxTouchPoints || 0,
    vendor: nav.vendor || '',
    language: nav.language || '',
    secureContext: Boolean(w.isSecureContext),
    visibilityState: doc.visibilityState || '',
    hasMediaDevices: Boolean(nav.mediaDevices),
    hasGetUserMedia: typeof mediaDevices.getUserMedia === 'function',
    hasEnumerateDevices: typeof mediaDevices.enumerateDevices === 'function',
    hasAudioContext: typeof w.AudioContext === 'function' || typeof w.webkitAudioContext === 'function',
    hasAudioWorkletNode: typeof w.AudioWorkletNode === 'function',
    hasMediaStream: typeof w.MediaStream === 'function',
    hasWebSocket: typeof w.WebSocket === 'function',
    online: nav.onLine,
  };
}

function installGlobalHelpers() {
  const w = getWindow();
  if (!w) return;
  if (!w.__bloomCallDebug) {
    w.__bloomCallDebug = {};
  }
  w.__bloomCallDebug.dump = () => entries.map((entry) => JSON.stringify(entry)).join('\n');
  w.__bloomCallDebug.entries = () => entries.slice();
  w.__bloomCallDebug.clear = () => {
    entries = [];
    try {
      w.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures in private browsing modes.
    }
  };
  w.__bloomCallDebug.enableVerboseAudio = () => {
    w.__bloomCallDebugVerbose = true;
  };
  w.__bloomCallDebug.disableVerboseAudio = () => {
    w.__bloomCallDebugVerbose = false;
  };
}

function persist() {
  const w = getWindow();
  if (!w?.localStorage) return;
  try {
    w.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Storage can fail on iOS private mode or quota pressure.
  }
}

function isHotPathEvent(scope, event) {
  return (
    (scope === 'live-client' || scope === 'audio-recorder' || scope === 'audio-streamer' || scope === 'voice-call') &&
    HOT_PATH_EVENTS.has(event)
  );
}

function shouldDropHotPathEvent(scope, event) {
  const w = getWindow();
  return isHotPathEvent(scope, event) && !w?.__bloomCallDebugVerbose;
}

export function callDebug(scope, event, details = {}) {
  if (shouldDropHotPathEvent(scope, event)) return null;

  installGlobalHelpers();
  const entry = {
    t: nowIso(),
    ms: Math.round(globalThis.performance?.now?.() || 0),
    sessionId: getSessionId(),
    scope,
    event,
    details: sanitizeForCallDebug(details),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  persist();

  const logger = event.toLowerCase().includes('error') || event.toLowerCase().includes('fail')
    ? console.error
    : event.toLowerCase().includes('warn') || event.toLowerCase().includes('close')
      ? console.warn
      : console.log;
  logger?.('[BloomCallDebug]', entry.scope, entry.event, entry.details);
  return entry;
}

export function startCallDebugSession(scope, details = {}) {
  sessionId = `call-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  callDebug(scope, 'session-start', {
    ...details,
    browser: getBrowserDiagnostics(),
  });
  return sessionId;
}

export function resetCallDebugForTests() {
  entries = [];
  sessionId = null;
}
