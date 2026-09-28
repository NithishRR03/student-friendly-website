const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');

// Serve the admin dashboard at /admin
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Admin data API endpoint
router.get('/candidates', (req, res) => {
  const secretKey = req.query.key;
  const validKey = process.env.ADMIN_SECRET || 'studentadmin2026';

  if (!secretKey || secretKey !== validKey) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  try {
    // Updated query to fetch expected_job, skills, and resume_file
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.course, u.job_field, 
             u.expected_job, u.skills, u.created_at, r.resume_file, r.updated_at as resume_updated
      FROM users u
      LEFT JOIN resume_data r ON u.id = r.user_id
    `).all();

    if (req.query.format === 'csv') {
      let csv = 'ID,Name,Email,Phone,Course,Job Field,Expected Job,Skills,Created At,Resume Saved\n';
      users.forEach(u => {
        csv += `"${u.id}","${u.name || ''}","${u.email}","${u.phone || ''}","${u.course || ''}","${u.job_field || ''}","${u.expected_job || ''}","${u.skills || ''}","${u.created_at || ''}","${u.resume_file ? 'Yes' : 'No'}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="candidates.csv"');
      return res.send(csv);
    }

    return res.json({
      total_candidates: users.length,
      candidates: users
    });
  } catch (err) {
    console.error('Admin route error:', err);
    return res.status(500).json({ error: 'Database query failed: ' + err.message });
  }
});

// Secure Resume Download Endpoint
router.get('/download-resume/:userId', (req, res) => {
  const secretKey = req.query.key;
  const validKey = process.env.ADMIN_SECRET || 'studentadmin2026';

  if (!secretKey || secretKey !== validKey) {
    return res.status(403).send('Unauthorized access');
  }

  try {
    const resume = db.prepare('SELECT resume_file FROM resume_data WHERE user_id = ?').get(req.params.userId);
    
    if (!resume || !resume.resume_file) {
      return res.status(404).send('Resume not found for this candidate.');
    }

    // Assuming resume_file is a path on the server (e.g., in an /uploads folder)
    // If you store the resume in the database as a BLOB, adjust this part.
    const filePath = path.join(__dirname, '../uploads', resume.resume_file);
    
    if (!fs.existsSync(filePath)) {
       return res.status(404).send('Resume file missing on server.');
    }

    res.download(filePath, `Resume_${req.params.userId}.pdf`);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Error downloading resume.');
  }
});

module.exports = router;
