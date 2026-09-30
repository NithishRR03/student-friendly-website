const express = require('express');
const db = require('../db');
const { requireUser } = require('../auth');
const router = express.Router();

const clip = (s, n) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);

router.get('/me', requireUser, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) || req.user;
  res.json({
    id: user.id,
    name: user.name,
    phone: user.phone || '',
    email: user.email,
    course: user.course || '',
    job_field: user.job_field || '',
    created_at: user.created_at
  });
});

router.put('/me', requireUser, (req, res) => {
  const b = req.body || {};
  const u = req.user;

  const name = clip(b.name, 100) || u.name;
  const phone = clip(b.phone, 25) || u.phone || '-';
  const course = clip(b.course, 150) || u.course || '-';
  const jobField = clip(b.job_field, 150) || u.job_field || '-';

  // Update existing Google sign-up with their phone, course, and job field
  db.prepare(`
    UPDATE users 
    SET name = ?, 
        phone = ?, 
        course = ?, 
        job_field = ?,
        consent_at = COALESCE(consent_at, datetime('now'))
    WHERE id = ? OR email = ?
  `).run(name, phone, course, jobField, u.id, (u.email || '').toLowerCase());

  res.json({ ok: true });
});

router.delete('/me', requireUser, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
