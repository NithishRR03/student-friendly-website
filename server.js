require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // Render/Railway sit behind a proxy

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());
app.use(helmet({
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
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

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/cv', require('./routes/cv'));
app.use('/api/gdpr', require('./routes/gdpr'));

// Admin UI routes
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

// Admin export: downloads all registered users, details, LinkedIn, and generated CVs
app.get('/api/admin/export-all', (req, res) => {
  const adminKey = req.query.key;
  const SECRET = process.env.ADMIN_SECRET || 'mySuperAdminSecret2026';

  if (adminKey !== SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
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

    const exportData = rows.map(u => {
      let parsedResume = {};
      try {
        parsedResume = u.resume_data ? JSON.parse(u.resume_data) : {};
      } catch {}

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        course: u.course,
        job_field: u.job_field,
        linkedin: parsedResume.linkedin || 'Not provided',
        target_role: parsedResume.target_role || 'Not provided',
        skills: parsedResume.skills || '',
        generated_cv: parsedResume.generated_text || parsedResume.text || 'Not generated yet',
        signed_up_at: u.consent_at
      };
    });

    res.setHeader('Content-disposition', 'attachment; filename=all-students-data.json');
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Static website files
app.use(express.static(path.join(__dirname, 'public')));

// Error handling
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'server_error' }); });

// Start server
app.listen(PORT, () => console.log(`Student Friendly running on port ${PORT}`));
