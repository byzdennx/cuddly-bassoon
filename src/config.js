'use strict';

const path = require('path');
const pkg = require('../package.json');

module.exports = {
  name: 'EpannStream API',
  shortName: 'EpannStream',
  tagline: 'Unified Anime & Manhwa REST API',
  version: pkg.version,
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  apiPrefix: '/api/v1',
  scraperDir: path.join(__dirname, 'scrapers'),

  cache: {
    enabled: true,
    defaultTtl: 120,   // detik
    maxEntries: 800
  },

  rateLimit: {
    enabled: true,
    windowMs: 60 * 1000,
    max: 90
  },

  autoConnect: {
    watch: true,       // hot-reload folder scrapers
    debounceMs: 350
  },

  developer: {
    name: 'Epann',
    role: 'Backend Engineer / Scraper Architect',
    location: 'Indonesia',
    email: 'dev@epannstream.io',
    github: 'https://github.com/epann',
    telegram: 'https://t.me/epann',
    website: 'https://epannstream.io'
  }
};