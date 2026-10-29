/**
 * classifieds.js — Listings tabs, post modal, API persistence
 * Backend: GET/POST/DELETE /api/listings (proxy/server.js → SQLite)
 *
 * Cloudflare Turnstile: enabled server-side. On modal open we fetch
 * GET /api/config; when the server reports Turnstile active we load the
 * Cloudflare script, render the widget with the returned public site key,
 * and block submit until a token exists. With Turnstile disabled server-side
 * the form posts as before.
 */

const CATEGORIES  = ['All', 'Housing', 'Jobs', 'For Sale', 'Services', 'Community'];
const TITLE_MAX   = 80;
const DESC_MAX    = 500;

/** @type {string} */
let activeCategory = 'All';

/** Turnstile state: null config = not fetched yet. */
let turnstileCfg      = null; // { enabled: boolean, siteKey: string } | null
let turnstileToken    = null;
let turnstileWidgetId = null;

export function initClassifieds() {
  renderTabs();
  loadAndRenderListings();
  bindModal();
  bindForm();
  bindDelete();
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
  } catch (err) {
    // Nothing here is the reader's fault, and "try again shortly" is a promise
    // we cannot keep — hand them the retry instead.
    console.warn('listings load failed', err);
    container.innerHTML =
      '<div class="empty-state"><p class="empty-state__message">The listings did not load. Nothing you typed is lost.</p>' +
      '<button type="button" class="btn btn--secondary" data-retry-listings>Try again</button></div>';
    const retry = container.querySelector('[data-retry-listings]');
    if (retry) { retry.addEventListener('click', () => loadAndRenderListings()); }
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
      <button type="button" class="listing-card__delete" data-delete-id="${esc(listing.id)}"
        aria-label="Remove listing: ${esc(listing.title)}">&times;</button>
    </div>
  `;

  return article;
}

/* ============================================================
   DELETE
   ============================================================ */

/** Delegated once: cards are re-rendered on every fetch/tab change. */
function bindDelete() {
  const container = document.getElementById('classifieds-list');
  if (!container) { return; }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-id]');
    if (btn) { deleteListing(btn.dataset.deleteId); }
  });
}

/** @param {string} id */
async function deleteListing(id) {
  const container = document.getElementById('classifieds-list');
  if (!container) { return; }

  // Removal is permanent and this path has no undo, so the resting answer is
  // "not yet".
  if (!window.confirm('Remove this listing? This cannot be undone.')) { return; }

  try {
    const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }
    await loadAndRenderListings();
  } catch (err) {
    console.warn('listing delete failed', err);
    showDeleteError(humanError(err, 'We could not remove that listing. It is still posted — try again.'));
  }
}

/** @param {string} msg */
function showDeleteError(msg) {
  const container = document.getElementById('classifieds-list');
  if (!container) { return; }

  let err = container.querySelector('.listing-delete-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'form-error listing-delete-error';
    err.setAttribute('role', 'alert');
    container.prepend(err);
  }
  err.textContent = msg;
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

  openBtn.addEventListener('click', () => {
    dialog.showModal();
    setupTurnstile();
  });

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

  if (!form) { return; }

  if (titleEl) {
    titleEl.addEventListener('input', () =>
      updateCharCount('title-count', titleEl.value.length, TITLE_MAX));
  }

  if (descEl) {
    descEl.addEventListener('input', () =>
      updateCharCount('desc-count', descEl.value.length, DESC_MAX));
  }

  // Handle 'submit' on the form, never click on the button. #modal-submit lives
  // in the modal footer and is tied to the form with form="listing-form", so a
  // click listener misses implicit submission (Enter in a text field) and
  // form.requestSubmit(); those fell through to the form's default GET
  // submission and reloaded the page without posting anything.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitListing(form);
  });
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

  // Required fields: name the field and say what to do about it. Moving focus
  // in silence reads as a form that refuses to answer.
  if (!category)    { showFormError('Choose a category so people can find your listing.', form.category); return; }
  if (!title)       { showFormError('Add a short title — it is the first thing people read.', form.title); return; }
  if (!description) { showFormError('Say what you are listing, then send it.', form.description); return; }
  clearFormError();

  // --- Turnstile gate: block submit with a visible error until solved ---
  if (turnstileCfg && turnstileCfg.enabled && !turnstileToken) {
    showTurnstileError('Please complete the security check first.');
    return;
  }

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
    // The dialog and everything typed into it stay put. The status code goes
    // to the console; the next step goes to the person.
    console.warn('listing submit failed', err);
    showFormError(humanError(err, navigator.onLine
      ? 'We could not post your listing. Nothing was saved — check the details and try again.'
      : 'You look offline. Everything you typed is still here — try again once you are back.'));
  } finally {
    if (submitBtn) { submitBtn.disabled = false; }
  }
}

/* ============================================================
   TURNSTILE — /api/config-driven widget
   ============================================================ */

/** Fetch /api/config once per page load, then render the widget if enabled. */
async function setupTurnstile() {
  if (!turnstileCfg) {
    try {
      const res = await fetch('/api/config', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) { throw new Error(`config fetch ${res.status}`); }
      const cfg = await res.json();
      turnstileCfg = {
        enabled: cfg.turnstile === true && typeof cfg.siteKey === 'string' && cfg.siteKey.length > 0,
        siteKey: typeof cfg.siteKey === 'string' ? cfg.siteKey : '',
      };
    } catch (_) {
      // Fail closed server-side: posts without a token are rejected with a
      // visible error when TURNSTILE_SECRET is set.
      turnstileCfg = { enabled: false, siteKey: '' };
      return;
    }
  }

  if (!turnstileCfg.enabled || turnstileWidgetId !== null) { return; }

  try {
    await loadTurnstileScript();
    renderTurnstileWidget();
  } catch (_) {
    showTurnstileError('The security check could not be loaded. Please try again.');
  }
}

/** @returns {Promise<void>} resolves when window.turnstile is available. */
function loadTurnstileScript() {
  if (window.turnstile) { return Promise.resolve(); }
  const existing = document.getElementById('turnstile-script');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')));
    });
  }
  return new Promise((resolve, reject) => {
    const script  = document.createElement('script');
    script.id     = 'turnstile-script';
    script.src    = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async  = true;
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error('turnstile script failed'));
    document.head.appendChild(script);
  });
}

function renderTurnstileWidget() {
  const slot     = getTurnstileSlot();
  const widgetEl = slot.querySelector('#turnstile-widget');
  hideTurnstileError();
  turnstileWidgetId = window.turnstile.render(widgetEl, {
    sitekey: turnstileCfg.siteKey,
    theme:   'light',
    callback: (token) => {
      turnstileToken = token;
      hideTurnstileError();
    },
    'expired-callback': () => {
      turnstileToken = null;
      showTurnstileError('Security check expired. Please solve it again.');
    },
    'error-callback': () => { turnstileToken = null; },
  });
}

/** Create (once) the widget + error slot at the end of the listing form. */
function getTurnstileSlot() {
  let slot = document.getElementById('turnstile-slot');
  if (slot) { return slot; }

  slot = document.createElement('div');
  slot.id       = 'turnstile-slot';
  slot.className = 'form-group';

  const widget  = document.createElement('div');
  widget.id     = 'turnstile-widget';

  const err     = document.createElement('p');
  err.id        = 'turnstile-error';
  err.className = 'form-error';
  err.setAttribute('role', 'alert');
  err.hidden    = true;

  slot.appendChild(widget);
  slot.appendChild(err);
  document.getElementById('listing-form').appendChild(slot);
  return slot;
}

/** @param {string} msg */
function showTurnstileError(msg) {
  const err = getTurnstileSlot().querySelector('#turnstile-error');
  err.textContent = msg;
  err.hidden      = false;
}

function hideTurnstileError() {
  const slot = document.getElementById('turnstile-slot');
  if (!slot) { return; }
  slot.querySelector('#turnstile-error').hidden = true;
}

function resetForm() {
  const form = document.getElementById('listing-form');
  if (form) { form.reset(); }
  updateCharCount('title-count', 0, TITLE_MAX);
  updateCharCount('desc-count',  0, DESC_MAX);

  turnstileToken = null;
  if (turnstileWidgetId !== null && window.turnstile) {
    window.turnstile.reset(turnstileWidgetId);
  }
  hideTurnstileError();
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


/* ------------------------------------------------------------------ *
 * In-dialog feedback. Replaces the blocking dialog and the silent focus()
 * jumps on required fields: the dialog stays open, the typed text stays
 * in place, the message names the field and the next step, and the raw
 * error goes to the console where it is actually useful.
 * ------------------------------------------------------------------ */

/** @param {string} msg @param {HTMLElement} [field] */
function showFormError(msg, field) {
  const form = document.getElementById('listing-form');
  if (!form) { return; }
  let err = document.getElementById('form-error');
  if (!err) {
    err = document.createElement('p');
    err.id        = 'form-error';
    err.className = 'form-error';
    err.setAttribute('role', 'alert');
    form.appendChild(err);
  }
  err.textContent = msg;
  err.hidden      = false;
  clearInvalidFields();
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', err.id);
    field.focus();
  }
}

function clearFormError() {
  const err = document.getElementById('form-error');
  if (err) { err.hidden = true; }
  clearInvalidFields();
}

function clearInvalidFields() {
  const form = document.getElementById('listing-form');
  if (!form) { return; }
  const marked = form.querySelectorAll('[aria-invalid="true"]');
  for (let i = 0; i < marked.length; i++) {
    marked[i].removeAttribute('aria-invalid');
    marked[i].removeAttribute('aria-describedby');
  }
}

/**
 * The API sometimes answers with a sentence written for a person; a bare
 * status code is not one, and it must never reach the screen.
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
function humanError(err, fallback) {
  const msg = String((err && err.message) || '');
  if (!msg || /^(Server error|Listings fetch|config fetch)\b/.test(msg)) { return fallback; }
  // Browser and transport strings ("Failed to fetch", "TypeError: ...",
  // "HTTP 503") stay in the console; people get the plain sentence above.
  if (/[A-Za-z]+Error|failed to fetch|networkerror|aborterror|\bhttp\b|\bstatus\b|[0-9]{3}/i.test(msg)) { return fallback; }
  return msg;
}


/* A stale inline error must not greet someone who closed the dialog and came
   back with better intentions. */
const postModalEl = document.getElementById('post-modal');
if (postModalEl) { postModalEl.addEventListener('close', clearFormError); }
