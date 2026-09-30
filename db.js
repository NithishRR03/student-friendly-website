// db.js — SQLite. Automatically ensures database folder exists on Render.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, 
    name TEXT NOT NULL, 
    phone TEXT,
    email TEXT NOT NULL UNIQUE, 
    course TEXT, 
    job_field TEXT,
    consent_at TEXT, 
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS login_codes (
    email TEXT PRIMARY KEY, 
    code_hash TEXT NOT NULL, 
    expires_at INTEGER NOT NULL, 
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, 
    user_id TEXT NOT NULL, 
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS checklist_items (
    user_id TEXT NOT NULL, 
    item_id TEXT NOT NULL, 
    checked INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), 
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS resume_data (
    user_id TEXT PRIMARY KEY, 
    data TEXT NOT NULL, 
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS cv_checks (
    id TEXT PRIMARY KEY, 
    user_id TEXT NOT NULL, 
    word_count INTEGER, 
    suggestion_tag TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

module.exports = db;
