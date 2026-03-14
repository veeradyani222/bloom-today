function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isLikelySafariBrowser() {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const isWebKit = /WebKit/i.test(ua);
  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isDesktopSafari = /Safari/i.test(ua)
    && !/Chrome|Chromium|Android|Edg|OPR|Firefox/i.test(ua);

  return (isIOSDevice() && isWebKit && !isOtherIOSBrowser) || isDesktopSafari;
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
    throw new Error('Camera and microphone require HTTPS (or localhost). Open this app over HTTPS and retry.');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera/microphone access is not supported in this browser.');
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video });
  } catch (error) {
    throw new Error(formatMediaPermissionError(error, { audio, video }));
  }
}
