'use strict';

const path = require('path');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const registry = require('./core/registry');
const rateLimit = require('./middleware/rate-limit');
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pages');
const logger = require('./core/logger');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('json spaces', 2);
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(compression());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.env === 'production' ? 'tiny' : 'dev'));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d' }));

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', `${config.name} v${config.version}`);
  res.setHeader('X-Author', config.developer.name);
  next();
});

// AUTO CONNECTION: scan + watch folder scrapers
registry.init();

app.use(config.apiPrefix, rateLimit, apiRoutes);
app.use('/api', (req, res) => res.redirect(307, config.apiPrefix + req.url.replace(/^\//, '/')));
app.use('/', pageRoutes);

app.use((req, res) => {
  res.status(404).render('error', {
    config,
    page: 'error',
    year: new Date().getFullYear(),
    origin: `${req.protocol}://${req.get('host')}`,
    title: '404 — Page Not Found',
    code: 404,
    heading: 'Halaman tidak ditemukan',
    message: 'Route yang kamu buka tidak tersedia di EpannStream API.'
  });
});

app.use((err, req, res, next) => {
  logger.error(err.stack || err.message);
  res.status(500).render('error', {
    config,
    page: 'error',
    year: new Date().getFullYear(),
    origin: `${req.protocol}://${req.get('host')}`,
    title: '500 — Server Error',
    code: 500,
    heading: 'Terjadi kesalahan internal',
    message: err.message
  });
});

module.exports = app;