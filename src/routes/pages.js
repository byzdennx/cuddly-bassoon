'use strict';

const express = require('express');
const config = require('../config');
const registry = require('../core/registry');

const router = express.Router();

function baseCtx(req, page) {
  return {
    config,
    page,
    origin: `${req.protocol}://${req.get('host')}`,
    year: new Date().getFullYear()
  };
}

router.get('/', (req, res) => {
  const modules = registry.list();
  res.render('index', {
    ...baseCtx(req, 'home'),
    title: `${config.name} — ${config.tagline}`,
    modules,
    totalEndpoints: modules.reduce((n, m) => n + m.totalEndpoints, 0)
  });
});

router.get('/docs', (req, res) => {
  res.render('docs', {
    ...baseCtx(req, 'docs'),
    title: `Documentation — ${config.name}`,
    modules: registry.list()
  });
});

router.get('/playground', (req, res) => {
  res.render('playground', {
    ...baseCtx(req, 'playground'),
    title: `Playground — ${config.name}`,
    modules: registry.list()
  });
});

router.get('/status', (req, res) => {
  res.render('status', {
    ...baseCtx(req, 'status'),
    title: `Status — ${config.name}`
  });
});

router.get('/about', (req, res) => {
  res.render('about', {
    ...baseCtx(req, 'about'),
    title: `About Developer — ${config.name}`,
    modules: registry.list()
  });
});

module.exports = router;