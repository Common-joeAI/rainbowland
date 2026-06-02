/**
 * Rainbow Land — Coin Ledger & Gift Engine
 *
 * Stores everything in SQLite (no external DB needed).
 * All coin movements are atomic DB transactions — no honor system.
 *
 * Rules:
 *  - Coins are only credited AFTER PayPal IPN verification
 *  - Gift = atomic: debit sender, credit creator, log event — or nothing
 *  - 1 coin in = 1 coin received, always (zero house cut on gifts)
 *  - Rate limiting: max 50 gifts/minute per user, max 10k coins/min
 *  - Duplicate IPN protection: txn_id stored, reused txn_ids rejected
 */
import { mkdirSync } from 'fs'


import Database from 'better-sqlite3'
import { randomBytes, createHmac } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.COIN_DB || path.join(__dirname, 'data', 'coins.db')

// ── Schema ────────────────────────────────────────────────────────────────────
let db

export function initCoinDB() {
  try { mkdirSync(path.dirname(DB_PATH), { recursive: true }) } catch {}

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id     TEXT PRIMARY KEY,
      handle      TEXT NOT NULL,
      balance     INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      paypal_txn  TEXT UNIQUE NOT NULL,
      coins       INTEGER NOT NULL,
      usd_cents   INTEGER NOT NULL,
      verified_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES wallets(user_id)
    );

    CREATE TABLE IF NOT EXISTS gifts (
      id          TEXT PRIMARY KEY,
      sender_id   TEXT NOT NULL,
      creator_id  TEXT NOT NULL,
      gift_id     TEXT NOT NULL,
      qty         INTEGER NOT NULL DEFAULT 1,
      coins_each  INTEGER NOT NULL,
      total_coins INTEGER NOT NULL,
      stream_key  TEXT,
      sent_at     INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (sender_id)  REFERENCES wallets(user_id),
      FOREIGN KEY (creator_id) REFERENCES wallets(user_id)
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      user_id       TEXT PRIMARY KEY,
      gifts_this_min INTEGER NOT NULL DEFAULT 0,
      coins_this_min INTEGER NOT NULL DEFAULT 0,
      window_start   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_gifts_creator  ON gifts(creator_id, sent_at);
    CREATE INDEX IF NOT EXISTS idx_gifts_sender   ON gifts(sender_id, sent_at);
    CREATE INDEX IF NOT EXISTS idx_gifts_stream   ON gifts(stream_key, sent_at);
  `)

  return db
}

// ── Wallet helpers ────────────────────────────────────────────────────────────
function ensureWallet(userId, handle) {
  db.prepare(`
    INSERT INTO wallets (user_id, handle, balance, total_earned)
    VALUES (?, ?, 0, 0)
    ON CONFLICT(user_id) DO UPDATE SET handle = excluded.handle
  `).run(userId, handle || userId)
}

export function getBalance(userId) {
  const row = db.prepare('SELECT balance, total_earned FROM wallets WHERE user_id = ?').get(userId)
  return row || { balance: 0, total_earned: 0 }
}

// ── Purchase verification ──────────────────────────────────────────────────────
// COIN_PACKS must match the frontend exactly
export const COIN_PACKS = [
  { coins: 100,  usd_cents: 99   },
  { coins: 500,  usd_cents: 499  },
  { coins: 1200, usd_cents: 999  },
  { coins: 5000, usd_cents: 3999 },
]

/**
 * Call this ONLY after IPN verification succeeds.
 * Prevents double-credit via UNIQUE constraint on paypal_txn.
 */
export function creditCoins(userId, handle, paypalTxnId, coins, usdCents) {
  ensureWallet(userId, handle)

  const purchase = db.transaction(() => {
    const id = randomBytes(8).toString('hex')
    // This will throw if paypal_txn is duplicate (UNIQUE constraint)
    db.prepare(`
      INSERT INTO purchases (id, user_id, paypal_txn, coins, usd_cents)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, paypalTxnId, coins, usdCents)

    db.prepare(`
      UPDATE wallets SET balance = balance + ? WHERE user_id = ?
    `).run(coins, userId)

    return db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(userId)
  })()

  return purchase
}

// ── Rate limiting ──────────────────────────────────────────────────────────────
const MAX_GIFTS_PER_MIN  = 50
const MAX_COINS_PER_MIN  = 10000

function checkRateLimit(userId, coinsToSpend) {
  const now = Math.floor(Date.now() / 1000)
  const row = db.prepare('SELECT * FROM rate_limits WHERE user_id = ?').get(userId)

  if (!row || (now - row.window_start) >= 60) {
    // Reset window
    db.prepare(`
      INSERT INTO rate_limits (user_id, gifts_this_min, coins_this_min, window_start)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        gifts_this_min = 1,
        coins_this_min = ?,
        window_start   = ?
    `).run(userId, coinsToSpend, now, coinsToSpend, now)
    return { ok: true }
  }

  if (row.gifts_this_min >= MAX_GIFTS_PER_MIN) {
    return { ok: false, reason: 'Too many gifts — slow down a bit 💜' }
  }
  if (row.coins_this_min + coinsToSpend > MAX_COINS_PER_MIN) {
    return { ok: false, reason: 'Coin spend limit reached for this minute' }
  }

  db.prepare(`
    UPDATE rate_limits SET
      gifts_this_min = gifts_this_min + 1,
      coins_this_min = coins_this_min + ?
    WHERE user_id = ?
  `).run(coinsToSpend, userId)

  return { ok: true }
}

// ── Gift transaction ───────────────────────────────────────────────────────────
export const GIFT_CATALOGUE = {
  rose:    { coins: 5    },
  rainbow: { coins: 20   },
  sparkle: { coins: 50   },
  crown:   { coins: 100  },
  heart:   { coins: 200  },
  rocket:  { coins: 500  },
  diamond: { coins: 1000 },
  galaxy:  { coins: 5000 },
}

/**
 * Atomically send a gift:
 *  1. Validate gift exists & qty
 *  2. Rate limit check
 *  3. Debit sender, credit creator — in one transaction
 *  4. Log to gifts table
 *
 * Returns { ok, giftRecord } or { ok: false, reason }
 */
export function sendGift({ senderId, senderHandle, creatorId, creatorHandle, giftId, qty = 1, streamKey }) {
  const giftDef = GIFT_CATALOGUE[giftId]
  if (!giftDef)          return { ok: false, reason: 'Unknown gift' }
  if (qty < 1 || qty > 99) return { ok: false, reason: 'Invalid quantity' }

  const totalCoins = giftDef.coins * qty

  const rateCheck = checkRateLimit(senderId, totalCoins)
  if (!rateCheck.ok) return rateCheck

  try {
    const result = db.transaction(() => {
      ensureWallet(senderId, senderHandle)
      ensureWallet(creatorId, creatorHandle)

      const sender = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(senderId)
      if (!sender || sender.balance < totalCoins) {
        throw new Error('insufficient_coins')
      }

      // Atomic debit + credit
      db.prepare('UPDATE wallets SET balance = balance - ? WHERE user_id = ?').run(totalCoins, senderId)
      db.prepare('UPDATE wallets SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?')
        .run(totalCoins, totalCoins, creatorId)

      const id = randomBytes(8).toString('hex')
      db.prepare(`
        INSERT INTO gifts (id, sender_id, creator_id, gift_id, qty, coins_each, total_coins, stream_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, senderId, creatorId, giftId, qty, giftDef.coins, totalCoins, streamKey || null)

      return {
        id,
        senderBalance:  db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(senderId).balance,
        creatorBalance: db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(creatorId).balance,
        totalCoins,
      }
    })()

    return { ok: true, ...result }
  } catch (err) {
    if (err.message === 'insufficient_coins') {
      return { ok: false, reason: 'Not enough coins' }
    }
    throw err
  }
}

// ── Leaderboard & stats ────────────────────────────────────────────────────────
export function getTopGifters(creatorId, limit = 10) {
  return db.prepare(`
    SELECT w.handle, SUM(g.total_coins) as total_coins, COUNT(*) as gift_count
    FROM gifts g JOIN wallets w ON g.sender_id = w.user_id
    WHERE g.creator_id = ?
    GROUP BY g.sender_id
    ORDER BY total_coins DESC
    LIMIT ?
  `).all(creatorId, limit)
}

export function getRecentGifts(streamKey, limit = 20) {
  return db.prepare(`
    SELECT g.*, ws.handle as sender_handle, wc.handle as creator_handle
    FROM gifts g
    JOIN wallets ws ON g.sender_id = ws.user_id
    JOIN wallets wc ON g.creator_id = wc.user_id
    WHERE g.stream_key = ?
    ORDER BY g.sent_at DESC
    LIMIT ?
  `).all(streamKey, limit)
}

export function getCreatorEarnings(creatorId) {
  const wallet = db.prepare('SELECT balance, total_earned FROM wallets WHERE user_id = ?').get(creatorId)
  const byGift = db.prepare(`
    SELECT gift_id, SUM(total_coins) as total, COUNT(*) as count
    FROM gifts WHERE creator_id = ?
    GROUP BY gift_id ORDER BY total DESC
  `).all(creatorId)
  return { wallet: wallet || { balance: 0, total_earned: 0 }, byGift }
}
