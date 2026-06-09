// Auth helpers — token stored in localStorage

const TOKEN_KEY    = 'robowar_token';
const USER_KEY     = 'robowar_user';
const IS_ADMIN_KEY = 'robowar_is_admin';

export function getToken()   { return localStorage.getItem(TOKEN_KEY); }
export function getUser()    { return localStorage.getItem(USER_KEY); }
export function isLoggedIn() { return !!getToken(); }
export function isAdmin()    { return localStorage.getItem(IS_ADMIN_KEY) === '1'; }

export function saveSession(token, username, is_admin = 0) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
  localStorage.setItem(IS_ADMIN_KEY, is_admin ? '1' : '0');
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(IS_ADMIN_KEY);
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function register(username, password) {
  const data = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  saveSession(data.token, data.username, data.is_admin);
  return data;
}

export async function login(username, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  saveSession(data.token, data.username, data.is_admin);
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  return apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function forgotPassword(email) {
  return apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token, newPassword) {
  return apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export { apiFetch };
