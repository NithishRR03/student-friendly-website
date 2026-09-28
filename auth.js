// auth.js — session tokens (random, stored hashed) issued after an emailed one-time code.
const crypto = require('crypto');
const db = require('./db');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function lookup(req) {
  const h = req.header('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(sha(t), Date.now()) || null;
}
function requireUser(req, res, next) {
  const u = lookup(req);
  if (!u) return res.status(401).json({ error: 'not_logged_in' });
  req.user = u; next();
}
function optionalUser(req, res, next) { req.user = lookup(req); next(); }
function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + 30 * 864e5);
  return token;
}
module.exports = { requireUser, optionalUser, newSession, sha };
