const express = require('express');
const { v4: uuid } = require('uuid');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { newSession, sha, requireUser } = require('../auth');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const clip = (s, n) => String(s || '').trim().slice(0, n);

// Added location to the public user profile returned to the frontend
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, course: u.course, job_field: u.job_field, location: u.location });
let client = null;

router.post('/google', limiter, async (req, res, next) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: 'google_not_configured' });
    client = client || new OAuth2Client(clientId);

    let p;
    try {
      p = (await client.verifyIdToken({ idToken: String(req.body?.credential || ''), audience: clientId })).getPayload();
    } catch {
      return res.status(401).json({ error: 'bad_google_token' });
    }

    if (!p?.email || p.email_verified !== true) return res.status(401).json({ error: 'email_not_verified' });

    const email = p.email.toLowerCase();
    const googleName = p.name || 'Google User';
    
    // Extracted location from the incoming request body
    const { name, phone, course, job_field, location } = req.body || {};

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      // NEW USER: Insert directly into database immediately including location
      const userId = uuid();
      db.prepare(`
        INSERT INTO users (id, name, phone, email, course, job_field, location, consent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        userId,
        clip(name || googleName, 100),
        clip(phone || '-', 25),
        email,
        clip(course || '-', 150),
        clip(job_field || '-', 150),
        clip(location || '-', 100)
      );
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    } else {
      // EXISTING USER: Update fields if they entered new profile info including location
      if (name || phone || course || job_field || location) {
        db.prepare(`
          UPDATE users 
          SET name = COALESCE(?, name),
              phone = COALESCE(?, phone),
              course = COALESCE(?, course),
              job_field = COALESCE(?, job_field),
              location = COALESCE(?, location)
          WHERE email = ?
        `).run(
          name ? clip(name, 100) : null,
          phone ? clip(phone, 25) : null,
          course ? clip(course, 150) : null,
          job_field ? clip(job_field, 150) : null,
          location ? clip(location, 100) : null,
          email
        );
        user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      }
    }

    res.json({ token: newSession(user.id), user: pub(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireUser, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(req.header('Authorization').slice(7)));
  res.json({ ok: true });
});

module.exports = router;
