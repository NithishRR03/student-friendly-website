require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// ---------- Admin credentials (from environment ONLY) ----------
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
if (!ADMIN_USER || !ADMIN_PASS) {
  console.warn('[WARN] ADMIN_USER / ADMIN_PASS are not set. /admin is disabled until you set them.');
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());
app.use(helmet({
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false,
}));
app.use(cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins }));

// Raised from 200kb so long CV / resume payloads are not rejected
app.use(express.json({ limit: '2mb' }));

// General API rate limit
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
}));

// Stricter limit on the admin portal to stop password guessing
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts. Try again later.',
});

// Public config with strict no-cache headers so browsers never cache an old Google Client ID
app.get('/api/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

app.get('/health', (req, res) => {
  try {
    const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    res.json({ ok: true, users: n });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'db_error' });
  }
});

// Core API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/cv', require('./routes/cv'));
app.use('/api/gdpr', require('./routes/gdpr'));

// ---------- Helpers ----------
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow http(s) links (blocks javascript: URLs)
function safeUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// Constant-time string comparison
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requestBasicAuth(res, message) {
  res.setHeader('WWW-Authenticate', 'Basic realm="Student Friendly Admin Area", charset="UTF-8"');
  return res.status(401).send(message);
}

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':'); // split on FIRST colon only
  if (idx === -1) return null;
  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

// Try several likely keys where the CV text could have been saved
function extractCvText(parsed) {
  const keys = ['generated_text', 'text', 'cv_text', 'generated_cv', 'cv', 'content'];
  for (const k of keys) {
    if (typeof parsed[k] === 'string' && parsed[k].trim().length > 10) return parsed[k];
  }
  return '';
}

// ---------- SECURED ADMIN PORTAL ----------
app.get('/admin', adminLimiter, (req, res) => {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(503).send('Admin portal is disabled: set ADMIN_USER and ADMIN_PASS environment variables.');
  }

  // 1. Logout
  if (req.query.logout === '1') {
    res.setHeader('WWW-Authenticate', 'Basic realm="Student Friendly Admin Area", charset="UTF-8"');
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

  // 2. HTTP Basic Auth check
  const creds = parseBasicAuth(req.headers.authorization);
  if (!creds) return requestBasicAuth(res, 'Authentication required');

  const userOk = safeEqual(creds.user, ADMIN_USER);
  const passOk = safeEqual(creds.pass, ADMIN_PASS);
  if (!(userOk && passOk)) {
    return requestBasicAuth(res, 'Access Denied: Invalid Username or Password');
  }

  // 3. Database queries
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

    const allStudents = rows.map((u) => {
      let parsed = {};
      try {
        parsed = u.resume_data ? JSON.parse(u.resume_data) : {};
      } catch (e) {
        console.error('Bad resume JSON for user', u.id, e.message);
      }

      const cvContent = extractCvText(parsed);

      return {
        id: u.id || '-',
        name: u.name || 'Student #' + (u.id || ''),
        email: u.email || '-',
        phone: u.phone || parsed.phone || '-',
        course: u.course || parsed.course || '-',
        job_field: u.job_field || parsed.target_role || '-',
        location: u.location || parsed.location || '-',
        linkedin: parsed.linkedin || 'None',
        has_cv: Boolean(cvContent),
        cv_text: cvContent || 'Not generated yet',
        signed_up: u.consent_at || u.created_at || 'Registered',
      };
    });

    const cvStudents = allStudents.filter((s) => s.has_cv);

    if (req.query.download === 'all-json') {
      res.setHeader('Content-Disposition', 'attachment; filename=all-signups.json');
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify(allStudents, null, 2));
    }
    if (req.query.download === 'cv-json') {
      res.setHeader('Content-Disposition', 'attachment; filename=cv-generated-students.json');
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify(cvStudents, null, 2));
    }

    // All values are HTML-escaped before rendering
    const allRowsHtml = allStudents.map((s) => `
      <tr>
        <td><code style="color:#38bdf8;font-size:12px;">${escapeHtml(s.id)}</code></td>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.phone)}</td>
        <td>${escapeHtml(s.course)}</td>
        <td>${escapeHtml(s.job_field)}</td>
        <td>${s.has_cv ? '<span style="color:#10b981;font-weight:bold;">Yes (CV Ready)</span>' : '<span style="color:#94a3b8;">No CV yet</span>'}</td>
        <td style="font-size:12px;color:#94a3b8;">${escapeHtml(s.signed_up)}</td>
      </tr>
    `).join('');

    const cvRowsHtml = cvStudents.map((s) => {
      const link = safeUrl(s.linkedin);
      return `
      <tr>
        <td><code style="color:#38bdf8;font-size:12px;">${escapeHtml(s.id)}</code></td>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.phone)}</td>
        <td>${escapeHtml(s.job_field)}</td>
        <td>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;">View Profile</a>` : 'None'}</td>
        <td>
          <div style="max-height:140px;overflow-y:auto;font-size:12px;white-space:pre-wrap;background:#0f172a;padding:8px;border-radius:4px;border:1px solid #334155;">${escapeHtml(s.cv_text)}</div>
        </td>
      </tr>
    `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student Friendly Admin Dashboard</title>
        <meta name="robots" content="noindex,nofollow">
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
    res.status(500).send('Database error');
  }
});

// Static website files with no-cache on HTML files
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// Error handling: keep the real status code (413 too-large, 400 bad JSON, etc.)
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err.type || '', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? 'server_error' : (err.type || 'request_error'),
  });
});

// Start server
const server = app.listen(PORT, () => console.log(`Student Friendly running on port ${PORT}`));

// Close cleanly so the SQLite WAL gets flushed
function shutdown() {
  server.close(() => {
    try { db.close(); } catch (e) { /* ignore */ }
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
