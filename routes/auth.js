// auth.js — sign in with Google. Immediately saves user into SQLite upon authentication.
const express = require('express');
const { v4: uuid } = require('uuid');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { newSession, sha, requireUser } = require('../auth');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const clip = (s, n) => String(s || '').trim().slice(0, n);
const phoneOk = (p) => /^[+\d][\d\s()-]{6,19}$/.test(String(p || '').trim());
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, course: u.course, job_field: u.job_field });
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

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // If user does not exist yet, SAVE THEM IMMEDIATELY
    if (!user) {
      const { name, phone, course, job_field, consent } = req.body || {};
      
      const assignedName = clip(name || googleName, 100);
      const assignedPhone = phone && phoneOk(phone) ? clip(phone, 25) : null;
      const assignedCourse = course ? clip(course, 150) : null;
      const assignedJob = job_field ? clip(job_field, 150) : null;

      const userId = uuid();
      db.prepare(`
        INSERT INTO users (id, name, phone, email, course, job_field, consent_at) 
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(userId, assignedName, assignedPhone, email, assignedCourse, assignedJob);

      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

      // If missing full profile details, still prompt the frontend form, but they are already captured in SQLite
      if (!phone || !course || !job_field) {
        return res.json({ 
          needs_profile: true, 
          token: newSession(user.id), 
          name: assignedName, 
          email: user.email 
        });
      }
    } else {
      // User exists: update optional profile details if sent
      const { name, phone, course, job_field } = req.body || {};
      if (phone || course || job_field) {
        db.prepare(`
          UPDATE users 
          SET phone = COALESCE(?, phone), 
              course = COALESCE(?, course), 
              job_field = COALESCE(?, job_field)
          WHERE email = ?
        `).run(
          phone && phoneOk(phone) ? clip(phone, 25) : null,
          course ? clip(course, 150) : null,
          job_field ? clip(job_field, 150) : null,
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
