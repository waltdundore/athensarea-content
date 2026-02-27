/**
 * server.js — RSS proxy + Classifieds API
 *
 * Endpoints:
 *   GET  /api/rss?url=...        Whitelist-only RSS proxy
 *   GET  /api/listings           Fetch classifieds (optional ?category=)
 *   POST /api/listings           Create classified listing
 *   GET  /health                 Health check
 *
 * Cloudflare Turnstile: verified when TURNSTILE_SECRET env var is set.
 * Leave TURNSTILE_SECRET empty to disable verification (pre-go-live).
 */

'use strict';

const express   = require('express');
const Database  = require('better-sqlite3');
const crypto    = require('crypto');
const path      = require('path');

const PORT             = process.env.PORT           || 3001;
const DB_PATH          = process.env.DB_PATH        || '/data/listings.db';
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const UPSTREAM_TIMEOUT = 8000;

const VALID_CATEGORIES = new Set(['Housing', 'Jobs', 'For Sale', 'Services', 'Community']);
const TITLE_MAX        = 80;
const DESC_MAX         = 500;
const CONTACT_MAX      = 100;

/** Exact whitelist of permitted RSS upstream URLs */
const WHITELIST = new Set([
  'https://flagpole.com/feed/',
  'https://athenspoliticsnerd.com/feed/',
  'https://www.wuga.org/local-news.rss',
  'https://redandblack.com/feed/',
  'https://www.ajc.com/local/athens/rss.xml',
]);

/* ============================================================
   DATABASE SETUP
   ============================================================ */

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    contact     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
  CREATE INDEX IF NOT EXISTS idx_listings_created  ON listings(created_at DESC);
`);

const stmtInsert = db.prepare(`
  INSERT INTO listings (id, category, title, description, contact, created_at)
  VALUES (@id, @category, @title, @description, @contact, @created_at)
`);

const stmtAll = db.prepare(
  'SELECT * FROM listings ORDER BY created_at DESC'
);

const stmtByCategory = db.prepare(
  'SELECT * FROM listings WHERE category = ? ORDER BY created_at DESC'
);

/* ============================================================
   EXPRESS APP
   ============================================================ */

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

/* ============================================================
   GET /api/listings
   ============================================================ */

app.get('/api/listings', (req, res) => {
  const category = req.query.category;

  if (category !== undefined) {
    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    const rows = stmtByCategory.all(category);
    res.json(rows);
    return;
  }

  res.json(stmtAll.all());
});

/* ============================================================
   POST /api/listings
   ============================================================ */

app.post('/api/listings', async (req, res) => {
  const { category, title, description, contact, turnstileToken } = req.body || {};

  // Validate required fields
  if (typeof category !== 'string' || !VALID_CATEGORIES.has(category)) {
    res.status(400).json({ error: 'Invalid category' });
    return;
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    res.status(400).json({ error: 'Description is required' });
    return;
  }

  // Cloudflare Turnstile verification — active only when TURNSTILE_SECRET is set
  if (TURNSTILE_SECRET) {
    const verified = await verifyTurnstile(turnstileToken);
    if (!verified) {
      res.status(403).json({ error: 'CAPTCHA verification failed' });
      return;
    }
  }

  const listing = {
    id:          crypto.randomUUID(),
    category:    category.trim(),
    title:       title.trim().slice(0, TITLE_MAX),
    description: description.trim().slice(0, DESC_MAX),
    contact:     typeof contact === 'string' ? contact.trim().slice(0, CONTACT_MAX) : '',
    created_at:  new Date().toISOString(),
  };

  stmtInsert.run(listing);
  res.status(201).json(listing);
});

/* ============================================================
   GET /api/rss — Whitelist-only RSS proxy
   ============================================================ */

app.get('/api/rss', async (req, res) => {
  const targetUrl = req.query.url;

  if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  if (!WHITELIST.has(targetUrl)) {
    res.status(403).json({ error: 'URL not permitted' });
    return;
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'Accept':     'application/rss+xml, application/xml, text/xml',
        'User-Agent': 'AthensArea.net RSS Proxy/1.0',
      },
      signal:   controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!upstreamRes.ok) {
      res.status(502).json({ error: `Upstream returned ${upstreamRes.status}` });
      return;
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/xml';
    if (!contentType.includes('xml') && !contentType.includes('rss') && !contentType.includes('atom')) {
      res.status(502).json({ error: 'Upstream returned unexpected content type' });
      return;
    }

    const body = await upstreamRes.text();
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(body);

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      res.status(504).json({ error: 'Upstream request timed out' });
    } else {
      res.status(502).json({ error: 'Upstream fetch failed' });
    }
  }
});

/* ============================================================
   GET /health
   ============================================================ */

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/* ============================================================
   TURNSTILE VERIFICATION (inactive when TURNSTILE_SECRET unset)
   ============================================================ */

/**
 * Verify a Cloudflare Turnstile token against the siteverify API.
 * Only called when TURNSTILE_SECRET env var is set.
 * @param {string|null|undefined} token
 * @returns {Promise<boolean>}
 */
async function verifyTurnstile(token) {
  if (typeof token !== 'string' || token.length === 0) { return false; }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ secret: TURNSTILE_SECRET, response: token }),
    });
    if (!res.ok) { return false; }
    const json = await res.json();
    return json.success === true;
  } catch (_) {
    return false;
  }
}

/* ============================================================
   START
   ============================================================ */

app.listen(PORT, () => {
  console.log(`AthensArea proxy listening on port ${PORT}`);
  console.log(`  DB: ${DB_PATH}`);
  console.log(`  Turnstile: ${TURNSTILE_SECRET ? 'ACTIVE' : 'inactive (pre-go-live)'}`);
});
