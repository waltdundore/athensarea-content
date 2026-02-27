/**
 * classifieds.js — Listings tabs, post modal, localStorage persistence
 * Storage key: 'athensarea_classifieds'
 * Fields: id, category, title, description, contact, date
 */

const STORAGE_KEY = 'athensarea_classifieds';
const CATEGORIES  = ['All', 'Housing', 'Jobs', 'For Sale', 'Services', 'Community'];
const TITLE_MAX   = 80;
const DESC_MAX    = 500;

/** @type {string} Active tab category */
let activeCategory = 'All';

export function initClassifieds() {
  renderTabs();
  renderListings();
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
    btn.role = 'tab';
    btn.className = 'tab' + (cat === activeCategory ? ' is-active' : '');
    btn.textContent = cat;
    btn.setAttribute('aria-selected', String(cat === activeCategory));
    btn.dataset.category = cat;

    btn.addEventListener('click', () => {
      activeCategory = cat;
      syncTabs(tabList);
      renderListings();
    });

    tabList.appendChild(btn);
  }
}

/**
 * @param {HTMLElement} tabList
 */
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
   LISTINGS
   ============================================================ */

/**
 * @returns {Array<{id: string, category: string, title: string, description: string, contact: string, date: string}>}
 */
function loadListings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return []; }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * @param {Array} listings
 */
function saveListings(listings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
  } catch (_) {
    // Storage full or unavailable — silent; user will see listing missing on reload
  }
}

function renderListings() {
  const container = document.getElementById('classifieds-list');
  if (!container) { return; }

  const all = loadListings();
  const filtered = activeCategory === 'All'
    ? all
    : all.filter(l => l.category === activeCategory);

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><p class="empty-state__message">No listings in this category yet.</p></div>';
    return;
  }

  container.innerHTML = '';
  // Newest first
  const sorted = filtered.slice().sort((a, b) => b.date.localeCompare(a.date));
  const MAX = sorted.length;
  for (let i = 0; i < MAX; i++) {
    container.appendChild(buildListingCard(sorted[i]));
  }
}

/**
 * @param {{id: string, category: string, title: string, description: string, contact: string, date: string}} listing
 * @returns {HTMLElement}
 */
function buildListingCard(listing) {
  const article = document.createElement('article');
  article.className = 'listing-card';
  article.dataset.listingId = listing.id;

  const dateStr = new Date(listing.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  // Escape before inserting into innerHTML
  const title    = esc(listing.title);
  const desc     = esc(listing.description);
  const contact  = listing.contact ? esc(listing.contact) : '';
  const category = esc(listing.category);

  article.innerHTML = `
    <div class="listing-card__header">
      <h3 class="listing-card__title">${title}</h3>
      <span class="listing-card__category">${category}</span>
    </div>
    <p class="listing-card__description">${desc}</p>
    <div class="listing-card__footer">
      <span>${dateStr}</span>
      ${contact ? `<span>${contact}</span>` : ''}
    </div>
  `;

  return article;
}

/**
 * HTML-escape a string to prevent XSS in innerHTML.
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
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      dialog.close();
      resetForm();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      dialog.close();
      resetForm();
    });
  }

  // Close on backdrop click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.close();
      resetForm();
    }
  });
}

/* ============================================================
   FORM
   ============================================================ */

function bindForm() {
  const form     = document.getElementById('listing-form');
  const titleEl  = document.getElementById('listing-title');
  const descEl   = document.getElementById('listing-description');
  const submitBtn = document.getElementById('modal-submit');

  if (!form) { return; }

  // Character counters
  if (titleEl) {
    titleEl.addEventListener('input', () => updateCharCount('title-count', titleEl.value.length, TITLE_MAX));
  }
  if (descEl) {
    descEl.addEventListener('input', () => updateCharCount('desc-count', descEl.value.length, DESC_MAX));
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

/**
 * @param {HTMLFormElement} form
 */
function submitListing(form) {
  const category    = form.category.value.trim();
  const title       = form.title.value.trim();
  const description = form.description.value.trim();
  const contact     = form.contact.value.trim();

  // Validate required fields
  if (!category || !title || !description) {
    // Focus first invalid field
    if (!category) { form.category.focus(); }
    else if (!title) { form.title.focus(); }
    else { form.description.focus(); }
    return;
  }

  const listing = {
    id:          crypto.randomUUID(),
    category,
    title:       title.slice(0, TITLE_MAX),
    description: description.slice(0, DESC_MAX),
    contact:     contact.slice(0, 100),
    date:        new Date().toISOString(),
  };

  const listings = loadListings();
  listings.push(listing);
  saveListings(listings);

  document.getElementById('post-modal').close();
  resetForm();

  // Switch to matching category tab if not 'All'
  activeCategory = category;
  renderTabs();
  renderListings();
}

function resetForm() {
  const form = document.getElementById('listing-form');
  if (form) { form.reset(); }
  updateCharCount('title-count', 0, TITLE_MAX);
  updateCharCount('desc-count',  0, DESC_MAX);
}
