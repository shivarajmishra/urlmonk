// index.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), debug: false });

const express = require('express');
const mongoose = require('mongoose');
const Url = require('./models/url'); // schema only (no nanoid here)

const app = express();
const PORT = process.env.PORT || 3000;

// Read Mongo URI (your .env must have MONGO_URI=...)
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set. Add it to your .env');
  process.exit(1);
}

// If deploying behind a proxy (Render/Heroku/Railway), this lets req.protocol reflect x-forwarded-proto
app.set('trust proxy', true);

// Parsers & static
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // optional /public assets

// Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// API routes (uses dynamic nanoid inside)
const urlRoutes = require('./routes/url');
app.use('/api', urlRoutes);

// Catch-all redirect for short links (keep AFTER /api)
app.get('/:shortUrlId', async (req, res) => {
  try {
    const doc = await Url.findOne({ shortUrlId: req.params.shortUrlId });
    if (!doc) return res.status(404).send('No URL Found');

    // increment clicks then redirect
    doc.clicks++;
    await doc.save();

    let target = doc.originalUrl;
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target; // safety
    return res.redirect(target);
  } catch (err) {
    console.error('Redirect error:', err);
    return res.status(500).send('Server error');
  }
});

// (optional) simple health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Connect to Mongo, then listen
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Mongo connection failed:', err.message);
    process.exit(1);
  });

  