/**
 * classifieds.js — Listings tabs, post modal, API persistence
 * Backend: POST/GET /api/listings (proxy/server.js → SQLite)
 *
 * Cloudflare Turnstile: scaffolded, inactive until go-live.
 * To activate: uncomment the Turnstile widget block in index.html
 * and set TURNSTILE_SECRET in docker-compose.yml environment.
 */

const CATEGORIES  = ['All', 'Housing', 'Jobs', 'For Sale', 'Services', 'Community'];
const TITLE_MAX   = 80;
const DESC_MAX    = 500;

/** @type {string} */
let activeCategory = 'All';

export function initClassifieds() {
  renderTabs();
  loadAndRenderListings();
  bindModal();
  bindForm();
}

/* ============================================================
   TABS
   ============================================================ */

function renderTabs() {
  const tabList = document.getElementById('classifieds-tabs');
  if (!tabList) { return; }

  tabList.innerHTML = '';
  const MAX = CATEGORIES.length;
  for (let i = 0; i < MAX; i++) {
    const cat = CATEGORIES[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.className = 'tab' + (cat === activeCategory ? ' is-active' : '');
    btn.textContent = cat;
    btn.setAttribute('aria-selected', String(cat === activeCategory));
    btn.dataset.category = cat;

    btn.addEventListener('click', () => {
      activeCategory = cat;
      syncTabs(tabList);
      loadAndRenderListings();
    });

    tabList.appendChild(btn);
  }
}

/** @param {HTMLElement} tabList */
function syncTabs(tabList) {
  const tabs = tabList.querySelectorAll('.tab');
  const MAX = tabs.length;
  for (let i = 0; i < MAX; i++) {
    const isActive = tabs[i].dataset.category === activeCategory;
    tabs[i].classList.toggle('is-active', isActive);
    tabs[i].setAttribute('aria-selected', String(isActive));
  }
}

/* ============================================================
   LISTINGS — FETCH + RENDER
   ============================================================ */

async function loadAndRenderListings() {
  const container = document.getElementById('classifieds-list');
  if (!container) { return; }

  try {
    const url = activeCategory === 'All'
      ? '/api/listings'
      : `/api/listings?category=${encodeURIComponent(activeCategory)}`;

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) { throw new Error(`Listings fetch ${res.status}`); }

    const listings = await res.json();
    renderListings(container, listings);
  } catch (_) {
    container.innerHTML =
      '<div class="empty-state"><p class="empty-state__message">Could not load listings. Try again shortly.</p></div>';
  }
}

/**
 * @param {HTMLElement} container
 * @param {Array} listings
 */
function renderListings(container, listings) {
  if (!Array.isArray(listings) || listings.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><p class="empty-state__message">No listings in this category yet.</p></div>';
    return;
  }

  container.innerHTML = '';
  const MAX = listings.length;
  for (let i = 0; i < MAX; i++) {
    container.appendChild(buildListingCard(listings[i]));
  }
}

/**
 * @param {{id: string, category: string, title: string, description: string, contact: string, created_at: string}} listing
 * @returns {HTMLElement}
 */
function buildListingCard(listing) {
  const article = document.createElement('article');
  article.className = 'listing-card';

  const dateStr = new Date(listing.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  article.innerHTML = `
    <div class="listing-card__header">
      <h3 class="listing-card__title">${esc(listing.title)}</h3>
      <span class="listing-card__category">${esc(listing.category)}</span>
    </div>
    <p class="listing-card__description">${esc(listing.description)}</p>
    <div class="listing-card__footer">
      <span>${dateStr}</span>
      ${listing.contact ? `<span>${esc(listing.contact)}</span>` : ''}
    </div>
  `;

  return article;
}

/* ============================================================
   MODAL
   ============================================================ */

function bindModal() {
  const dialog    = document.getElementById('post-modal');
  const openBtn   = document.getElementById('post-listing-btn');
  const closeBtn  = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');

  if (!dialog || !openBtn) { return; }

  openBtn.addEventListener('click', () => { dialog.showModal(); });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => { dialog.close(); resetForm(); });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => { dialog.close(); resetForm(); });
  }

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) { dialog.close(); resetForm(); }
  });
}

/* ============================================================
   FORM
   ============================================================ */

function bindForm() {
  const form      = document.getElementById('listing-form');
  const titleEl   = document.getElementById('listing-title');
  const descEl    = document.getElementById('listing-description');
  const submitBtn = document.getElementById('modal-submit');

  if (!form) { return; }

  if (titleEl) {
    titleEl.addEventListener('input', () =>
      updateCharCount('title-count', titleEl.value.length, TITLE_MAX));
  }

  if (descEl) {
    descEl.addEventListener('input', () =>
      updateCharCount('desc-count', descEl.value.length, DESC_MAX));
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      submitListing(form);
    });
  }
}

/**
 * @param {string} counterId
 * @param {number} current
 * @param {number} max
 */
function updateCharCount(counterId, current, max) {
  const el = document.getElementById(counterId);
  if (!el) { return; }
  el.textContent = `${current} / ${max}`;
  el.classList.toggle('is-near-limit', current >= max * 0.85 && current < max);
  el.classList.toggle('is-at-limit',   current >= max);
}

/** @param {HTMLFormElement} form */
async function submitListing(form) {
  const submitBtn = document.getElementById('modal-submit');
  const category    = form.category.value.trim();
  const title       = form.title.value.trim();
  const description = form.description.value.trim();
  const contact     = form.contact.value.trim();

  // Client-side guard — required fields
  if (!category) { form.category.focus(); return; }
  if (!title)    { form.title.focus();    return; }
  if (!description) { form.description.focus(); return; }

  // --- Turnstile token (inactive until go-live) ---
  // When Turnstile widget is uncommented in index.html, this will return a token.
  // Server ignores the field when TURNSTILE_SECRET env var is unset.
  const turnstileToken = getTurnstileToken();

  const body = {
    category,
    title:       title.slice(0, TITLE_MAX),
    description: description.slice(0, DESC_MAX),
    contact:     contact.slice(0, 100),
    turnstileToken,
  };

  if (submitBtn) { submitBtn.disabled = true; }

  try {
    const res = await fetch('/api/listings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    document.getElementById('post-modal').close();
    resetForm();
    activeCategory = category;
    renderTabs();
    loadAndRenderListings();
  } catch (err) {
    // Surface error to user without exposing internals
    const msg = err.message || 'Could not submit listing. Please try again.';
    alert(msg);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; }
  }
}

/**
 * Returns the Cloudflare Turnstile token if the widget is present and solved.
 * Returns null if the widget is not yet active (pre-go-live).
 * @returns {string|null}
 */
function getTurnstileToken() {
  // Turnstile widget is scaffolded in index.html but commented out.
  // Uncomment the widget block and set TURNSTILE_SECRET on the server to activate.
  if (typeof window.turnstile === 'undefined') { return null; }
  const widget = document.getElementById('turnstile-widget');
  if (!widget) { return null; }
  return window.turnstile.getResponse(widget) || null;
}

function resetForm() {
  const form = document.getElementById('listing-form');
  if (form) { form.reset(); }
  updateCharCount('title-count', 0, TITLE_MAX);
  updateCharCount('desc-count',  0, DESC_MAX);
}

/**
 * HTML-escape for safe innerHTML insertion.
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
