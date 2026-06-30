export const PENDING_REFLECTION_KEY = 'bloom_pending_reflection';

export function markPendingReflection() {
  try {
    sessionStorage.setItem(PENDING_REFLECTION_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures; polling can still rely on activity data.
  }
}

export function clearPendingReflection() {
  try {
    sessionStorage.removeItem(PENDING_REFLECTION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function hasPendingReflectionMarker() {
  try {
    return Boolean(sessionStorage.getItem(PENDING_REFLECTION_KEY));
  } catch {
    return false;
  }
}
