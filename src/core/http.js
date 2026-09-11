'use strict';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
];

const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENTS[0],
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache'
};

async function request(url, { method = 'GET', body = null, headers = {}, timeout = 25000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);

  try {
    const init = {
      method,
      headers: { ...DEFAULT_HEADERS, ...headers },
      signal: ctl.signal,
      redirect: 'follow'
    };

    if (method === 'POST' && body) {
      if (typeof body === 'string') {
        init.body = body;
        if (!init.headers['Content-Type']) init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (typeof body === 'object') {
        init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        init.body = new URLSearchParams(body).toString();
      }
    }

    const res = await fetch(url, init);
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout (${Math.round(timeout / 1000)}s) to upstream: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const get = (url, opt = {}) => request(url, { ...opt, method: 'GET' });
const post = (url, body, opt = {}) => request(url, { ...opt, method: 'POST', body });

module.exports = { request, get, post, DEFAULT_HEADERS };