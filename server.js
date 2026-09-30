require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());
app.use(helmet({
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false, // Disables CSP blocks completely for admin access
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

// --- SECURED ADMIN PORTAL (NATIVE BROWSER LOGIN) ---
app.get('/admin', (req, res) => {
  const adminId = 'SFUK';
  const adminPass = 'Tamilpasanga$3';

  // Check HTTP Basic Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Student Friendly Admin Area"');
    return res.status(401).send('Authentication required');
  }

  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('ascii').split(':');
  const user = credentials[0];
  const pass = credentials[1];

  if (user !== adminId || pass !== adminPass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Student Friendly Admin Area"');
    return res.status(401).send('Access Denied: Invalid Username or Password');
  }

  // Fetch all student records
  try {
   // Fetch ALL registered users, regardless of whether they have resume data yet
    const rows = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.course,
        u.job_field,
        u.created_at,
        u.consent_at,
        r.data AS resume_data
      FROM users u
      LEFT JOIN resume_data r ON u.id = r.user_id
      ORDER BY u.id DESC
    `).all();

    const students = rows.map(u => {
      let parsed = {};
      try { parsed = u.resume_data ? JSON.parse(u.resume_data) : {}; } catch {}

      return {
        name: u.name || '-',
        email: u.email || '-',
        phone: u.phone || '-',
        course: u.course || '-',
        job_field: u.job_field || '-',
        linkedin: parsed.linkedin || 'None',
        generated_cv: parsed.generated_text || parsed.text || 'Not generated yet',
        signed_up: u.consent_at || '-'
      };
    });

    // Check if user requested JSON download
    if (req.query.download === 'json') {
      res.setHeader('Content-disposition', 'attachment; filename=all-students.json');
      res.setHeader('Content-type', 'application/json');
      return res.send(JSON.stringify(students, null, 2));
    }

    // Render Clean HTML Dashboard Directly from the Server
    const tableRows = students.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.email}</td>
        <td>${s.phone}</td>
        <td>${s.course}</td>
        <td>${s.job_field}</td>
        <td>${s.linkedin !== 'None' ? `<a href="${s.linkedin}" target="_blank" style="color:#38bdf8;">Profile</a>` : 'None'}</td>
        <td><div style="max-height:100px;overflow-y:auto;font-size:12px;white-space:pre-wrap;background:#0f172a;padding:6px;border-radius:4px;">${s.generated_cv}</div></td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student Friendly Admin Dashboard</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 25px; margin: 0; }
          .container { max-width: 1200px; margin: 0 auto; background: #1e293b; padding: 25px; border-radius: 10px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 15px; margin-bottom: 20px; }
          h2 { color: #38bdf8; margin: 0; }
          a.btn { background: #10b981; color: white; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; }
          a.btn:hover { background: #059669; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
          th, td { border: 1px solid #334155; padding: 10px; text-align: left; vertical-align: top; }
          th { background: #334155; color: #38bdf8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Registered Students (${students.length})</h2>
            <a class="btn" href="/admin?download=json">Download All (JSON)</a>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Course</th>
                <th>Job Field</th>
                <th>LinkedIn</th>
                <th style="min-width: 250px;">Generated CV</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows.length > 0 ? tableRows : '<tr><td colspan="7" style="text-align:center;padding:20px;">No students registered yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }
});

// Static website files (serves student front end)
app.use(express.static(path.join(__dirname, 'public')));

// Error handling
app.use((err, req, res, next) => { 
  console.error(err); 
  res.status(500).json({ error: 'server_error' }); 
});

// Start server
app.listen(PORT, () => console.log(`Student Friendly running on port ${PORT}`));
