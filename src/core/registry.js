'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const config = require('../config');
const logger = require('./logger');
const cache = require('./cache');
const { envelope, failure } = require('./response');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const RESERVED_IDS = new Set(['endpoints', 'health', 'stats', 'manifest', 'openapi', 'docs', 'cache']);

const slugify = (s) =>
  String(s).trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');

class ScraperRegistry {
  constructor() {
    this.dir = config.scraperDir;
    this.scrapers = [];
    this.errors = [];
    this.hits = new Map();
    this.router = express.Router();
    this.loadedAt = null;
    this._watcher = null;
    this._timer = null;
  }

  /* ------------------------------------------------------------------ *
   * BOOT
   * ------------------------------------------------------------------ */
  init() {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    this.load();
    if (config.autoConnect.watch) this.watch();
    return this;
  }

  /** middleware yang selalu menunjuk ke router terbaru (hot swap) */
  dispatch() {
    return (req, res, next) => this.router(req, res, next);
  }

  /* ------------------------------------------------------------------ *
   * LOADER
   * ------------------------------------------------------------------ */
  load() {
    const started = Date.now();
    const files = fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.js') && !f.startsWith('_') && !f.startsWith('.'));

    const scrapers = [];
    const errors = [];
    const seen = new Set();

    for (const file of files) {
      const full = path.join(this.dir, file);
      try {
        delete require.cache[require.resolve(full)];
        const mod = require(full);
        const normalized = this._normalize(mod, file);

        if (RESERVED_IDS.has(normalized.id)) {
          throw new Error(`scraper id "${normalized.id}" is reserved`);
        }
        if (seen.has(normalized.id)) {
          throw new Error(`duplicate scraper id "${normalized.id}"`);
        }
        seen.add(normalized.id);
        scrapers.push(normalized);
      } catch (err) {
        errors.push({ file, message: err.message });
        logger.error(`Cannot connect scraper "${file}" -> ${err.message}`);
      }
    }

    scrapers.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));

    this.scrapers = scrapers;
    this.errors = errors;
    this.loadedAt = new Date().toISOString();
    this._buildRouter();

    const totalEndpoints = scrapers.reduce((n, s) => n + s.endpoints.length, 0);
    logger.success(
      `Auto-connect done in ${Date.now() - started}ms | modules: ${scrapers.length} | endpoints: ${totalEndpoints}` +
      (errors.length ? ` | failed: ${errors.length}` : '')
    );
    scrapers.forEach((s) =>
      s.endpoints.forEach((e) => logger.route(`${e.method.padEnd(6)} ${config.apiPrefix}${e.fullPath}`))
    );
    return this;
  }

  reload(reason = 'manual') {
    logger.warn(`Reloading scraper registry (${reason})...`);
    return this.load();
  }

  watch() {
    if (this._watcher) return;
    try {
      this._watcher = fs.watch(this.dir, (evt, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        if (filename.startsWith('_') || filename.startsWith('.')) return;
        clearTimeout(this._timer);
        this._timer = setTimeout(
          () => this.reload(`fs:${evt}:${filename}`),
          config.autoConnect.debounceMs
        );
      });
      logger.info(`Watching "${path.relative(process.cwd(), this.dir)}" for new scrapers...`);
    } catch (err) {
      logger.warn(`Watcher disabled: ${err.message}`);
    }
  }

  /* ------------------------------------------------------------------ *
   * NORMALIZER — bikin manifest dari module apa adanya
   * ------------------------------------------------------------------ */
  _normalize(mod, file) {
    if (!mod || typeof mod !== 'object') throw new Error('module must export an object');

    const meta = mod.meta || {};
    const id = slugify(meta.id || path.basename(file, '.js'));
    if (!id) throw new Error('invalid scraper id');

    const rawEndpoints = Array.isArray(mod.endpoints) ? mod.endpoints : [];
    if (!rawEndpoints.length) throw new Error('no endpoints exported');

    const endpoints = rawEndpoints.map((ep, i) => this._normalizeEndpoint(ep, id, i, file));

    return {
      id,
      file,
      name: meta.name || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: meta.description || 'No description provided.',
      baseUrl: meta.baseUrl || null,
      icon: meta.icon || 'boxes',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      order: Number.isFinite(meta.order) ? meta.order : 50,
      stability: meta.stability || 'stable',
      basePath: `${config.apiPrefix}/${id}`,
      endpoints
    };
  }

  _normalizeEndpoint(ep, scraperId, index, file) {
    if (typeof ep.handler !== 'function') {
      throw new Error(`endpoint #${index + 1} in ${file} has no handler()`);
    }

    const method = String(ep.method || 'GET').toUpperCase();
    if (!HTTP_METHODS.includes(method.toLowerCase())) {
      throw new Error(`unsupported method "${method}" in ${file}`);
    }

    let p = String(ep.path || '/').trim();
    if (!p.startsWith('/')) p = `/${p}`;
    p = p.replace(/\/+$/, '') || '';

    const fullPath = `/${scraperId}${p}`;
    const params = this._normalizeParams(ep.params, fullPath);

    return {
      key: `${scraperId}.${slugify(ep.name || p || 'index')}`,
      name: ep.name || (p ? p.replace(/^\//, '') : 'index'),
      method,
      path: p || '/',
      fullPath,
      route: `${config.apiPrefix}${fullPath}`,
      description: ep.description || 'No description.',
      group: ep.group || 'General',
      cache: Number.isFinite(ep.cache) ? ep.cache : config.cache.defaultTtl,
      deprecated: !!ep.deprecated,
      params,
      responseShape: ep.responseShape || null,
      exampleUrl: this._buildExample(`${config.apiPrefix}${fullPath}`, params),
      handler: ep.handler
    };
  }

  _normalizeParams(declared, fullPath) {
    const list = Array.isArray(declared) ? declared.map((d) => ({ ...d })) : [];

    // auto-detect path params yang belum dideklarasikan
    const found = [...fullPath.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    for (const name of found) {
      if (!list.some((x) => x.name === name)) {
        list.push({ name, in: 'path', type: 'string', required: true, description: `Path parameter "${name}"` });
      }
    }

    return list.map((p) => ({
      name: p.name,
      in: p.in || (found.includes(p.name) ? 'path' : 'query'),
      type: p.type || 'string',
      required: p.in === 'path' || found.includes(p.name) ? true : !!p.required,
      default: p.default ?? null,
      example: p.example ?? p.default ?? null,
      enum: Array.isArray(p.enum) ? p.enum : null,
      description: p.description || ''
    }));
  }

  _buildExample(route, params) {
    let url = route;
    const qs = [];
    for (const p of params) {
      const val = p.example ?? p.default;
      if (p.in === 'path') {
        url = url.replace(`:${p.name}`, encodeURIComponent(val ?? 'value'));
      } else if (val !== null && val !== undefined && val !== '') {
        qs.push(`${p.name}=${encodeURIComponent(val)}`);
      }
    }
    return url + (qs.length ? `?${qs.join('&')}` : '');
  }

  /* ------------------------------------------------------------------ *
   * ROUTER BUILDER
   * ------------------------------------------------------------------ */
  _buildRouter() {
    const router = express.Router();

    for (const scraper of this.scrapers) {
      // index tiap modul
      router.get(`/${scraper.id}`, (req, res) => {
        res.json(
          envelope({
            endpoint: `${config.apiPrefix}/${scraper.id}`,
            durationMs: 0,
            data: {
              module: scraper.name,
              description: scraper.description,
              source: scraper.baseUrl,
              totalEndpoints: scraper.endpoints.length,
              endpoints: scraper.endpoints.map((e) => ({
                name: e.name,
                method: e.method,
                route: e.route,
                description: e.description,
                example: e.exampleUrl
              }))
            }
          })
        );
      });

      for (const ep of scraper.endpoints) {
        router[ep.method.toLowerCase()](ep.fullPath, this._makeHandler(scraper, ep));
      }
    }

    this.router = router;
  }

  _makeHandler(scraper, ep) {
    return async (req, res) => {
      const started = Date.now();
      const endpointLabel = `${config.apiPrefix}${ep.fullPath}`;

      // --- validasi parameter ---
      const missing = [];
      for (const p of ep.params) {
        const bag = p.in === 'path' ? req.params : p.in === 'body' ? req.body || {} : req.query;
        const val = bag[p.name];
        if (p.required && (val === undefined || val === '')) missing.push(p.name);
        if (p.enum && val && !p.enum.includes(String(val))) {
          return res.status(400).json(
            failure({
              endpoint: endpointLabel,
              code: 400,
              message: `Invalid value for "${p.name}"`,
              hint: `Allowed values: ${p.enum.join(', ')}`
            })
          );
        }
      }
      if (missing.length) {
        return res.status(400).json(
          failure({
            endpoint: endpointLabel,
            code: 400,
            message: `Missing required parameter: ${missing.join(', ')}`,
            hint: `Example -> ${ep.exampleUrl}`
          })
        );
      }

      // --- cache ---
      const cacheKey = `${ep.method}:${req.originalUrl}`;
      if (ep.method === 'GET' && ep.cache > 0) {
        const cached = cache.get(cacheKey);
        if (cached) {
          this._track(ep.key, true);
          return res.json({ ...cached, cached: true, timestamp: new Date().toISOString() });
        }
      }

      // --- eksekusi handler ---
      try {
        const data = await ep.handler({
          query: req.query,
          params: req.params,
          body: req.body || {},
          headers: req.headers,
          req,
          res
        });

        if (res.headersSent) return;

        const payload = envelope({
          endpoint: endpointLabel,
          data,
          durationMs: Date.now() - started,
          cached: false,
          meta: { module: scraper.id, source: scraper.baseUrl }
        });

        if (ep.method === 'GET' && ep.cache > 0) cache.set(cacheKey, payload, ep.cache);
        this._track(ep.key, false);
        return res.json(payload);
      } catch (err) {
        this._track(ep.key, false, true);
        logger.error(`${endpointLabel} -> ${err.message}`);
        return res.status(502).json(
          failure({
            endpoint: endpointLabel,
            code: 502,
            message: err.message || 'Upstream scraping failed',
            hint: 'Sumber mungkin sedang down / struktur HTML berubah. Coba lagi beberapa saat.'
          })
        );
      }
    };
  }

  _track(key, cached, failed = false) {
    const cur = this.hits.get(key) || { total: 0, cached: 0, failed: 0 };
    cur.total++;
    if (cached) cur.cached++;
    if (failed) cur.failed++;
    this.hits.set(key, cur);
  }

  /* ------------------------------------------------------------------ *
   * PUBLIC MANIFEST
   * ------------------------------------------------------------------ */
  list() {
    return this.scrapers.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      baseUrl: s.baseUrl,
      icon: s.icon,
      tags: s.tags,
      stability: s.stability,
      basePath: s.basePath,
      file: s.file,
      totalEndpoints: s.endpoints.length,
      endpoints: s.endpoints.map((e) => ({
        key: e.key,
        name: e.name,
        method: e.method,
        path: e.path,
        route: e.route,
        description: e.description,
        group: e.group,
        cache: e.cache,
        deprecated: e.deprecated,
        params: e.params,
        responseShape: e.responseShape,
        exampleUrl: e.exampleUrl,
        hits: this.hits.get(e.key) || { total: 0, cached: 0, failed: 0 }
      }))
    }));
  }

  stats() {
    const modules = this.scrapers.length;
    const endpoints = this.scrapers.reduce((n, s) => n + s.endpoints.length, 0);
    let total = 0, cached = 0, failed = 0;
    this.hits.forEach((v) => { total += v.total; cached += v.cached; failed += v.failed; });
    return {
      modules,
      endpoints,
      failedModules: this.errors,
      loadedAt: this.loadedAt,
      watching: !!this._watcher,
      requests: { total, cached, failed }
    };
  }
}

module.exports = new ScraperRegistry();