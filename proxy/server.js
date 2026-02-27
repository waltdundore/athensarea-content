/**
 * server.js — Whitelist-only RSS proxy
 *
 * Security requirements:
 *   - Only URLs in WHITELIST may pass through (403 otherwise)
 *   - Outbound request headers stripped (no cookie/auth leakage)
 *   - Rate-limited per IP
 *   - Timeout on upstream fetch
 */

'use strict';

const express    = require('express');
const rateLimit  = require('express-rate-limit');

const PORT             = process.env.PORT || 3001;
const RATE_LIMIT_MAX   = parseInt(process.env.RATE_LIMIT_MAX || '60', 10);
const UPSTREAM_TIMEOUT = 8000; // ms

/** Exact whitelist of permitted upstream URLs */
const WHITELIST = new Set([
  'https://flagpole.com/feed/',
  'https://athenspoliticsnerd.com/feed/',
  'https://www.wuga.org/local-news.rss',
  'https://redandblack.com/feed/',
  'https://www.ajc.com/local/athens/rss.xml',
]);

const app = express();
app.disable('x-powered-by');

// Rate limit: configurable, default 60 req/min per IP
const limiter = rateLimit({
  windowMs:         60 * 1000,
  max:              RATE_LIMIT_MAX,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many requests' },
});

app.use('/api/rss', limiter);

app.get('/api/rss', async (req, res) => {
  const targetUrl = req.query.url;

  // Validate URL parameter exists and is a string
  if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  // Enforce whitelist — reject anything not explicitly permitted
  if (!WHITELIST.has(targetUrl)) {
    res.status(403).json({ error: 'URL not permitted' });
    return;
  }

  // Only forward safe headers upstream — no cookies, no auth, no referrer
  const upstreamHeaders = {
    'Accept':          'application/rss+xml, application/xml, text/xml',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent':      'AthensArea.net RSS Proxy/1.0',
  };

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal:  controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!upstreamRes.ok) {
      res.status(502).json({ error: `Upstream returned ${upstreamRes.status}` });
      return;
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/xml';
    const body        = await upstreamRes.text();

    // Only serve XML/RSS content types
    if (!contentType.includes('xml') && !contentType.includes('rss') && !contentType.includes('atom')) {
      res.status(502).json({ error: 'Upstream returned unexpected content type' });
      return;
    }

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300'); // 5-minute cache
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

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`RSS proxy listening on port ${PORT}`);
});
