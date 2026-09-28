const express = require('express');
const db = require('../db');
const { requireUser } = require('../auth');
const router = express.Router();

// Right of access (UK GDPR Art. 15). Erasure is DELETE /api/profile/me.
router.get('/export', requireUser, (req, res) => {
  const { id, name, phone, email, course, job_field, consent_at, created_at } = req.user;
  res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
  res.json({
    profile: { id, name, phone, email, course, job_field, consent_at, created_at },
    checklist: db.prepare('SELECT item_id, checked, updated_at FROM checklist_items WHERE user_id = ?').all(id),
    resume: (() => { const r = db.prepare('SELECT data FROM resume_data WHERE user_id = ?').get(id); return r ? JSON.parse(r.data) : null; })(),
    cv_checks: db.prepare('SELECT word_count, suggestion_tag, created_at FROM cv_checks WHERE user_id = ?').all(id),
    exported_at: new Date().toISOString(),
  });
});
module.exports = router;
