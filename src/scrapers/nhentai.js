'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — NHENTAI API V2 MODULE
 * ---------------------------------------------------------------------
 *  File   : src/scrapers/nhentai.js
 *  Source : https://nhentai.net/api/v2
 *  Docs   : https://nhentai.net/api/v2/docs
 * =====================================================================
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/*  CONSTANTS & HTTP CLIENT                                            */
/* ------------------------------------------------------------------ */

const BASE = 'https://nhentai.net/api/v2';
const IMG_SERVERS = Array.from({ length: 4 }, (_, i) => `https://i${i + 1}.nhentai.net`);
const THUMB_SERVERS = Array.from({ length: 4 }, (_, i) => `https://t${i + 1}.nhentai.net`);
const TAG_TYPES = ['tag', 'artist', 'parody', 'character', 'language', 'group', 'category'];

const client = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'nhentai-scraper/1.0',
    Accept: 'application/json',
  },
});

/* ------------------------------------------------------------------ */
/*  LOW-LEVEL                                                          */
/* ------------------------------------------------------------------ */

async function _get(pathname, params) {
  try {
    let r = await client.get(`${BASE}${pathname}`, { params });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 5000));
      r = await client.get(`${BASE}${pathname}`, { params });
    }
    if (r.status === 200) return r.data;
    return { error: r.status, message: String(r.data).slice(0, 300) };
  } catch (e) {
    return { error: e.response?.status || 500, message: e.message };
  }
}

async function _post(pathname, data) {
  try {
    let r = await client.post(`${BASE}${pathname}`, data || {});
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 5000));
      r = await client.post(`${BASE}${pathname}`, data || {});
    }
    if (r.status === 200 || r.status === 201) return r.data;
    return { error: r.status, message: String(r.data).slice(0, 300) };
  } catch (e) {
    return { error: e.response?.status || 500, message: e.message };
  }
}

/* ------------------------------------------------------------------ */
/*  IMAGE URL HELPERS                                                  */
/* ------------------------------------------------------------------ */

function imageUrl(p) {
  const s = IMG_SERVERS[Math.floor(Math.random() * IMG_SERVERS.length)];
  return `${s}/${p}`;
}

function thumbUrl(p) {
  if (!p) return '';
  if (p.startsWith('http')) return p;
  const s = THUMB_SERVERS[Math.floor(Math.random() * THUMB_SERVERS.length)];
  return `${s}/${p}`;
}

/* ------------------------------------------------------------------ */
/*  SCRAPERS                                                           */
/* ------------------------------------------------------------------ */

async function getLatest(page = 1, perPage = 25) {
  return _get('/galleries', { page, per_page: perPage });
}

async function getPopular() {
  return _get('/galleries/popular');
}

async function getRandomId() {
  return _get('/galleries/random');
}

async function getGallery(galleryId, include) {
  const params = {};
  if (include) {
    params.include = Array.isArray(include) ? include.join(',') : include;
  }
  return _get(`/galleries/${galleryId}`, params);
}

async function getGalleryComments(galleryId, page = 1, perPage = 25) {
  return _get(`/galleries/${galleryId}/comments`, { page, per_page: perPage });
}

async function getGalleryCommentCount(galleryId) {
  return _get(`/galleries/${galleryId}/comments/count`);
}

async function getRelated(galleryId) {
  return _get(`/galleries/${galleryId}/related`);
}

async function getByTag(tagId, sort = 'recent', page = 1, perPage = 25) {
  return _get('/galleries/tagged', {
    tag_id: tagId,
    sort,
    page,
    per_page: perPage,
  });
}

async function search(query, page = 1, perPage = 25) {
  return _get('/search', { query, page, per_page: perPage });
}

async function getTags(tagType = 'tag', page = 1) {
  if (!TAG_TYPES.includes(tagType)) {
    const err = new Error(`Invalid type. Use: ${TAG_TYPES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return _get(`/tags/${tagType}`, { page });
}

async function getImageUrls(galleryId) {
  const g = await getGallery(galleryId);
  if (!g || g.error) return g;
  const images = (g.pages || []).map((p) => imageUrl(p.path));
  return {
    id: g.id,
    media_id: g.media_id,
    title: g.title?.pretty || '',
    num_pages: g.num_pages,
    images,
  };
}

async function getThumbUrls(galleryId) {
  const g = await getGallery(galleryId);
  if (!g || g.error) return g;
  const thumbs = (g.pages || []).map((p) => thumbUrl(p.thumbnail || p.path));
  return {
    id: g.id,
    media_id: g.media_id,
    title: g.title?.pretty || '',
    num_pages: g.num_pages,
    thumbs,
  };
}

/* ------------------------------------------------------------------ */
/*  MODULE EXPORT (EpannStream Format)                                 */
/* ------------------------------------------------------------------ */

module.exports = {
  meta: {
    id: 'nhentai',
    name: 'nhentai API v2',
    description:
      'Scraper + API wrapper untuk nhentai.net (v2). Mendukung list, search, tag, comment, image URLs, dan download.',
    baseUrl: 'https://nhentai.net',
    icon: 'book-heart',
    tags: ['doujin', 'gallery', 'nhentai', 'api'],
    order: 95,
    stability: 'beta',
  },

  endpoints: [
    /* ---------------- LATEST ---------------- */
    {
      name: 'Latest Galleries',
      method: 'GET',
      path: '/latest',
      group: 'nhentai',
      description: 'Daftar gallery terbaru.',
      cache: 120,
      params: [
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman.' },
        { name: 'per_page', in: 'query', type: 'number', required: false, default: 25, example: 25, description: 'Item per halaman.' },
      ],
      responseShape: { result: 'array', total: 'number' },
      handler: async ({ query }) =>
        getLatest(Number(query.page) || 1, Number(query.per_page) || 25),
    },

    /* ---------------- POPULAR ---------------- */
    {
      name: 'Popular Galleries',
      method: 'GET',
      path: '/popular',
      group: 'nhentai',
      description: 'Daftar gallery populer saat ini.',
      cache: 300,
      params: [],
      responseShape: { result: 'array' },
      handler: async () => getPopular(),
    },

    /* ---------------- RANDOM ID ---------------- */
    {
      name: 'Random ID',
      method: 'GET',
      path: '/random',
      group: 'nhentai',
      description: 'Ambil ID gallery secara acak.',
      cache: 0,
      params: [],
      responseShape: { id: 'number' },
      handler: async () => getRandomId(),
    },

    /* ---------------- GALLERY DETAIL ---------------- */
    {
      name: 'Gallery Detail',
      method: 'GET',
      path: '/gallery/:id',
      group: 'nhentai',
      description: 'Detail lengkap gallery + daftar halaman.',
      cache: 300,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 674728, description: 'Gallery ID.' },
        { name: 'include', in: 'query', type: 'string', required: false, example: 'comments,related,favorite,suggestions', description: 'Comma-separated: comments | related | favorite | suggestions.' },
      ],
      responseShape: { id: 'number', title: 'object', pages: 'array' },
      handler: async ({ params, query }) =>
        getGallery(Number(params.id), query.include),
    },

    /* ---------------- GALLERY COMMENTS ---------------- */
    {
      name: 'Gallery Comments',
      method: 'GET',
      path: '/gallery/:id/comments',
      group: 'nhentai',
      description: 'Komentar pada gallery.',
      cache: 60,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 674728, description: 'Gallery ID.' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman.' },
        { name: 'per_page', in: 'query', type: 'number', required: false, default: 25, example: 25, description: 'Item per halaman.' },
      ],
      responseShape: { result: 'array' },
      handler: async ({ params, query }) =>
        getGalleryComments(
          Number(params.id),
          Number(query.page) || 1,
          Number(query.per_page) || 25
        ),
    },

    /* ---------------- GALLERY COMMENT COUNT ---------------- */
    {
      name: 'Gallery Comment Count',
      method: 'GET',
      path: '/gallery/:id/comments/count',
      group: 'nhentai',
      description: 'Jumlah komentar pada gallery.',
      cache: 60,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 674728, description: 'Gallery ID.' },
      ],
      responseShape: { count: 'number' },
      handler: async ({ params }) => getGalleryCommentCount(Number(params.id)),
    },

    /* ---------------- GALLERY RELATED ---------------- */
    {
      name: 'Gallery Related',
      method: 'GET',
      path: '/gallery/:id/related',
      group: 'nhentai',
      description: 'Gallery terkait.',
      cache: 300,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 674728, description: 'Gallery ID.' },
      ],
      responseShape: { result: 'array' },
      handler: async ({ params }) => getRelated(Number(params.id)),
    },

    /* ---------------- GALLERY IMAGE URLS ---------------- */
    {
      name: 'Gallery Images',
      method: 'GET',
      path: '/gallery/:id/images',
      group: 'nhentai',
      description: 'Semua URL gambar full-size untuk gallery.',
      cache: 600,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 674728, description: 'Gallery ID.' },
      ],
      responseShape: { id: 'number', images: 'array' },
      handler: async ({ params }) => getImageUrls(Number(params.id)),
    },

    /* ---------------- GALLERY THUMBS ---------------- */
    {
      name: 'Gallery Thumbs',
      method: 'GET',
      path: '/gallery/:id/thumbs',
      group: 'nhentai',
      description: 'Semua URL thumbnail untuk gallery.',
      cache: 600,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 674728, description: 'Gallery ID.' },
      ],
      responseShape: { id: 'number', thumbs: 'array' },
      handler: async ({ params }) => getThumbUrls(Number(params.id)),
    },

    /* ---------------- TAG LIST ---------------- */
    {
      name: 'Tags by Type',
      method: 'GET',
      path: '/tags/:type',
      group: 'nhentai',
      description:
        'Daftar tag berdasarkan tipe. Tipe valid: tag | artist | parody | character | language | group | category.',
      cache: 600,
      params: [
        { name: 'type', in: 'path', type: 'string', required: true, example: 'artist', description: 'Tipe tag.' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman.' },
      ],
      responseShape: { result: 'array' },
      handler: async ({ params, query }) =>
        getTags(params.type, Number(query.page) || 1),
    },

    /* ---------------- GALLERY BY TAG ---------------- */
    {
      name: 'Galleries by Tag',
      method: 'GET',
      path: '/tagged',
      group: 'nhentai',
      description: 'Daftar gallery yang memiliki tag tertentu.',
      cache: 300,
      params: [
        { name: 'tag_id', in: 'query', type: 'number', required: true, example: 12227, description: 'Tag ID.' },
        { name: 'sort', in: 'query', type: 'string', required: false, default: 'recent', example: 'recent', description: 'recent | popular.' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman.' },
        { name: 'per_page', in: 'query', type: 'number', required: false, default: 25, example: 25, description: 'Item per halaman.' },
      ],
      responseShape: { result: 'array' },
      handler: async ({ query }) =>
        getByTag(
          Number(query.tag_id),
          query.sort || 'recent',
          Number(query.page) || 1,
          Number(query.per_page) || 25
        ),
    },

    /* ---------------- SEARCH ---------------- */
    {
      name: 'Search',
      method: 'GET',
      path: '/search',
      group: 'nhentai',
      description: 'Cari gallery berdasarkan keyword.',
      cache: 120,
      params: [
        { name: 'q', in: 'query', type: 'string', required: true, example: 'miku', description: 'Keyword pencarian.' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman.' },
        { name: 'per_page', in: 'query', type: 'number', required: false, default: 25, example: 25, description: 'Item per halaman.' },
      ],
      responseShape: { result: 'array', total: 'number' },
      handler: async ({ query }) => {
        const q = String(query.q || '').trim();
        if (!q) {
          const err = new Error('Parameter "q" wajib diisi.');
          err.statusCode = 400;
          throw err;
        }
        return search(q, Number(query.page) || 1, Number(query.per_page) || 25);
      },
    },

    /* ---------------- CDN ---------------- */
    {
      name: 'CDN Servers',
      method: 'GET',
      path: '/cdn',
      group: 'nhentai',
      description: 'Daftar CDN server (image & thumbnail).',
      cache: 3600,
      params: [],
      responseShape: { image_servers: 'array', thumb_servers: 'array' },
      handler: async () => _get('/cdn'),
    },

    /* ---------------- CONFIG ---------------- */
    {
      name: 'Site Config',
      method: 'GET',
      path: '/config',
      group: 'nhentai',
      description: 'Konfigurasi situs (server, announcement).',
      cache: 3600,
      params: [],
      responseShape: { image_servers: 'array', thumb_servers: 'array', announcement: 'string' },
      handler: async () => _get('/config'),
    },
  ],
};
