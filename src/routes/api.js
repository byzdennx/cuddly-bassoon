'use strict';

const express = require('express');
const os = require('os');

const config = require('../config');
const registry = require('../core/registry');
const cache = require('../core/cache');
const { envelope, failure } = require('../core/response');

const router = express.Router();
const bootedAt = Date.now();

router.get('/', (req, res) => {
  const modules = registry.list();
  res.json(
    envelope({
      endpoint: config.apiPrefix,
      durationMs: 0,
      data: {
        service: config.name,
        tagline: config.tagline,
        version: config.version,
        developer: config.developer.name,
        docs: '/docs',
        playground: '/playground',
        autoConnect: true,
        totalModules: modules.length,
        totalEndpoints: modules.reduce((n, m) => n + m.totalEndpoints, 0),
        modules: modules.map((m) => ({
          id: m.id, name: m.name, basePath: m.basePath, endpoints: m.totalEndpoints
        }))
      }
    })
  );
});

router.get('/endpoints', (req, res) => {
  res.json(
    envelope({ endpoint: `${config.apiPrefix}/endpoints`, durationMs: 0, data: registry.list() })
  );
});

router.get('/health', (req, res) => {
  res.json(
    envelope({
      endpoint: `${config.apiPrefix}/health`,
      durationMs: 0,
      data: {
        healthy: true,
        uptimeSeconds: Math.floor((Date.now() - bootedAt) / 1000),
        node: process.version,
        platform: `${os.type()} ${os.release()}`
      }
    })
  );
});

router.get('/stats', (req, res) => {
  const mem = process.memoryUsage();
  res.json(
    envelope({
      endpoint: `${config.apiPrefix}/stats`,
      durationMs: 0,
      data: {
        uptimeSeconds: Math.floor((Date.now() - bootedAt) / 1000),
        node: process.version,
        platform: `${os.type()} ${os.release()} (${os.arch()})`,
        memory: {
          rssMB: +(mem.rss / 1048576).toFixed(2),
          heapUsedMB: +(mem.heapUsed / 1048576).toFixed(2),
          heapTotalMB: +(mem.heapTotal / 1048576).toFixed(2)
        },
        cache: cache.stats(),
        registry: registry.stats(),
        modules: registry.list().map((m) => ({
          id: m.id,
          name: m.name,
          endpoints: m.endpoints.map((e) => ({ route: e.route, method: e.method, hits: e.hits }))
        }))
      }
    })
  );
});

router.post('/cache/flush', (req, res) => {
  const cleared = cache.flush();
  res.json(envelope({ endpoint: `${config.apiPrefix}/cache/flush`, durationMs: 0, data: { cleared } }));
});

router.post('/registry/reload', (req, res) => {
  registry.reload('api');
  res.json(envelope({ endpoint: `${config.apiPrefix}/registry/reload`, durationMs: 0, data: registry.stats() }));
});

// >>> semua endpoint scraper otomatis nempel di sini <<<
router.use(registry.dispatch());

router.use((req, res) => {
  res.status(404).json(
    failure({
      endpoint: req.originalUrl,
      code: 404,
      message: 'API endpoint not found',
      hint: `Lihat daftar endpoint di ${config.apiPrefix}/endpoints`
    })
  );
});

module.exports = router;