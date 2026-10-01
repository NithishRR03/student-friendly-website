rm db.js
cat > db.js <<'EOF'
// db.js — SQLite. Swap for Postgres later without touching the routes' logic.
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'data', 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL DEFAULT '', course TEXT NOT NULL, job_field TEXT NOT NULL,
    consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS checklist_items (
    user_id TEXT NOT NULL, item_id TEXT NOT NULL, checked INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS cv_checks (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, word_count INTEGER, suggestion_tag TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS resume_data (
    user_id TEXT PRIMARY KEY, data TEXT NOT NULL, resume_text TEXT, resume_generated_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
// Upgrade path for databases created before the 'location' column existed.
const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!cols.includes('location')) db.exec("ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT ''");
module.exports = db;
EOF
