/**
 * app.js — Entry point
 * Defines SOURCES config and initialises all modules.
 */

import { initFilter } from './filter.js';
import { initFeed }   from './feed.js';
import { initWeather } from './weather.js';
import { initClassifieds } from './classifieds.js';

/** @type {Array<{id: string, label: string, rss: string|null, jsonUrl: string|null, badge: string}>} */
export const SOURCES = [
  {
    id:      'flagpole',
    label:   'Flagpole',
    rss:     'https://flagpole.com/feed/',
    jsonUrl: null,
    badge:   'badge--flagpole',
  },
  {
    id:      'apn',
    label:   'Athens Politics Nerd',
    rss:     'https://athenspoliticsnerd.com/feed/',
    jsonUrl: null,
    badge:   'badge--apn',
  },
  {
    id:      'wuga',
    label:   'WUGA',
    rss:     'https://www.wuga.org/local-news.rss',
    jsonUrl: null,
    badge:   'badge--wuga',
  },
  {
    id:      'redblack',
    label:   'Red & Black',
    rss:     'https://redandblack.com/feed/',
    jsonUrl: null,
    badge:   'badge--redblack',
  },
  {
    id:      'ajc',
    label:   'AJC Athens',
    rss:     'https://www.ajc.com/local/athens/rss.xml',
    jsonUrl: null,
    badge:   'badge--ajc',
  },
  {
    id:      'reddit',
    label:   'r/Athens',
    rss:     null,
    jsonUrl: 'https://www.reddit.com/r/Athens.json?limit=25',
    badge:   'badge--reddit',
  },
];

/** Proxy base URL — both browser and proxy served from same origin */
export const PROXY_BASE = '/api/rss';

document.addEventListener('DOMContentLoaded', () => {
  initFilter(SOURCES);
  initFeed(SOURCES);
  initWeather();
  initClassifieds();
});
