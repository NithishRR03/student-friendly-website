const express = require('express');
const db = require('../db.js'); // adjust path if necessary based on your setup

const router = express.Router();

// Middleware to check session
router.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  
  const raw = auth.slice(7);
  const crypto = require('crypto');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  
  // FIXED: Outer double quotes allow single quotes around 'now' so SQLite reads it correctly.
  const session = db.prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')").get(tokenHash);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  
  req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  next();
});

router.get('/me', (req, res) => {
  res.json(req.user);
});

router.put('/me', (req, res) => {
  const { name, phone, course, job_field, location } = req.body;
  
  db.prepare(`
    UPDATE users 
    SET name = ?, phone = ?, course = ?, job_field = ?, location = ?
    WHERE id = ?
  `).run(
    name || req.user.name, 
    phone || req.user.phone, 
    course || req.user.course, 
    job_field || req.user.job_field, 
    location || req.user.location,
    req.user.id
  );
  
  res.json({ ok: true });
});

module.exports = router;
