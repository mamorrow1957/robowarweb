// Auth helpers — token stored in localStorage

const TOKEN_KEY = 'robowar_token';
const USER_KEY  = 'robowar_user';

export function getToken()    { return localStorage.getItem(TOKEN_KEY); }
export function getUser()     { return localStorage.getItem(USER_KEY); }
export function isLoggedIn()  { return !!getToken(); }

export function saveSession(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
  saveSession(data.token, data.username);
  return data;
}

export async function login(username, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  saveSession(data.token, data.username);
  return data;
}

export { apiFetch };
