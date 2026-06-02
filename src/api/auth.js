/**
 * Rainbow Land — Auth API client
 */
import { LIVE_SERVER_HTTP } from './liveServer'

const API = LIVE_SERVER_HTTP

function getTokens() {
  return {
    accessToken:  localStorage.getItem('rl_access_token'),
    refreshToken: localStorage.getItem('rl_refresh_token'),
  }
}

function saveTokens({ accessToken, refreshToken }) {
  if (accessToken)  localStorage.setItem('rl_access_token', accessToken)
  if (refreshToken) localStorage.setItem('rl_refresh_token', refreshToken)
}

function clearTokens() {
  localStorage.removeItem('rl_access_token')
  localStorage.removeItem('rl_refresh_token')
  localStorage.removeItem('rl_user')
}

export function getAccessToken() {
  return localStorage.getItem('rl_access_token')
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('rl_user') || 'null')
  } catch { return null }
}

function authHeaders() {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

// ── Register ──────────────────────────────────────────────────────────────────
export async function register({ handle, email, password, displayName, role = 'viewer' }) {
  const { ok, data } = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: { handle, email, password, displayName, role },
  })
  if (ok && data.accessToken) {
    saveTokens(data)
    localStorage.setItem('rl_user', JSON.stringify(data.user))
  }
  return { ok, ...data }
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function login({ identifier, password }) {
  const { ok, data } = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: { identifier, password },
  })
  if (ok && data.accessToken) {
    saveTokens(data)
    localStorage.setItem('rl_user', JSON.stringify(data.user))
  }
  return { ok, ...data }
}

// ── Logout ────────────────────────────────────────────────────────────────────
export function logout() {
  clearTokens()
}

// ── Refresh ───────────────────────────────────────────────────────────────────
export async function refreshSession() {
  const { refreshToken } = getTokens()
  if (!refreshToken) return null
  const { ok, data } = await apiFetch('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  })
  if (ok && data.accessToken) {
    saveTokens(data)
    localStorage.setItem('rl_user', JSON.stringify(data.user))
    return data
  }
  clearTokens()
  return null
}

// ── Get current user ──────────────────────────────────────────────────────────
export async function fetchMe() {
  const { ok, data } = await apiFetch('/api/auth/me')
  if (ok) localStorage.setItem('rl_user', JSON.stringify(data.user))
  return ok ? data.user : null
}

// ── Update profile ────────────────────────────────────────────────────────────
export async function updateProfile(fields) {
  const { ok, data } = await apiFetch('/api/auth/profile', {
    method: 'PUT',
    body: fields,
  })
  if (ok) localStorage.setItem('rl_user', JSON.stringify(data.user))
  return { ok, ...data }
}

// ── Become host ───────────────────────────────────────────────────────────────
export async function becomeHost() {
  const { ok, data } = await apiFetch('/api/auth/become-host', { method: 'POST' })
  if (ok) {
    localStorage.setItem('rl_user', JSON.stringify(data.user))
    // Re-fetch tokens with new role via refresh
    await refreshSession()
  }
  return { ok, ...data }
}

// ── Check if logged in ────────────────────────────────────────────────────────
export function isLoggedIn() {
  return !!getAccessToken() && !!getStoredUser()
}
