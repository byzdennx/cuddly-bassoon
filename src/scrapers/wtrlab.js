'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — WTR-LAB NOVEL SCRAPER MODULE
 * ---------------------------------------------------------------------
 *  File   : src/scrapers/wtrlab.js
 *  Source : https://wtr-lab.com
 *  Author : Mommy Kyuu (original) → EpannStream port
 * =====================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { webcrypto } = require('node:crypto');

const crypto = webcrypto;
const BASE_URL = 'https://wtr-lab.com';
const WATERMARK = 'Mommy Kyuu';
const AES_KEY_STRING = 'IJAFUUxjM25hyzL2AZrn0wl7cESED6Ru';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

async function decryptBody(encryptedData) {
  if (!encryptedData) return null;
  try {
    let isJson = false;
    let payload = encryptedData;
    if (payload.startsWith('arr:')) {
      isJson = true;
      payload = payload.substring(4);
    } else if (payload.startsWith('str:')) {
      payload = payload.substring(4);
    }

    const parts = payload.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted data format');

    const [ivB64, tagB64, cipherB64] = parts;
    const iv = Uint8Array.from(Buffer.from(ivB64, 'base64'), (c) => c);
    const tag = Uint8Array.from(Buffer.from(tagB64, 'base64'), (c) => c);
    const cipher = Uint8Array.from(Buffer.from(cipherB64, 'base64'), (c) => c);

    const combined = new Uint8Array(cipher.length + tag.length);
    combined.set(cipher);
    combined.set(tag, cipher.length);

    const keyBytes = new TextEncoder().encode(AES_KEY_STRING.slice(0, 32));
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      combined
    );
    const decoded = new TextDecoder().decode(decrypted);

    return isJson ? JSON.parse(decoded) : decoded;
  } catch (error) {
    console.error('[WTR-LAB] Decryption error:', error.message);
    return null;
  }
}

function extractNextData(html) {
  try {
    const $ = cheerio.load(html);
    const scriptContent = $('#__NEXT_DATA__').html();
    if (!scriptContent) return null;
    const json = JSON.parse(scriptContent);
    return json?.props?.pageProps || null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  SCRAPERS                                                           */
/* ------------------------------------------------------------------ */

async function getHome() {
  const res = await axios.get(`${BASE_URL}/id`, { headers: HEADERS });
  const pageProps = extractNextData(res.data);
  if (!pageProps) {
    const err = new Error('Failed to parse page data');
    err.statusCode = 502;
    throw err;
  }
  return {
    trending: pageProps.trending || [],
    daily: pageProps.daily || [],
    recently: pageProps.recently || [],
    series: pageProps.series || [],
    random: pageProps.random || [],
  };
}

async function search(query) {
  if (!query) {
    const err = new Error('Query parameter is required');
    err.statusCode = 400;
    throw err;
  }
  const res = await axios.get(
    `${BASE_URL}/api/search?q=${encodeURIComponent(query)}`,
    { headers: HEADERS }
  );
  const data = res.data;
  if (Array.isArray(data)) return { data };
  if (typeof data === 'object' && data !== null) return data;
  return { data };
}

async function getNovelList(page = 1, sort = 'newest') {
  const url = `${BASE_URL}/id/novel-list?page=${page}${sort ? `&sort=${sort}` : ''}`;
  const res = await axios.get(url, { headers: HEADERS });
  const pageProps = extractNextData(res.data);
  if (!pageProps) {
    const err = new Error('Failed to parse novel list');
    err.statusCode = 502;
    throw err;
  }
  return {
    page: Number(page),
    total: pageProps.count || 0,
    data: pageProps.series || [],
  };
}

async function getNovelDetail(rawIdOrSlug) {
  if (!rawIdOrSlug) {
    const err = new Error('Novel ID or Slug is required');
    err.statusCode = 400;
    throw err;
  }
  const url = `${BASE_URL}/id/novel/${rawIdOrSlug}`;
  const res = await axios.get(url, { headers: HEADERS });
  const pageProps = extractNextData(res.data);
  if (!pageProps || !pageProps.serie) {
    const err = new Error('Novel not found or invalid response');
    err.statusCode = 404;
    throw err;
  }

  const serie = pageProps.serie;
  const detail = serie.serie_data || {};
  const info = detail.data || {};

  return {
    id: detail.id,
    raw_id: detail.raw_id,
    title: info.title || detail.title,
    slug: detail.slug,
    author: info.author || detail.author,
    description: info.description,
    image: info.image,
    status: detail.status,
    chapter_count: detail.chapter_count || 0,
    view: detail.view || 0,
    rating: detail.rating,
    genres: detail.genres || [],
    tags: pageProps.tags || detail.tags || [],
    names: serie.names || [],
    ranks: serie.ranks || {},
    last_chapters: serie.last_chapters || [],
    created_at: detail.created_at,
    updated_at: detail.updated_at,
  };
}

async function getChapter(rawId, chapterNo = 1) {
  if (!rawId) {
    const err = new Error('raw_id parameter is required');
    err.statusCode = 400;
    throw err;
  }

  const res = await axios.post(
    `${BASE_URL}/api/reader/get`,
    { raw_id: Number(rawId), chapter_no: Number(chapterNo) },
    {
      headers: {
        ...HEADERS,
        'Content-Type': 'application/json',
        Referer: `${BASE_URL}/id/novel/${rawId}/chapter-${chapterNo}`,
      },
    }
  );

  const result = res.data;
  if (!result.success || !result.data?.data?.body) {
    if (result.requireTurnstile) {
      const err = new Error('Turnstile challenge required for reading activity.');
      err.statusCode = 403;
      err.requireTurnstile = true;
      throw err;
    }
    const err = new Error(
      result.error || result.message || 'Failed to fetch chapter'
    );
    err.statusCode = 502;
    throw err;
  }

  const decryptedBody = await decryptBody(result.data.data.body);

  return {
    chapter: result.chapter,
    paragraphs: Array.isArray(decryptedBody) ? decryptedBody : [decryptedBody],
  };
}

/* ------------------------------------------------------------------ */
/*  MODULE EXPORT (EpannStream Format)                                 */
/* ------------------------------------------------------------------ */

module.exports = {
  meta: {
    id: 'wtrlab',
    name: 'WTR-LAB Novel',
    description:
      'Scraper & reader novel dari WTR-LAB (wtr-lab.com) dengan dekripsi AES-GCM.',
    baseUrl: BASE_URL,
    icon: 'book',
    tags: ['novel', 'reader', 'wtrlab'],
    order: 60,
    stability: 'stable',
  },

  endpoints: [
    /* ---------------- HOME ---------------- */
    {
      name: 'Home',
      method: 'GET',
      path: '/home',
      group: 'WTR-LAB',
      description: 'Ambil novel trending, daily, recently updated, series, & random.',
      cache: 300,
      params: [],
      responseShape: {
        trending: 'array',
        daily: 'array',
        recently: 'array',
        series: 'array',
        random: 'array',
      },
      handler: async () => getHome(),
    },

    /* ---------------- SEARCH ---------------- */
    {
      name: 'Search Novel',
      method: 'GET',
      path: '/search',
      group: 'WTR-LAB',
      description: 'Cari novel berdasarkan keyword.',
      cache: 120,
      params: [
        {
          name: 'q',
          in: 'query',
          type: 'string',
          required: true,
          example: 'wizard',
          description: 'Keyword pencarian.',
        },
      ],
      responseShape: { data: 'array' },
      handler: async ({ query }) => search(String(query.q || '').trim()),
    },

    /* ---------------- NOVEL LIST ---------------- */
    {
      name: 'Novel List',
      method: 'GET',
      path: '/list',
      group: 'WTR-LAB',
      description: 'Daftar novel dengan paginasi & sorting.',
      cache: 300,
      params: [
        {
          name: 'page',
          in: 'query',
          type: 'number',
          required: false,
          default: 1,
          example: 1,
          description: 'Halaman.',
        },
        {
          name: 'sort',
          in: 'query',
          type: 'string',
          required: false,
          default: 'newest',
          example: 'newest',
          description: 'Urutan (newest | popular | dll).',
        },
      ],
      responseShape: { page: 'number', total: 'number', data: 'array' },
      handler: async ({ query }) =>
        getNovelList(Number(query.page) || 1, query.sort || 'newest'),
    },

    /* ---------------- NOVEL DETAIL ---------------- */
    {
      name: 'Novel Detail',
      method: 'GET',
      path: '/novel/:id',
      group: 'WTR-LAB',
      description: 'Detail novel: judul, penulis, sinopsis, genre, tags, ranks.',
      cache: 300,
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          required: true,
          example: '94920/wizard-ravens-perch-in-dreams',
          description: 'rawId/slug novel (mis. 94920/wizard-ravens-perch-in-dreams).',
        },
      ],
      responseShape: {
        id: 'number',
        raw_id: 'number',
        title: 'string',
        genres: 'array',
      },
      handler: async ({ params }) => getNovelDetail(params.id),
    },

    /* ---------------- CHAPTER ---------------- */
    {
      name: 'Chapter',
      method: 'GET',
      path: '/chapter',
      group: 'WTR-LAB',
      description: 'Ambil & dekripsi isi chapter (AES-GCM).',
      cache: 600,
      params: [
        {
          name: 'rawId',
          in: 'query',
          type: 'number',
          required: true,
          example: 94920,
          description: 'raw_id novel.',
        },
        {
          name: 'chapterNo',
          in: 'query',
          type: 'number',
          required: false,
          default: 1,
          example: 1,
          description: 'Nomor chapter.',
        },
      ],
      responseShape: {
        chapter: 'object',
        paragraphs: 'array',
      },
      handler: async ({ query }) =>
        getChapter(
          Number(query.rawId),
          Number(query.chapterNo) || 1
        ),
    },
  ],
};
