// auth.js — sign in with Google. The browser gets a signed ID token from Google; we verify it
// here (signature, audience = our client ID, verified email) and then start our own session.
const express = require('express');
const { v4: uuid } = require('uuid');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { newSession, sha, requireUser } = require('../auth');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const clip = (s, n) => String(s).trim().slice(0, n);
const phoneOk = (p) => /^[+\d][\d\s()-]{6,19}$/.test(String(p).trim());
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, course: u.course, job_field: u.job_field });
let client = null;

// Existing user: send {credential}. New user: first call returns {needs_profile:true}; call again
// with {credential, name, phone, course, job_field, consent:true} to create the account.
router.post('/google', limiter, async (req, res, next) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: 'google_not_configured' });
    client = client || new OAuth2Client(clientId);
    let p;
    try { p = (await client.verifyIdToken({ idToken: String(req.body?.credential || ''), audience: clientId })).getPayload(); }
    catch { return res.status(401).json({ error: 'bad_google_token' }); }
    if (!p?.email || p.email_verified !== true) return res.status(401).json({ error: 'email_not_verified' });

    const email = p.email.toLowerCase();
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      const { name, phone, course, job_field, consent } = req.body || {};
      if (!name && !phone && !course && !job_field) return res.json({ needs_profile: true, name: p.name || '', email });
      if (!name || !phone || !course || !job_field) return res.status(400).json({ error: 'missing_fields' });
      if (!phoneOk(phone)) return res.status(400).json({ error: 'invalid_phone' });
      if (consent !== true) return res.status(400).json({ error: 'consent_required' });
      db.prepare(`INSERT INTO users (id, name, phone, email, course, job_field, consent_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`)
        .run(uuid(), clip(name, 100), clip(phone, 25), email, clip(course, 150), clip(job_field, 150));
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }
    res.json({ token: newSession(user.id), user: pub(user) });
  } catch (err) { next(err); }
});

router.post('/logout', requireUser, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(req.header('Authorization').slice(7)));
  res.json({ ok: true });
});

module.exports = router;
