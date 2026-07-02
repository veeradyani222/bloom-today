import { callDebug, getBrowserDiagnostics } from './live-api/call-debug.js';

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function getChromeDeepLinkUrl(url = typeof window !== 'undefined' ? window.location.href : '') {
  if (url.startsWith('https://')) {
    return url.replace(/^https:/, 'googlechromes:');
  }
  if (url.startsWith('http://')) {
    return url.replace(/^http:/, 'googlechrome:');
  }
  return url;
}

export function isLikelySafariBrowser() {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const isWebKit = /WebKit/i.test(ua);
  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isDesktopSafari = /Safari/i.test(ua)
    && !/Chrome|Chromium|Android|Edg|OPR|Firefox|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);

  return (isIOSDevice() && isWebKit && !isOtherIOSBrowser) || isDesktopSafari;
}

export function getBrowserName() {
  if (typeof navigator === 'undefined') return 'Unknown browser';

  const ua = navigator.userAgent || '';
  if (/CriOS/i.test(ua)) return 'Chrome iOS';
  if (/FxiOS/i.test(ua)) return 'Firefox iOS';
  if (/EdgiOS/i.test(ua)) return 'Edge iOS';
  if (/OPiOS/i.test(ua)) return 'Opera iOS';
  if (/Edg/i.test(ua)) return 'Edge';
  if (/OPR|Opera/i.test(ua)) return 'Opera';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Chrome|Chromium/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Unknown browser';
}

export function getCallBrowserSupport() {
  if (isIOSDevice()) {
    return {
      supported: false,
      reason: 'ios-unsupported',
      browserName: getBrowserName(),
    };
  }

  if (isLikelySafariBrowser()) {
    return {
      supported: false,
      reason: 'safari-unsupported',
      browserName: getBrowserName(),
    };
  }

  return {
    supported: true,
    reason: null,
    browserName: getBrowserName(),
  };
}

function permissionTargetLabel({ audio, video }) {
  if (audio && video) return 'camera and microphone';
  if (video) return 'camera';
  return 'microphone';
}

export function formatMediaPermissionError(error, { audio = false, video = false } = {}) {
  const target = permissionTargetLabel({ audio, video });
  if (!error) {
    return `Could not access your ${target}.`;
  }

  if (error.name === 'NotAllowedError') {
    return `Permission denied for ${target}. Please allow access in Safari/browser settings and retry.`;
  }
  if (error.name === 'NotFoundError') {
    return `No ${target} device was found on this device.`;
  }
  if (error.name === 'NotReadableError') {
    return `Your ${target} is in use by another app. Close other apps and retry.`;
  }
  if (error.name === 'OverconstrainedError') {
    return `Could not start your ${target} with the requested constraints.`;
  }

  return error.message || `Could not access your ${target}.`;
}

export async function requestMediaPermissions({ audio = false, video = false } = {}) {
  if (!audio && !video) {
    throw new Error('requestMediaPermissions requires audio or video to be true.');
  }

  if (!window.isSecureContext) {
    callDebug('media-permissions', 'insecure-context', { audio, video, browser: getBrowserDiagnostics() });
    throw new Error('Camera and microphone require HTTPS (or localhost). Open this app over HTTPS and retry.');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    callDebug('media-permissions', 'get-user-media-missing', { audio, video, browser: getBrowserDiagnostics() });
    throw new Error('Camera/microphone access is not supported in this browser.');
  }

  try {
    callDebug('media-permissions', 'request-start', { audio, video, browser: getBrowserDiagnostics() });
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
    callDebug('media-permissions', 'request-ok', {
      audio,
      video,
      audioTracks: stream.getAudioTracks().map((track) => ({
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: typeof track.getSettings === 'function' ? track.getSettings() : {},
      })),
      videoTracks: stream.getVideoTracks().map((track) => ({
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: typeof track.getSettings === 'function' ? track.getSettings() : {},
      })),
    });
    return stream;
  } catch (error) {
    callDebug('media-permissions', 'request-failed', {
      audio,
      video,
      error,
    });
    throw new Error(formatMediaPermissionError(error, { audio, video }));
  }
}
