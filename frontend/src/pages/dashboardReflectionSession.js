export const PENDING_REFLECTION_KEY = 'bloom_pending_reflection';
export const PENDING_CALL_ID_KEY = 'bloom_pending_call_id';

export function markPendingReflection() {
  try {
    sessionStorage.setItem(PENDING_REFLECTION_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures; polling can still rely on activity data.
  }
}

export function setPendingReflectionCallId(callId) {
  if (!callId) return;
  try {
    sessionStorage.setItem(PENDING_CALL_ID_KEY, String(callId));
  } catch {
    // Ignore storage failures.
  }
}

export function getPendingReflectionCallId() {
  try {
    return sessionStorage.getItem(PENDING_CALL_ID_KEY) || null;
  } catch {
    return null;
  }
}

export function hasPendingReflectionCallId() {
  return Boolean(getPendingReflectionCallId());
}

export function clearPendingReflection() {
  try {
    sessionStorage.removeItem(PENDING_REFLECTION_KEY);
    sessionStorage.removeItem(PENDING_CALL_ID_KEY);
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

export function isReflectionReady(insights) {
  const pendingCallId = getPendingReflectionCallId();
  if (!pendingCallId) {
    return Boolean(insights?.mom?.current);
  }
  return insights?.mom?.currentCallId === pendingCallId;
}
