
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH   = path.join(__dirname, 'data', 'videos.db')

let db

export function initVideoDB() {
  db = new Database(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id          TEXT PRIMARY KEY,
      creator_id  TEXT NOT NULL,
      handle      TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar      TEXT DEFAULT '🌈',
      pronouns    TEXT DEFAULT '',
      pride_flag  TEXT DEFAULT 'rainbow',
      caption     TEXT NOT NULL,
      hashtags    TEXT DEFAULT '[]',
      filename    TEXT NOT NULL,
      url         TEXT NOT NULL,
      likes       INTEGER DEFAULT 0,
      comments    INTEGER DEFAULT 0,
      shares      INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_likes (
      video_id TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      PRIMARY KEY (video_id, user_id)
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      handle     TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar     TEXT DEFAULT '🌈',
      text       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
}

export function createVideo({ id, creatorId, handle, displayName, avatar, pronouns, prideFlag, caption, hashtags, filename, url }) {
  db.prepare(`
    INSERT INTO videos (id, creator_id, handle, display_name, avatar, pronouns, pride_flag, caption, hashtags, filename, url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, creatorId, handle, displayName, avatar || '🌈', pronouns || '', prideFlag || 'rainbow', caption, JSON.stringify(hashtags || []), filename, url)
  return getVideo(id)
}

export function getVideo(id) {
  const v = db.prepare('SELECT * FROM videos WHERE id = ?').get(id)
  if (!v) return null
  return format(v)
}

export function listVideos({ limit = 20, offset = 0, tag = null, query = null } = {}) {
  let sql = 'SELECT * FROM videos'
  const params = []
  const wheres = []
  if (tag)   { wheres.push("hashtags LIKE ?"); params.push(`%"${tag}"%`) }
  if (query) { wheres.push("(caption LIKE ? OR handle LIKE ? OR display_name LIKE ?)"); params.push(`%${query}%`, `%${query}%`, `%${query}%`) }
  if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ')
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)
  return db.prepare(sql).all(...params).map(format)
}

export function toggleLike(videoId, userId) {
  const exists = db.prepare('SELECT 1 FROM video_likes WHERE video_id=? AND user_id=?').get(videoId, userId)
  if (exists) {
    db.prepare('DELETE FROM video_likes WHERE video_id=? AND user_id=?').run(videoId, userId)
    db.prepare('UPDATE videos SET likes = MAX(0, likes - 1) WHERE id=?').run(videoId)
    return { liked: false }
  } else {
    db.prepare('INSERT OR IGNORE INTO video_likes (video_id, user_id) VALUES (?,?)').run(videoId, userId)
    db.prepare('UPDATE videos SET likes = likes + 1 WHERE id=?').run(videoId)
    return { liked: true }
  }
}

export function addComment(videoId, { userId, handle, displayName, avatar, text }) {
  const r = db.prepare(`
    INSERT INTO video_comments (video_id, user_id, handle, display_name, avatar, text)
    VALUES (?,?,?,?,?,?)
  `).run(videoId, userId, handle, displayName, avatar || '🌈', text)
  db.prepare('UPDATE videos SET comments = comments + 1 WHERE id=?').run(videoId)
  return db.prepare('SELECT * FROM video_comments WHERE id=?').get(r.lastInsertRowid)
}

export function getComments(videoId) {
  return db.prepare('SELECT * FROM video_comments WHERE video_id=? ORDER BY created_at ASC').all(videoId)
}

export function getUserLikes(userId, videoIds) {
  if (!videoIds.length) return []
  const placeholders = videoIds.map(() => '?').join(',')
  return db.prepare(`SELECT video_id FROM video_likes WHERE user_id=? AND video_id IN (${placeholders})`).all(userId, ...videoIds).map(r => r.video_id)
}

function format(v) {
  return {
    id:          v.id,
    creator: {
      id:          v.creator_id,
      handle:      v.handle,
      name:        v.display_name,
      avatar:      v.avatar,
      pronouns:    v.pronouns,
      prideFlag:   v.pride_flag,
    },
    caption:     v.caption,
    hashtags:    JSON.parse(v.hashtags || '[]'),
    videoUrl:    v.url,
    filename:    v.filename,
    likes:       v.likes,
    comments:    v.comments,
    shares:      v.shares,
    createdAt:   v.created_at,
  }
}
