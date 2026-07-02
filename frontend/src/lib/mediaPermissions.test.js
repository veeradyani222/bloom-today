import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  getCallBrowserSupport,
  isIOSDevice,
  isLikelySafariBrowser,
} from './mediaPermissions.js';

const originalNavigator = globalThis.navigator;

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  setNavigator(originalNavigator);
});

test('desktop Chrome on Mac is supported for calls', () => {
  setNavigator({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  });

  assert.deepEqual(getCallBrowserSupport(), {
    supported: true,
    reason: null,
    browserName: 'Chrome',
  });
});

test('desktop Safari on Mac is blocked with a Safari reason', () => {
  setNavigator({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  });

  assert.equal(isLikelySafariBrowser(), true);
  assert.deepEqual(getCallBrowserSupport(), {
    supported: false,
    reason: 'safari-unsupported',
    browserName: 'Safari',
  });
});

test('Chrome on iPhone is blocked as iOS, not mislabeled as Safari', () => {
  setNavigator({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.0.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
  });

  assert.equal(isIOSDevice(), true);
  assert.equal(isLikelySafariBrowser(), false);
  assert.deepEqual(getCallBrowserSupport(), {
    supported: false,
    reason: 'ios-unsupported',
    browserName: 'Chrome iOS',
  });
});

test('Safari on iPad is blocked as iOS for clearer device guidance', () => {
  setNavigator({
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    platform: 'iPad',
    maxTouchPoints: 5,
  });

  assert.deepEqual(getCallBrowserSupport(), {
    supported: false,
    reason: 'ios-unsupported',
    browserName: 'Safari',
  });
});
