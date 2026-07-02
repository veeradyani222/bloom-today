import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { callDebug, getBrowserDiagnostics, resetCallDebugForTests } from './call-debug.js';

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;
const originalConsole = globalThis.console;

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  resetCallDebugForTests();
  setGlobal('window', originalWindow);
  setGlobal('navigator', originalNavigator);
  setGlobal('document', originalDocument);
  setGlobal('console', originalConsole);
});

test('callDebug stores sanitized logs and exposes a dump helper', () => {
  const stored = {};
  const lines = [];

  setGlobal('window', {
    location: { href: 'https://example.test/call?token=secret' },
    localStorage: {
      getItem: (key) => stored[key] || null,
      setItem: (key, value) => { stored[key] = value; },
      removeItem: (key) => { delete stored[key]; },
    },
  });
  setGlobal('navigator', {
    userAgent: 'TestBrowser',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    mediaDevices: { getUserMedia() {} },
  });
  setGlobal('document', { visibilityState: 'visible' });
  setGlobal('console', { log: (...args) => lines.push(args) });

  callDebug('voice', 'connect-start', {
    token: 'secret-token',
    apiKey: 'secret-api-key',
    nested: { data: 'raw-audio' },
  });

  const dump = globalThis.window.__bloomCallDebug.dump();
  assert.match(dump, /connect-start/);
  assert.doesNotMatch(dump, /secret-token|secret-api-key|raw-audio/);
  assert.equal(lines.length, 1);
});

test('callDebug drops hot audio-path logs unless verbose debugging is enabled', () => {
  const stored = {};
  const lines = [];

  setGlobal('window', {
    localStorage: {
      setItem: (key, value) => { stored[key] = value; },
      removeItem: (key) => { delete stored[key]; },
    },
  });
  setGlobal('console', { log: (...args) => lines.push(args) });

  callDebug('live-client', 'send-realtime-input', {
    mimeType: 'audio/pcm;rate=16000',
    payloadChars: 684,
  });

  assert.equal(globalThis.window.__bloomCallDebug, undefined);
  assert.deepEqual(stored, {});
  assert.equal(lines.length, 0);
});

test('getBrowserDiagnostics records Safari-relevant media and audio capabilities', () => {
  setGlobal('window', {
    isSecureContext: true,
    AudioContext: function AudioContext() {},
    webkitAudioContext: undefined,
  });
  setGlobal('navigator', {
    userAgent: 'Mozilla/5.0 iPhone Safari',
    platform: 'iPhone',
    maxTouchPoints: 5,
    mediaDevices: { getUserMedia() {}, enumerateDevices() {} },
  });
  setGlobal('document', { visibilityState: 'visible' });

  const diagnostics = getBrowserDiagnostics();

  assert.equal(diagnostics.secureContext, true);
  assert.equal(diagnostics.hasGetUserMedia, true);
  assert.equal(diagnostics.hasAudioContext, true);
  assert.equal(diagnostics.platform, 'iPhone');
});
