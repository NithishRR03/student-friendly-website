const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const usingCustomDir = Boolean(process.env.DATA_DIR);
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    course TEXT,
    job_field TEXT,
    location TEXT,
    consent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS otps (
    identifier TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resume_data (
    user_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Add the location column to older databases only if it is really missing
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('location')) {
  db.exec(`ALTER TABLE users ADD COLUMN location TEXT DEFAULT '-'`);
  console.log('[db] Added missing "location" column to users');
}

// ---- Startup diagnostics: tells you immediately if data is being lost between deploys ----
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
console.log(`[db] File: ${dbPath}`);
console.log(`[db] Users at startup: ${userCount}`);
if (!usingCustomDir && process.env.NODE_ENV === 'production') {
  console.warn(
    '[db] WARNING: DATA_DIR is not set. The database is inside the app folder and will be ' +
    'erased on redeploy on most hosts. Attach a persistent disk and set DATA_DIR to its mount path.'
  );
}

// Clean up expired OTPs and sessions now and then (keeps the file small)
function cleanupExpired() {
  try {
    db.prepare(`DELETE FROM otps WHERE expires_at < ?`).run(new Date().toISOString());
    db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(new Date().toISOString());
  } catch (e) {
    console.error('[db] cleanup error:', e.message);
  }
}
// NOTE: assumes expires_at is stored as an ISO string. Remove this block if yours uses another format.
setInterval(cleanupExpired, 60 * 60 * 1000).unref();

module.exports = db;
