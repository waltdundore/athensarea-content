/**
 * filter.js — Source filter chips
 * Renders chip UI from SOURCES. Maintains active set. Triggers feed re-filter.
 */

/** @type {Set<string>} Active source IDs. Empty = all shown. */
const activeFilters = new Set();

/** @type {((activeIds: Set<string>) => void)|null} Callback registered by feed.js */
let onFilterChange = null;

/**
 * Register a callback to be notified when filters change.
 * @param {(activeIds: Set<string>) => void} callback
 */
export function onFilterChangeCallback(callback) {
  onFilterChange = callback;
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
 * Render filter chips into #filter-bar.
 * @param {import('./app.js').SOURCES} sources
 */
export function initFilter(sources) {
  const bar = document.getElementById('filter-bar');
  if (!bar) { return; }

  // "All" chip
  const allChip = createChip('All', true);
  allChip.addEventListener('click', () => {
    activeFilters.clear();
    syncChipStates(bar);
    notifyChange();
  });
  bar.appendChild(allChip);

  // Per-source chips
  const MAX = sources.length;
  for (let i = 0; i < MAX; i++) {
    const source = sources[i];
    const chip = createChip(source.label, false);
    chip.dataset.sourceId = source.id;

    chip.addEventListener('click', () => {
      if (activeFilters.has(source.id)) {
        activeFilters.delete(source.id);
      } else {
        activeFilters.add(source.id);
      }
      syncChipStates(bar);
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

/**
 * Update chip active states to match activeFilters.
 * @param {HTMLElement} bar
 */
function syncChipStates(bar) {
  const chips = bar.querySelectorAll('.chip');
  const MAX = chips.length;
  for (let i = 0; i < MAX; i++) {
    const chip = chips[i];
    const sourceId = chip.dataset.sourceId;
    if (!sourceId) {
      // "All" chip
      chip.classList.toggle('is-active', activeFilters.size === 0);
    } else {
      chip.classList.toggle('is-active', activeFilters.has(sourceId));
    }
  }
}

function notifyChange() {
  if (typeof onFilterChange === 'function') {
    onFilterChange(activeFilters);
  }
}
