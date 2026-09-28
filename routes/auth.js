const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { newSession, sha, requireUser } = require('../auth');
const { sendCode } = require('../mailer');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const clip = (s, n) => String(s).trim().slice(0, n);
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254;
const phoneOk = (p) => /^[+\d][\d\s()-]{6,19}$/.test(String(p).trim());
const dev = () => process.env.DEV_SHOW_CODE === 'true';
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, course: u.course, job_field: u.job_field });

async function issueCode(email) {
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare('INSERT OR REPLACE INTO login_codes VALUES (?, ?, ?, 0)').run(email, sha(code), Date.now() + 10 * 60 * 1000);
  await sendCode(email, code);
  return code;
}

router.post('/register', limiter, async (req, res, next) => {
  try {
    const { name, phone, email, course, job_field, consent } = req.body || {};
    const e = String(email || '').trim().toLowerCase();
    if (!emailOk(e)) return res.status(400).json({ error: 'invalid_email' });
    if (!name || !phone || !course || !job_field) return res.status(400).json({ error: 'missing_fields' });
    if (!phoneOk(phone)) return res.status(400).json({ error: 'invalid_phone' });
    if (consent !== true) return res.status(400).json({ error: 'consent_required' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(e)) return res.status(409).json({ error: 'email_exists' });
    db.prepare(`INSERT INTO users (id, name, phone, email, course, job_field, consent_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`)
      .run(uuid(), clip(name, 100), clip(phone, 25), e, clip(course, 150), clip(job_field, 150));
    const code = await issueCode(e);
    res.status(201).json({ ok: true, ...(dev() ? { devCode: code } : {}) });
  } catch (err) { next(err); }
});

// Same response whether or not the email exists, so it can't be used to probe who has an account.
router.post('/request-code', limiter, async (req, res, next) => {
  try {
    const e = String(req.body?.email || '').trim().toLowerCase();
    if (!emailOk(e)) return res.status(400).json({ error: 'invalid_email' });
    let code = null;
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(e)) code = await issueCode(e);
    res.json({ ok: true, ...(dev() && code ? { devCode: code } : {}) });
  } catch (err) { next(err); }
});

router.post('/verify', limiter, (req, res) => {
  const e = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const row = db.prepare('SELECT * FROM login_codes WHERE email = ?').get(e);
  if (!row || row.expires_at < Date.now()) return res.status(400).json({ error: 'bad_code' });
  if (row.attempts >= 5) return res.status(429).json({ error: 'too_many_attempts' });
  if (row.code_hash !== sha(code)) {
    db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').run(e);
    return res.status(400).json({ error: 'bad_code' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(e);
  if (!user) return res.status(400).json({ error: 'bad_code' });
  db.prepare('DELETE FROM login_codes WHERE email = ?').run(e);
  res.json({ token: newSession(user.id), user: pub(user) });
});

router.post('/logout', requireUser, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(req.header('Authorization').slice(7)));
  res.json({ ok: true });
});

module.exports = router;
