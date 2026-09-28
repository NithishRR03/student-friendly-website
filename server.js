require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // Render/Railway sit behind a proxy

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim());
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // needed for the Google sign-in popup
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], objectSrc: ["'none'"],
    scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
    connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
    frameSrc: ['https://accounts.google.com/gsi/'],
    styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
    fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], upgradeInsecureRequests: null,
  } },
}));
app.use(cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins }));
app.use(express.json({ limit: '200kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));

// The Google client ID is public by design; the page needs it to draw the sign-in button.
app.get('/api/config', (req, res) => res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/cv', require('./routes/cv'));
app.use('/api/gdpr', require('./routes/gdpr'));

app.use(express.static(path.join(__dirname, 'public'))); // the website itself

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'server_error' }); });
app.listen(PORT, () => console.log(`Student Friendly running on port ${PORT}`));

// Mount Admin Routes

app.use("/api/admin", adminRoutes);

// Mount dedicated Admin portal
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);
