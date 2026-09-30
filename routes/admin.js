const express = require('express');
const router = express.Router();
const db = require('../db');

// Your custom Admin credentials
const ADMIN_ID = process.env.ADMIN_USER || 'SFUK';
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'Tamilpasanga$3';

// 1. POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  
  if (username === ADMIN_ID && password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: 'sf_admin_session_token_ok' });
  }
  return res.status(401).json({ error: 'Invalid admin ID or password' });
});

// 2. GET /api/admin/data
router.get('/data', (req, res) => {
  const auth = req.headers['x-admin-token'];
  if (auth !== 'sf_admin_session_token_ok') {
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const rows = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.course,
        u.job_field,
        u.consent_at,
        r.data AS resume_data
      FROM users u
      LEFT JOIN resume_data r ON u.id = r.user_id
      ORDER BY u.consent_at DESC
    `).all();

    const students = rows.map(u => {
      let parsed = {};
      try { 
        parsed = u.resume_data ? JSON.parse(u.resume_data) : {}; 
      } catch {}

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        course: u.course,
        job_field: u.job_field,
        linkedin: parsed.linkedin || 'Not provided',
        target_role: parsed.target_role || 'Not provided',
        skills: parsed.skills || '',
        generated_cv: parsed.generated_text || parsed.text || 'Not generated yet',
        signed_up_at: u.consent_at
      };
    });

    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
