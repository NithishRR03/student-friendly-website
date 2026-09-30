require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // Render sits behind a proxy

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());
app.use(helmet({
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/client'],
    connectSrc: ["'self'", 'https://accounts.google.com'],
    frameSrc: ["'self'", 'https://accounts.google.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'https://*.googleusercontent.com', 'data:']
  } },
}));
app.use(cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins }));
app.use(express.json({ limit: '200kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));

// Public config & health
app.get('/api/config', (req, res) => res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' }));
app.get('/health', (req, res) => res.json({ ok: true }));

// Core API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/cv', require('./routes/cv'));
app.use('/api/gdpr', require('./routes/gdpr'));

// --- ADMIN CREDENTIALS & API ENDPOINTS ---
const ADMIN_ID = process.env.ADMIN_USER || 'SFUK';
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'Tamilpasanga$3';

// 1. Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_ID && password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: 'sf_admin_session_token_ok' });
  }
  return res.status(401).json({ error: 'Invalid admin ID or password' });
});

// 2. Admin student data endpoint
app.get('/api/admin/data', (req, res) => {
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
    console.error('Admin data fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Static website files (serves index.html, admin.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Error handling
app.use((err, req, res, next) => { 
  console.error(err); 
  res.status(500).json({ error: 'server_error' }); 
});

// Start server
app.listen(PORT, () => console.log(`Student Friendly running on port ${PORT}`));
