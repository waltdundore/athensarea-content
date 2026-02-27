/**
 * filter.js — Source filter chips + date filter chips
 * Both filters combine with AND logic in feed.js.
 */

const DATE_OPTIONS = [
  { id: 'all',   label: 'All Time',  ms: null },
  { id: 'today', label: 'Today',     ms: 24 * 60 * 60 * 1000 },
  { id: 'week',  label: 'This Week', ms: 7 * 24 * 60 * 60 * 1000 },
];

/** @type {Set<string>} Active source IDs. Empty = all shown. */
const activeFilters = new Set();

/** @type {string} Active date window ID */
let activeDate = 'all';

/** @type {((activeIds: Set<string>) => void)|null} */
let onFilterChange = null;

/**
 * Register callback — called whenever source or date filter changes.
 * @param {(activeIds: Set<string>) => void} callback
 */
export function onFilterChangeCallback(callback) {
  onFilterChange = callback;
}

/**
 * Returns the cutoff timestamp for the active date filter, or null for all time.
 * @returns {number|null}
 */
export function getDateFilter() {
  const opt = DATE_OPTIONS.find(o => o.id === activeDate);
  if (!opt || opt.ms === null) { return null; }
  return Date.now() - opt.ms;
}

/**
 * Returns whether a source ID is currently visible.
 * @param {string} id
 * @returns {boolean}
 */
export function isSourceVisible(id) {
  return activeFilters.size === 0 || activeFilters.has(id);
}

/**
 * Render date chips then source chips into #filter-bar.
 * @param {import('./app.js').SOURCES} sources
 */
export function initFilter(sources) {
  const bar = document.getElementById('filter-bar');
  if (!bar) { return; }

  // --- Date chips ---
  const MAX_DATE = DATE_OPTIONS.length;
  for (let i = 0; i < MAX_DATE; i++) {
    const opt  = DATE_OPTIONS[i];
    const chip = createChip(opt.label, opt.id === activeDate);
    chip.dataset.dateId = opt.id;

    chip.addEventListener('click', () => {
      activeDate = opt.id;
      syncDateChips(bar);
      notifyChange();
    });

    bar.appendChild(chip);
  }

  // --- Divider ---
  const divider = document.createElement('span');
  divider.className = 'filter-bar__divider';
  divider.setAttribute('aria-hidden', 'true');
  bar.appendChild(divider);

  // --- "All Sources" chip ---
  const allChip = createChip('All Sources', true);
  allChip.dataset.sourceAll = 'true';
  allChip.addEventListener('click', () => {
    activeFilters.clear();
    syncSourceChips(bar);
    notifyChange();
  });
  bar.appendChild(allChip);

  // --- Per-source chips ---
  const MAX_SRC = sources.length;
  for (let i = 0; i < MAX_SRC; i++) {
    const source = sources[i];

    if (source.disabled) {
      const chip = document.createElement('span');
      chip.className = 'chip chip--disabled';
      chip.textContent = source.label;
      chip.title = source.devNote || 'Coming soon';
      chip.setAttribute('aria-disabled', 'true');
      bar.appendChild(chip);
      continue;
    }

    const chip = createChip(source.label, false);
    chip.dataset.sourceId = source.id;

    chip.addEventListener('click', () => {
      if (activeFilters.has(source.id)) {
        activeFilters.delete(source.id);
      } else {
        activeFilters.add(source.id);
      }
      syncSourceChips(bar);
      notifyChange();
    });

    bar.appendChild(chip);
  }
}

/**
 * @param {string} label
 * @param {boolean} isActive
 * @returns {HTMLButtonElement}
 */
function createChip(label, isActive) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip' + (isActive ? ' is-active' : '');
  btn.textContent = label;
  return btn;
}

/** @param {HTMLElement} bar */
function syncDateChips(bar) {
  const chips = bar.querySelectorAll('[data-date-id]');
  const MAX = chips.length;
  for (let i = 0; i < MAX; i++) {
    chips[i].classList.toggle('is-active', chips[i].dataset.dateId === activeDate);
  }
}

/** @param {HTMLElement} bar */
function syncSourceChips(bar) {
  const allChip = bar.querySelector('[data-source-all]');
  if (allChip) {
    allChip.classList.toggle('is-active', activeFilters.size === 0);
  }

  const chips = bar.querySelectorAll('[data-source-id]');
  const MAX = chips.length;
  for (let i = 0; i < MAX; i++) {
    chips[i].classList.toggle('is-active', activeFilters.has(chips[i].dataset.sourceId));
  }
}

function notifyChange() {
  if (typeof onFilterChange === 'function') {
    onFilterChange(activeFilters);
  }
}
