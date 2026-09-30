const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const nodemailer = require('nodemailer');
const db = require('../db.js');

const router = express.Router();

// SMTP configuration for email OTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || 'studentsfriendlyuk@gmail.com',
    pass: process.env.SMTP_PASS // Gmail App Password
  }
});

// 1. Request OTP
router.post('/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Store OTP (valid for 10 minutes)
  db.prepare(`
    INSERT INTO otps (identifier, code, expires_at)
    VALUES (?, ?, datetime('now', '+10 minutes'))
    ON CONFLICT(identifier) DO UPDATE SET
      code = excluded.code,
      expires_at = excluded.expires_at
  `).run(cleanEmail, code);

  if (process.env.SMTP_PASS) {
    try {
      await transporter.sendMail({
        from: `"Student Friendly" <${process.env.SMTP_USER || 'studentsfriendlyuk@gmail.com'}>`,
        to: cleanEmail,
        subject: `${code} is your Student Friendly login code`,
        text: `Your login code is: ${code}\n\nIt expires in 10 minutes.`
      });
    } catch (e) {
      console.error('Email send error:', e);
      return res.status(500).json({ error: 'Could not send verification email.' });
    }
  } else {
    // If SMTP_PASS is not set yet in Render, code logs to Render console for testing
    console.log(`[LOGIN OTP] Verification code for ${cleanEmail}: ${code}`);
  }

  res.json({ ok: true });
});

// 2. Verify OTP
router.post('/verify-otp', (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'missing_fields' });

  const cleanEmail = email.toLowerCase().trim();
  const record = db.prepare('SELECT * FROM otps WHERE identifier = ? AND expires_at > datetime("now")').get(cleanEmail);

  if (!record || record.code !== code.trim()) {
    return res.status(400).json({ error: 'bad_code' });
  }

  // Delete used OTP
  db.prepare('DELETE FROM otps WHERE identifier = ?').run(cleanEmail);

  // Retrieve or create candidate
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user) {
    const newId = uuid();
    const defaultName = cleanEmail.split('@')[0];
    db.prepare(`
      INSERT INTO users (id, name, email, phone, course, job_field, created_at)
      VALUES (?, ?, ?, '-', '-', '-', datetime('now'))
    `).run(newId, defaultName, cleanEmail);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(newId);
  }

  // Create 30-day session
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, datetime('now', '+30 days'))
  `).run(tokenHash, user.id);

  res.json({ token, user });
});

// 3. Logout
router.post('/logout', (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const raw = auth.slice(7);
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }
  res.json({ ok: true });
});

module.exports = router;
