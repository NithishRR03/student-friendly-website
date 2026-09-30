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
  contentSecurityPolicy: false,
}));
app.use(cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins }));
app.use(express.json({ limit: '200kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));

// Public config with strict no-cache headers so browsers never cache an old Google Client ID
app.get('/api/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Core API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/cv', require('./routes/cv'));
app.use('/api/gdpr', require('./routes/gdpr'));

// --- SECURED ADMIN PORTAL WITH TWO SECTIONS ---
app.get('/admin', (req, res) => {
  const adminId = 'SFUK';
  const adminPass = 'Tamilpasanga$3';

  // 1. Check Logout
  if (req.query.logout === '1') {
    res.setHeader('WWW-Authenticate', 'Basic realm="Student Friendly Admin Area"');
    return res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Logged Out</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 30px; border-radius: 10px; text-align: center; max-width: 360px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
          h2 { color: #38bdf8; margin-top: 0; }
          p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
          a { background: #0284c7; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Logged Out</h2>
          <p>You have successfully logged out of the admin portal.</p>
          <a href="/admin">Log In Again</a>
        </div>
      </body>
      </html>
    `);
  }

  // 2. HTTP Basic Auth Check
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

  // 3. Database Queries
  try {
    const activeTab = req.query.tab === 'cv' ? 'cv' : 'all';

    const rows = db.prepare(`
      SELECT 
        u.*,
        r.data AS resume_data
      FROM users u
      LEFT JOIN resume_data r ON u.id = r.user_id
      ORDER BY u.rowid DESC
    `).all();

    const allStudents = rows.map(u => {
      let parsed = {};
      try { parsed = u.resume_data ? JSON.parse(u.resume_data) : {}; } catch {}

      const cvContent = parsed.generated_text || parsed.text || parsed.cv_text || '';
      const hasCV = Boolean(cvContent && cvContent.trim().length > 10);

      return {
        id: u.id || '-',
        name: u.name || 'Student #' + (u.id || ''),
        email: u.email || '-',
        phone: u.phone || parsed.phone || '-',
        course: u.course || parsed.course || '-',
        job_field: u.job_field || parsed.target_role || '-',
        linkedin: parsed.linkedin || 'None',
        has_cv: hasCV,
        cv_text: cvContent || 'Not generated yet',
        signed_up: u.consent_at || u.created_at || 'Registered'
      };
    });

    const cvStudents = allStudents.filter(s => s.has_cv);

    if (req.query.download === 'all-json') {
      res.setHeader('Content-disposition', 'attachment; filename=all-signups.json');
      res.setHeader('Content-type', 'application/json');
      return res.send(JSON.stringify(allStudents, null, 2));
    }
    if (req.query.download === 'cv-json') {
      res.setHeader('Content-disposition', 'attachment; filename=cv-generated-students.json');
      res.setHeader('Content-type', 'application/json');
      return res.send(JSON.stringify(cvStudents, null, 2));
    }

    const allRowsHtml = allStudents.map(s => `
      <tr>
        <td><code style="color:#38bdf8;font-size:12px;">${s.id}</code></td>
        <td><strong>${s.name}</strong></td>
        <td>${s.email}</td>
        <td>${s.phone}</td>
        <td>${s.course}</td>
        <td>${s.job_field}</td>
        <td>${s.has_cv ? '<span style="color:#10b981;font-weight:bold;">Yes (CV Ready)</span>' : '<span style="color:#94a3b8;">No CV yet</span>'}</td>
        <td style="font-size:12px;color:#94a3b8;">${s.signed_up}</td>
      </tr>
    `).join('');

    const cvRowsHtml = cvStudents.map(s => `
      <tr>
        <td><code style="color:#38bdf8;font-size:12px;">${s.id}</code></td>
        <td><strong>${s.name}</strong></td>
        <td>${s.email}</td>
        <td>${s.phone}</td>
        <td>${s.job_field}</td>
        <td>${s.linkedin !== 'None' ? `<a href="${s.linkedin}" target="_blank" style="color:#38bdf8;">View Profile</a>` : 'None'}</td>
        <td>
          <div style="max-height:140px;overflow-y:auto;font-size:12px;white-space:pre-wrap;background:#0f172a;padding:8px;border-radius:4px;border:1px solid #334155;">${s.cv_text}</div>
        </td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student Friendly Admin Dashboard</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 25px; margin: 0; }
          .container { max-width: 1350px; margin: 0 auto; background: #1e293b; padding: 25px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 15px; margin-bottom: 20px; }
          h2 { color: #38bdf8; margin: 0; }
          .actions { display: flex; gap: 10px; }
          a.btn { color: white; text-decoration: none; padding: 9px 16px; border-radius: 6px; font-weight: bold; font-size: 13px; }
          a.btn-download { background: #10b981; }
          a.btn-download:hover { background: #059669; }
          a.btn-logout { background: #ef4444; }
          a.btn-logout:hover { background: #dc2626; }
          .nav-tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid #334155; }
          .tab { padding: 12px 20px; text-decoration: none; font-weight: bold; font-size: 15px; border-radius: 8px 8px 0 0; color: #94a3b8; }
          .tab.active { background: #334155; color: #38bdf8; border-bottom: 2px solid #38bdf8; }
          .tab:hover:not(.active) { color: #f8fafc; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
          th, td { border: 1px solid #334155; padding: 10px 12px; text-align: left; vertical-align: top; }
          th { background: #334155; color: #38bdf8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Student Friendly Administration</h2>
            <div class="actions">
              ${activeTab === 'all' 
                ? '<a class="btn btn-download" href="/admin?download=all-json">Download All Signups (JSON)</a>' 
                : '<a class="btn btn-download" href="/admin?download=cv-json">Download Generated CVs (JSON)</a>'
              }
              <a class="btn btn-logout" href="/admin?logout=1">Logout</a>
            </div>
          </div>

          <div class="nav-tabs">
            <a class="tab ${activeTab === 'all' ? 'active' : ''}" href="/admin?tab=all">
              All Sign-Ups (${allStudents.length})
            </a>
            <a class="tab ${activeTab === 'cv' ? 'active' : ''}" href="/admin?tab=cv">
              Generated CVs (${cvStudents.length})
            </a>
          </div>

          ${activeTab === 'all' ? `
            <table>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Course</th>
                  <th>Target Field</th>
                  <th>CV Status</th>
                  <th>Signed Up</th>
                </tr>
              </thead>
              <tbody>
                ${allRowsHtml.length > 0 ? allRowsHtml : '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">No registered users found yet.</td></tr>'}
              </tbody>
            </table>
          ` : `
            <table>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Target Role</th>
                  <th>LinkedIn</th>
                  <th style="min-width: 320px;">Generated CV Content</th>
                </tr>
              </thead>
              <tbody>
                ${cvRowsHtml.length > 0 ? cvRowsHtml : '<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">No students have generated a CV yet.</td></tr>'}
              </tbody>
            </table>
          `}

        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error('Admin route error:', err);
    res.status(500).send('Database error: ' + err.message);
  }
});

// Static website files with no-cache on HTML files
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Error handling
app.use((err, req, res, next) => { 
  console.error(err); 
  res.status(500).json({ error: 'server_error' }); 
});

// Start server
app.listen(PORT, () => console.log(`Student Friendly running on port ${PORT}`));
