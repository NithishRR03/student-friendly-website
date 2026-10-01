const express = require('express');
const db = require('../db');
const { requireUser } = require('../auth');
const router = express.Router();

router.get('/me', requireUser, (req, res) => {
  const { id, name, phone, email, location, course, job_field, created_at } = req.user;
  res.json({ id, name, phone, email, location, course, job_field, created_at });
});

router.put('/me', requireUser, (req, res) => {
  const b = req.body || {};
  const pick = (v, cur, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : cur);
  if (b.phone && !/^[+\d][\d\s()-]{6,19}$/.test(String(b.phone).trim())) return res.status(400).json({ error: 'invalid_phone' });
  const u = req.user;
  db.prepare('UPDATE users SET name = ?, phone = ?, location = ?, course = ?, job_field = ? WHERE id = ?')
    .run(pick(b.name, u.name, 100), pick(b.phone, u.phone, 25), pick(b.location, u.location, 150), pick(b.course, u.course, 150), pick(b.job_field, u.job_field, 150), u.id);
  res.json({ ok: true });
});

router.delete('/me', requireUser, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});
module.exports = router;
