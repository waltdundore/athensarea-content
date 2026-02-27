/**
 * feed.js — Fetch, parse, and render news articles
 *
 * RSS sources  → /api/rss?url={encoded}  (same-origin proxy, avoids CORS)
 * Reddit       → direct JSON fetch        (Reddit allows cross-origin)
 */

import { SOURCES, PROXY_BASE } from './app.js';
import { onFilterChangeCallback, getDateFilter } from './filter.js';

/** @type {Array<{sourceId: string, title: string, link: string, excerpt: string, date: string, badge: string}>} */
let allArticles = [];

export function initFeed(sources) {
  onFilterChangeCallback(renderFiltered);
  fetchAllSources(sources);
}

/* ============================================================
   FETCHING
   ============================================================ */

/**
 * @param {typeof SOURCES} sources
 */
async function fetchAllSources(sources) {
  const MAX = sources.length;
  const promises = [];
  for (let i = 0; i < MAX; i++) {
    promises.push(fetchSource(sources[i]));
  }
  // Fetch all concurrently; failures are isolated per source
  await Promise.allSettled(promises);
  renderFiltered(new Set());
}

/**
 * @param {typeof SOURCES[0]} source
 */
async function fetchSource(source) {
  if (source.disabled) { return; }
  try {
    const articles = source.jsonUrl
      ? await fetchReddit(source)
      : await fetchRss(source);

    // Append in arrival order
    const MAX = articles.length;
    for (let i = 0; i < MAX; i++) {
      allArticles.push(articles[i]);
    }
  } catch (_) {
    // Source failed — silently skip; other sources still render
  }
}

/**
 * @param {typeof SOURCES[0]} source
 * @returns {Promise<Array>}
 */
async function fetchRss(source) {
  const url = `${PROXY_BASE}?url=${encodeURIComponent(source.rss)}`;
  const res = await fetch(url);
  if (!res.ok) { throw new Error(`RSS proxy ${res.status} for ${source.id}`); }
  const text = await res.text();
  return parseRss(source, text);
}

/**
 * @param {typeof SOURCES[0]} source
 * @returns {Promise<Array>}
 */
async function fetchReddit(source) {
  const res = await fetch(source.jsonUrl, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) { throw new Error(`Reddit ${res.status}`); }
  const json = await res.json();
  return parseReddit(source, json);
}

/* ============================================================
   PARSING
   ============================================================ */

/**
 * Parse RSS 2.0 XML text via DOMParser.
 * @param {typeof SOURCES[0]} source
 * @param {string} xmlText
 * @returns {Array}
 */
function parseRss(source, xmlText) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlText, 'text/xml');
  const items  = doc.querySelectorAll('item');
  const result = [];
  const MAX    = Math.min(items.length, 20);

  for (let i = 0; i < MAX; i++) {
    const item    = items[i];
    const title   = textOf(item, 'title');
    const link    = textOf(item, 'link') || textOf(item, 'guid');
    const pubDate = textOf(item, 'pubDate');
    const desc    = stripHtml(textOf(item, 'description'));

    if (!title || !link) { continue; }

    result.push({
      sourceId: source.id,
      badge:    source.badge,
      label:    source.label,
      title:    title.trim(),
      link:     link.trim(),
      excerpt:  desc.trim(),
      date:     pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }

  return result;
}

/**
 * Parse Reddit JSON feed.
 * @param {typeof SOURCES[0]} source
 * @param {object} json
 * @returns {Array}
 */
function parseReddit(source, json) {
  const posts  = json?.data?.children;
  if (!Array.isArray(posts)) { return []; }
  const result = [];
  const MAX    = Math.min(posts.length, 20);

  for (let i = 0; i < MAX; i++) {
    const post = posts[i]?.data;
    if (!post || post.stickied) { continue; }

    const title = post.title;
    const link  = post.url?.startsWith('http')
      ? post.url
      : `https://reddit.com${post.permalink}`;

    if (!title || !link) { continue; }

    result.push({
      sourceId: source.id,
      badge:    source.badge,
      label:    source.label,
      title:    title.trim(),
      link,
      excerpt:  post.selftext ? post.selftext.slice(0, 200) : '',
      date:     new Date(post.created_utc * 1000).toISOString(),
    });
  }

  return result;
}

/* ============================================================
   RENDERING
   ============================================================ */

/**
 * Returns true if the article passes both source and date filters.
 * @param {object} article
 * @param {Set<string>} activeIds
 * @returns {boolean}
 */
function isArticleVisible(article, activeIds) {
  if (activeIds.size > 0 && !activeIds.has(article.sourceId)) { return false; }

  const cutoff = getDateFilter();
  if (cutoff !== null) {
    const articleMs = new Date(article.date).getTime();
    if (articleMs < cutoff) { return false; }
  }

  return true;
}

/**
 * Render articles matching current filter state, sorted newest first.
 * @param {Set<string>} activeIds — empty means all sources shown
 */
function renderFiltered(activeIds) {
  const container = document.getElementById('articles');
  if (!container) { return; }

  const visible = allArticles.filter(a => isArticleVisible(a, activeIds));

  if (visible.length === 0 && allArticles.length === 0) {
    // Still loading — keep skeletons
    return;
  }

  if (visible.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><p class="empty-state__message">No articles match the selected filters.</p></div>';
    return;
  }

  // Sort newest first
  const sorted = visible.slice().sort((a, b) => b.date.localeCompare(a.date));

  container.innerHTML = '';
  const MAX = sorted.length;
  for (let i = 0; i < MAX; i++) {
    container.appendChild(buildCard(sorted[i], i === 0));
  }
}

/**
 * @param {object} article
 * @param {boolean} isHero — first card gets hero treatment
 * @returns {HTMLElement}
 */
function buildCard(article, isHero) {
  const el = document.createElement('article');
  el.className = 'card' + (isHero ? ' card--hero' : '');

  const dateStr = new Date(article.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });

  el.innerHTML = `
    <div class="card__body">
      <div class="card__meta">
        <span class="badge ${esc(article.badge)}">${esc(article.label)}</span>
        <span class="card__date">${dateStr}</span>
      </div>
      <h2 class="card__title">
        <a href="${esc(article.link)}" target="_blank" rel="noopener noreferrer">
          ${esc(article.title)}
        </a>
      </h2>
      ${article.excerpt ? `<p class="card__excerpt">${esc(article.excerpt)}</p>` : ''}
    </div>
  `;

  return el;
}

/* ============================================================
   UTILITIES
   ============================================================ */

/**
 * Get text content of the first matching child element.
 * @param {Element} parent
 * @param {string} tagName
 * @returns {string}
 */
function textOf(parent, tagName) {
  const el = parent.querySelector(tagName);
  return el ? el.textContent || '' : '';
}

/**
 * Strip HTML tags from a string for safe plain-text display.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/**
 * HTML-escape for safe attribute and innerHTML use.
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
