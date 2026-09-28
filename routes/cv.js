const express = require('express');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireUser } = require('../auth');
const { getCvFeedback } = require('../cvFeedback');

const router = express.Router();

// A CV check is more expensive than a form save, so give it its own,
// tighter limit on top of the global one in server.js.
const cvLimiter = rateLimit({ windowMs: 60 * 1000, max: 6 });

router.post('/check', requireUser, cvLimiter, async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ error: 'cv_text_too_short' });
  }
  if (text.length > 20000) {
    return res.status(400).json({ error: 'cv_text_too_long' });
  }

  const feedback = await getCvFeedback(text);

  db.prepare(
    'INSERT INTO cv_checks (id, user_id, word_count, suggestion_tag) VALUES (?, ?, ?, ?)'
  ).run(uuidv4(), req.user.id, text.trim().split(/\s+/).length, feedback.tag);

  res.json(feedback);
});

module.exports = router;
