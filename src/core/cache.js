'use strict';

const config = require('../config');

class TTLCache {
  constructor(max = 500) {
    this.max = max;
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  _now() { return Date.now(); }

  get(key) {
    const item = this.store.get(key);
    if (!item) { this.misses++; return null; }
    if (item.expires < this._now()) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return item.value;
  }

  set(key, value, ttlSeconds = config.cache.defaultTtl) {
    if (!config.cache.enabled || ttlSeconds <= 0) return value;
    if (this.store.size >= this.max) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: this._now() + ttlSeconds * 1000 });
    return value;
  }

  has(key) { return this.get(key) !== null; }
  delete(key) { return this.store.delete(key); }
  flush() { const n = this.store.size; this.store.clear(); return n; }

  stats() {
    const total = this.hits + this.misses;
    return {
      enabled: config.cache.enabled,
      entries: this.store.size,
      maxEntries: this.max,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? +((this.hits / total) * 100).toFixed(2) : 0
    };
  }
}

module.exports = new TTLCache(config.cache.maxEntries);