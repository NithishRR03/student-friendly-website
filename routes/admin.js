const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/admin/candidates
router.get('/candidates', (req, res) => {
  const secretKey = req.query.key;
  const validKey = process.env.ADMIN_SECRET || 'studentadmin2026';

  if (!secretKey || secretKey !== validKey) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  try {
    const users = db.prepare('SELECT id, name, email, phone, course, job_field, created_at FROM users').all();
    const resumes = db.prepare('SELECT user_id, updated_at FROM resume_data').all();

    if (req.query.format === 'csv') {
      let csv = 'ID,Name,Email,Phone,Course,Job Field,Created At\n';
      users.forEach(u => {
        csv += `"${u.id}","${u.name || ''}","${u.email}","${u.phone || ''}","${u.course || ''}","${u.job_field || ''}","${u.created_at || ''}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="candidates.csv"');
      return res.send(csv);
    }

    return res.json({
      total_candidates: users.length,
      candidates: users,
      resumes: resumes
    });
  } catch (err) {
    console.error('Admin route error:', err);
    return res.status(500).json({ error: 'Database query failed: ' + err.message });
  }
});

module.exports = router;
