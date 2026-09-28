const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verify Google Token and log in / register candidate
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const email = payload.email.toLowerCase();
    const name = payload.name || '';

    // Check if user already exists
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      // Create user record
      const info = db.prepare(
        'INSERT INTO users (email, name, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
      ).run(email, name);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }

    // Set session
    req.session.userId = user.id;
    req.session.userEmail = user.email;

    return res.json({ ok: true, user });
  } catch (err) {
    console.error('Google Auth Error:', err);
    return res.status(401).json({ error: 'Invalid Google token' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Current user status
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.session.userId);
  res.json({ ok: true, user });
});

module.exports = router;
