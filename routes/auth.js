const crypto = require('crypto');
const db = require('./db');

function sha(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, datetime('now', '+30 days'))
  `).run(sha(token), userId);
  return token;
}

function requireUser(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  const tokenHash = sha(auth.slice(7));
  const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > datetime("now")').get(tokenHash);
  
  if (!session) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  next();
}

module.exports = { sha, newSession, requireUser };
