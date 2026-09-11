'use strict';

const { execFile } = require('child_process');

const CURL_BIN = process.platform === 'win32' ? 'curl.exe' : 'curl';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  'Cache-Control': 'no-cache'
};

function viaCurl(url, { method = 'GET', body = null, headers = {}, timeout = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-L', '--compressed', '--max-time', String(Math.floor(timeout / 1000))];
    Object.entries({ ...BASE_HEADERS, ...headers }).forEach(([k, v]) => args.push('-H', `${k}: ${v}`));

    if (method === 'POST') {
      args.push('-X', 'POST');
      if (body) {
        const payload = typeof body === 'string' ? body : new URLSearchParams(body).toString();
        args.push('-H', 'Content-Type: application/x-www-form-urlencoded', '-d', payload);
      }
    }
    args.push(url);

    execFile(CURL_BIN, args, { maxBuffer: 25 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`curl failed: ${err.message}`));
      resolve(stdout);
    });
  });
}

async function viaFetch(url, { method = 'GET', body = null, headers = {}, timeout = 25000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const init = { method, headers: { ...BASE_HEADERS, ...headers }, signal: ctl.signal, redirect: 'follow' };
    if (method === 'POST' && body) {
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    }
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** GET/POST dengan fallback otomatis fetch -> curl */
async function request(url, options = {}) {
  try {
    return await viaFetch(url, options);
  } catch (errFetch) {
    try {
      const out = await viaCurl(url, options);
      if (!out || !out.trim()) throw new Error('empty response from curl');
      return out;
    } catch (errCurl) {
      throw new Error(`Upstream request failed (${errFetch.message} | ${errCurl.message})`);
    }
  }
}

const get = (url, opt = {}) => request(url, { ...opt, method: 'GET' });
const post = (url, body, opt = {}) => request(url, { ...opt, method: 'POST', body });

module.exports = { request, get, post, viaFetch, viaCurl, UA };