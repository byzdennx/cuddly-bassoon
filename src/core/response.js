'use strict';

const config = require('../config');

function envelope({ endpoint, data, durationMs = 0, cached = false, meta = {} }) {
  return {
    status: true,
    code: 200,
    creator: config.developer.name,
    service: config.name,
    version: config.version,
    endpoint,
    cached,
    durationMs,
    timestamp: new Date().toISOString(),
    ...meta,
    result: data
  };
}

function failure({ endpoint = null, code = 500, message = 'Internal Server Error', hint = null }) {
  return {
    status: false,
    code,
    creator: config.developer.name,
    service: config.name,
    version: config.version,
    endpoint,
    error: { message, hint },
    timestamp: new Date().toISOString()
  };
}

module.exports = { envelope, failure };