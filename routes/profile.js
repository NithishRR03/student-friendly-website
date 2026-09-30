const express = require('express');
const db = require('../db');
const { requireUser } = require('../auth');
const router = express.Router();

router.get('/me', requireUser, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) || req.user;
  const { id, name, phone, email, course, job_field, created_at } = user;
  res.json({ id, name, phone, email, course, job_field, created_at });
});

router.put('/me', requireUser, (req, res) => {
  const b = req.body || {};
  const pick = (v, cur, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : (cur || '-'));
  if (b.phone && !/^[+\d][\d\s()-]{6,19}$/.test(String(b.phone).trim())) return res.status(400).json({ error: 'invalid_phone' });
  
  const u = req.user;
  const name = pick(b.name, u.name, 100);
  const phone = pick(b.phone, u.phone, 25);
  const course = pick(b.course, u.course, 150);
  const jobField = pick(b.job_field, u.job_field, 150);
  const email = (u.email || b.email || '').toLowerCase();

  // Check if user exists in the database
  const exists = db.prepare('SELECT id FROM users WHERE id = ? OR email = ?').get(u.id, email);

  if (exists) {
    db.prepare('UPDATE users SET name = ?, phone = ?, course = ?, job_field = ? WHERE id = ?')
      .run(name, phone, course, jobField, exists.id);
  } else {
    // FORCE INSERT so the student immediately appears in the admin table
    db.prepare(`
      INSERT INTO users (id, name, phone, email, course, job_field, consent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(u.id, name, phone, email, course, jobField);
  }

  res.json({ ok: true });
});

// GDPR erasure
router.delete('/me', requireUser, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
