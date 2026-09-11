'use strict';

const config = require('../config');
const { failure } = require('../core/response');

const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}, 60_000).unref();

module.exports = function rateLimit(req, res, next) {
  if (!config.rateLimit.enabled) return next();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket || bucket.reset < now) {
    bucket = { count: 0, reset: now + config.rateLimit.windowMs };
    buckets.set(ip, bucket);
  }
  bucket.count++;

  const remaining = Math.max(0, config.rateLimit.max - bucket.count);
  res.setHeader('X-RateLimit-Limit', config.rateLimit.max);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.reset / 1000));

  if (bucket.count > config.rateLimit.max) {
    res.setHeader('Retry-After', Math.ceil((bucket.reset - now) / 1000));
    return res.status(429).json(
      failure({
        endpoint: req.originalUrl,
        code: 429,
        message: 'Too many requests',
        hint: `Limit ${config.rateLimit.max} request / ${config.rateLimit.windowMs / 1000}s per IP.`
      })
    );
  }
  next();
};