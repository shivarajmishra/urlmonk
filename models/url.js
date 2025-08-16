// routes/url.js
const express = require('express');
const router = express.Router();
const Url = require('../models/url');

// ---------- helpers ----------
function isHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeUrl(original) {
  if (!original || typeof original !== 'string') return '';
  const trimmed = original.trim();
  // If user types example.com, assume https://example.com
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function makeBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http');
  return `${proto}://${req.get('host')}`;
}

// ---------- routes ----------

// POST /api/shorten   { originalUrl }
router.post('/shorten', async (req, res) => {
  try {
    // ESM-only package: import dynamically inside CJS route
    const { nanoid } = await import('nanoid');

    // 1) read input
    let { originalUrl } = req.body || {};
    // 2) normalize + validate
    originalUrl = normalizeUrl(originalUrl);
    if (!isHttpUrl(originalUrl)) {
      return res.status(400).json({ error: 'Invalid original URL provided.' });
    }

    const baseUrl = makeBaseUrl(req);

    // 3) reuse if already exists
    let doc = await Url.findOne({ originalUrl });

    // 4) create if not exists
    if (!doc) {
      let id = nanoid(7); // 7-char id
      // ultra-rare, but ensure uniqueness
      while (await Url.exists({ shortUrlId: id })) {
        id = nanoid(7);
      }
      doc = await Url.create({
        originalUrl,
        shortUrlId: id,
        clicks: 0,
      });
    }

    // 5) respond with all fields the frontend expects
    return res.status(201).json({
      shortUrl: `${baseUrl}/${doc.shortUrlId}`,
      shortUrlId: doc.shortUrlId,
      originalUrl: doc.originalUrl,
      clicks: doc.clicks,
      createdAt: doc.date,
    });
  } catch (err) {
    console.error('POST /api/shorten error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/recent?limit=8
router.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '8', 10), 50);
    const rows = await Url.find().sort({ date: -1 }).limit(limit).lean();

    return res.json(rows.map(r => ({
      shortUrlId: r.shortUrlId,
      originalUrl: r.originalUrl,
      clicks: r.clicks,
      createdAt: r.date,
    })));
  } catch (e) {
    console.error('GET /api/recent error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/stats/:shortUrlId
router.get('/stats/:shortUrlId', async (req, res) => {
  try {
    const doc = await Url.findOne({ shortUrlId: req.params.shortUrlId }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const baseUrl = makeBaseUrl(req);
    return res.json({
      shortUrlId: doc.shortUrlId,
      originalUrl: doc.originalUrl,
      clicks: doc.clicks,
      createdAt: doc.date,
      shortUrl: `${baseUrl}/${doc.shortUrlId}`,
    });
  } catch (e) {
    console.error('GET /api/stats/:shortUrlId error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// models/url.js
const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
  originalUrl: { type: String, required: true },
  shortUrlId:  { type: String, required: true, unique: true },
  clicks:      { type: Number, required: true, default: 0 },
  date:        { type: Date, default: Date.now },
});

// 🚨 Export the MODEL directly (not an object, not the schema)
module.exports = mongoose.model('Url', urlSchema);
