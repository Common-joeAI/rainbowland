/**
 * Rainbow Land — Auth Module
 * Handles user registration, login, JWT issuance, and session validation.
 * Users table lives in the same SQLite DB as coins.
 *
 * Roles:
 *   'viewer' — default, can watch, chat, gift
 *   'host'   — can go live, manage stream key, see earnings
 *   'admin'  — full access (set manually in DB)
 */

import Database from 'better-sqlite3'
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH   = path.join(__dirname, 'data', 'coins.db')

const JWT_SECRET = process.env.JWT_SECRET || 'rl-jwt-secret-change-me-in-prod'
const TOKEN_TTL  = 30 * 24 * 60 * 60 * 1000 // 30 days in ms

// ── DB ────────────────────────────────────────────────────────────────────────
let db

export function initAuthDB() {
  db = new Database(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      handle      TEXT UNIQUE NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '🌈',
      pronouns    TEXT DEFAULT 'they/them',
      bio         TEXT DEFAULT '',
      pride_flag  TEXT DEFAULT 'rainbow',
      role        TEXT DEFAULT 'viewer',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      last_login  INTEGER
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token       TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `)
}

// ── Password hashing ──────────────────────────────────────────────────────────
function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password, salt, hash) {
  const attempt = Buffer.from(hashPassword(password, salt), 'hex')
  const stored  = Buffer.from(hash, 'hex')
  return attempt.length === stored.length && timingSafeEqual(attempt, stored)
}

// ── Minimal JWT (header.payload.sig, HMAC-SHA256) ─────────────────────────────
function signJWT(payload) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body    = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url')
  const sig     = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyJWT(token) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  if (sig !== expected) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp && payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// ── Refresh token ─────────────────────────────────────────────────────────────
function issueRefreshToken(userId) {
  const token     = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + TOKEN_TTL
  db.prepare(`
    INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)
  `).run(token, userId, expiresAt)
  return token
}

function issueTokens(user) {
  const accessToken = signJWT({
    sub:  user.id,
    handle: user.handle,
    role: user.role,
    name: user.display_name,
    avatar: user.avatar_emoji,
    exp:  Date.now() + 2 * 60 * 60 * 1000, // 2 hours
  })
  const refreshToken = issueRefreshToken(user.id)
  return { accessToken, refreshToken }
}

// ── Handle normalization ───────────────────────────────────────────────────────
function normalizeHandle(handle) {
  return handle.startsWith('@') ? handle.toLowerCase() : `@${handle.toLowerCase()}`
}

// ── Register ──────────────────────────────────────────────────────────────────
export function registerUser({ handle, email, password, displayName, role = 'viewer' }) {
  if (!handle || !email || !password || !displayName) {
    return { ok: false, error: 'All fields required' }
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' }
  }

  const normalHandle = normalizeHandle(handle)
  const normalEmail  = email.toLowerCase().trim()

  // Check for duplicates
  const existing = db.prepare('SELECT id FROM users WHERE handle = ? OR email = ?').get(normalHandle, normalEmail)
  if (existing) {
    const byHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(normalHandle)
    if (byHandle) return { ok: false, error: 'Handle already taken' }
    return { ok: false, error: 'Email already registered' }
  }

  const id   = randomBytes(16).toString('hex')
  const salt = randomBytes(16).toString('hex')
  const hash = hashPassword(password, salt)

  db.prepare(`
    INSERT INTO users (id, handle, email, display_name, role, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, normalHandle, normalEmail, displayName.trim(), role, hash, salt, Date.now())

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  const tokens = issueTokens(user)
  return { ok: true, user: safeUser(user), ...tokens }
}

// ── Login ─────────────────────────────────────────────────────────────────────
export function loginUser({ identifier, password }) {
  // identifier can be email OR handle
  const normalId = identifier.includes('@') && identifier.includes('.')
    ? identifier.toLowerCase().trim()           // looks like email
    : normalizeHandle(identifier)               // treat as handle

  const user = db.prepare('SELECT * FROM users WHERE email = ? OR handle = ?').get(normalId, normalId)
  if (!user) return { ok: false, error: 'Invalid credentials' }

  if (!verifyPassword(password, user.password_salt, user.password_hash)) {
    return { ok: false, error: 'Invalid credentials' }
  }

  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(Date.now(), user.id)
  const tokens = issueTokens(user)
  return { ok: true, user: safeUser(user), ...tokens }
}

// ── Refresh ───────────────────────────────────────────────────────────────────
export function refreshAccessToken(refreshToken) {
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(refreshToken)
  if (!row || row.expires_at < Date.now()) {
    return { ok: false, error: 'Invalid or expired refresh token' }
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id)
  if (!user) return { ok: false, error: 'User not found' }

  // Rotate refresh token
  db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken)
  const tokens = issueTokens(user)
  return { ok: true, user: safeUser(user), ...tokens }
}

// ── Update profile ────────────────────────────────────────────────────────────
export function updateProfile(userId, { displayName, bio, pronouns, prideFlag, avatarEmoji }) {
  db.prepare(`
    UPDATE users SET
      display_name = COALESCE(?, display_name),
      bio = COALESCE(?, bio),
      pronouns = COALESCE(?, pronouns),
      pride_flag = COALESCE(?, pride_flag),
      avatar_emoji = COALESCE(?, avatar_emoji)
    WHERE id = ?
  `).run(displayName || null, bio || null, pronouns || null, prideFlag || null, avatarEmoji || null, userId)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  return { ok: true, user: safeUser(user) }
}

// ── Upgrade to host ───────────────────────────────────────────────────────────
export function upgradeToHost(userId) {
  db.prepare("UPDATE users SET role = 'host' WHERE id = ? AND role = 'viewer'").run(userId)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  return { ok: true, user: safeUser(user) }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeUser(u) {
  const { password_hash, password_salt, ...safe } = u
  return safe
}

export function getUserById(id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  return u ? safeUser(u) : null
}
