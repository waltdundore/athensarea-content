/**
 * weather.js — NWS weather widget
 * Uses api.weather.gov (no API key, CORS-open, US government data).
 *
 * Two-step fetch:
 *   1. GET /points/{lat},{lon}      → returns gridpoint metadata
 *   2. GET gridpoint forecast URL   → returns forecast periods
 *
 * Athens, GA: 33.9519, -83.3576
 */

const LAT = 33.9519;
const LON = -83.3576;
const NWS_POINTS_URL = `https://api.weather.gov/points/${LAT},${LON}`;
const REQUEST_HEADERS = { 'Accept': 'application/geo+json', 'User-Agent': 'AthensArea.net' };

export function initWeather() {
  fetchWeather();
}

async function fetchWeather() {
  const display = document.getElementById('weather-display');
  if (!display) { return; }

  try {
    const forecastUrl = await resolveGridpointUrl();
    const period      = await fetchCurrentPeriod(forecastUrl);
    renderWeather(display, period);
  } catch (err) {
    renderError(display, 'Weather unavailable');
  }
}

/**
 * Fetch /points to get the gridpoint forecast URL.
 * @returns {Promise<string>} forecast URL
 */
async function resolveGridpointUrl() {
  const res = await fetch(NWS_POINTS_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) { throw new Error(`NWS points ${res.status}`); }
  const json = await res.json();
  const url  = json?.properties?.forecast;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('No forecast URL in NWS points response');
  }
  return url;
}

/**
 * Fetch the forecast and return the first (current) period.
 * @param {string} forecastUrl
 * @returns {Promise<{name: string, temperature: number, temperatureUnit: string, shortForecast: string, detailedForecast: string}>}
 */
async function fetchCurrentPeriod(forecastUrl) {
  const res = await fetch(forecastUrl, { headers: REQUEST_HEADERS });
  if (!res.ok) { throw new Error(`NWS forecast ${res.status}`); }
  const json    = await res.json();
  const periods = json?.properties?.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new Error('No forecast periods in NWS response');
  }
  return periods[0];
}

/**
 * @param {HTMLElement} display
 * @param {{name: string, temperature: number, temperatureUnit: string, shortForecast: string}} period
 */
function renderWeather(display, period) {
  display.innerHTML = `
    <div class="weather-current">
      <div class="weather-temp">${period.temperature}&deg;${period.temperatureUnit}</div>
      <div class="weather-desc">${esc(period.shortForecast)}</div>
      <div class="weather-meta">${esc(period.name)} &mdash; Athens, GA</div>
    </div>
  `;
}

/**
 * @param {HTMLElement} display
 * @param {string} message
 */
function renderError(display, message) {
  display.innerHTML = `<p class="weather-error">${esc(message)}</p>`;
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
    .replace(/"/g, '&quot;');
}
