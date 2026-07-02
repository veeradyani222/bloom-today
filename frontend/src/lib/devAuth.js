import { API_BASE_URL } from './api.js';

export function shouldShowDevAdminLogin(env = import.meta.env) {
  return Boolean(env?.DEV);
}

export async function requestDevAdminSession({
  apiBaseUrl = API_BASE_URL,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(`${apiBaseUrl}/api/auth/dev-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Dev admin login failed.');
    error.status = response.status;
    throw error;
  }

  return data;
}
