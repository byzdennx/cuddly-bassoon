'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — VELOFLIX SCRAPER MODULE
 * ---------------------------------------------------------------------
 *  File   : src/scrapers/veloflix.js
 *  Source : https://veloflix.my.id
 * =====================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://veloflix.my.id';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

function parseCards($) {
  const results = [];
  $('a.tv-title-card').each((_, el) => {
    const path = $(el).attr('href');
    const title =
      $(el).find('p[title]').attr('title') || $(el).find('p').first().text();

    let image = $(el).find('img').attr('src');
    const srcSet = $(el).find('img').attr('srcset');
    if (srcSet) {
      const parts = srcSet.split(',');
      image = parts[parts.length - 1].trim().split(' ')[0];
    }

    const rating = $(el).find('.text-yellow-400').text().replace('★', '').trim();
    const type = $(el).find('.uppercase.tracking-wider').first().text().trim();

    if (title && path) {
      const id = path.split('/').pop();
      const mediaType = path.includes('/movie/') ? 'movie' : 'tv';

      results.push({
        id,
        title: title.trim(),
        url: `${BASE_URL}${path}`,
        image: image
          ? image.startsWith('/')
            ? `${BASE_URL}${image}`
            : image
          : null,
        rating: rating || 'N/A',
        type: type || 'N/A',
        media_type: mediaType,
      });
    }
  });
  return results;
}

function buildStreamUrls(tmdbId, mediaType = 'movie', season = 1, episode = 1) {
  if (mediaType === 'movie') {
    return [
      `https://vidsrc.to/embed/movie/${tmdbId}`,
      `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`,
      `https://vidsrc.pro/embed/movie/${tmdbId}`,
      `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1`,
      `https://autoembed.to/movie/tmdb/${tmdbId}`,
    ];
  }
  return [
    `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`,
    `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`,
    `https://vidsrc.pro/embed/tv/${tmdbId}/${season}/${episode}`,
    `https://autoembed.to/tv/tmdb/${tmdbId}-${season}-${episode}`,
  ];
}

/* ------------------------------------------------------------------ */
/*  SCRAPERS                                                           */
/* ------------------------------------------------------------------ */

async function getHome() {
  const { data } = await axios.get(BASE_URL, { headers: HEADERS });
  const $ = cheerio.load(data);
  return { items: parseCards($) };
}

async function getMovies(page = 1) {
  const { data } = await axios.get(`${BASE_URL}/category/movie?page=${page}`, {
    headers: HEADERS,
  });
  const $ = cheerio.load(data);
  return { page: Number(page), items: parseCards($) };
}

async function getSeries(page = 1) {
  const { data } = await axios.get(`${BASE_URL}/category/tv?page=${page}`, {
    headers: HEADERS,
  });
  const $ = cheerio.load(data);
  return { page: Number(page), items: parseCards($) };
}

async function search(keyword) {
  const { data } = await axios.get(
    `${BASE_URL}/search?q=${encodeURIComponent(keyword)}`,
    { headers: HEADERS }
  );
  const $ = cheerio.load(data);
  return { items: parseCards($) };
}

/* ------------------------------------------------------------------ */
/*  MODULE EXPORT (EpannStream Format)                                 */
/* ------------------------------------------------------------------ */

module.exports = {
  meta: {
    id: 'veloflix',
    name: 'Velofix',
    description:
      'Scraper katalog film & series dari Velofix (veloflix.my.id) + generator stream URL berbasis TMDB ID.',
    baseUrl: BASE_URL,
    icon: 'film',
    tags: ['movie', 'tv', 'streaming', 'veloflix'],
    order: 55,
    stability: 'stable',
  },

  endpoints: [
    /* ---------------- HOME ---------------- */
    {
      name: 'Home',
      method: 'GET',
      path: '/home',
      group: 'Velofix',
      description: 'Ambil daftar judul yang tampil di halaman beranda.',
      cache: 300,
      params: [],
      responseShape: { items: 'array' },
      handler: async () => getHome(),
    },

    /* ---------------- MOVIES ---------------- */
    {
      name: 'Movies',
      method: 'GET',
      path: '/movies',
      group: 'Velofix',
      description: 'Daftar film dari kategori movie.',
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
      ],
      responseShape: { page: 'number', items: 'array' },
      handler: async ({ query }) => getMovies(Number(query.page) || 1),
    },

    /* ---------------- SERIES ---------------- */
    {
      name: 'Series',
      method: 'GET',
      path: '/series',
      group: 'Velofix',
      description: 'Daftar serial TV dari kategori tv.',
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
      ],
      responseShape: { page: 'number', items: 'array' },
      handler: async ({ query }) => getSeries(Number(query.page) || 1),
    },

    /* ---------------- SEARCH ---------------- */
    {
      name: 'Search',
      method: 'GET',
      path: '/search',
      group: 'Velofix',
      description: 'Cari film/series berdasarkan keyword.',
      cache: 120,
      params: [
        {
          name: 'q',
          in: 'query',
          type: 'string',
          required: true,
          example: 'avengers',
          description: 'Keyword pencarian.',
        },
      ],
      responseShape: { items: 'array' },
      handler: async ({ query }) => {
        const q = String(query.q || '').trim();
        if (!q) {
          const err = new Error('Parameter "q" wajib diisi.');
          err.statusCode = 400;
          throw err;
        }
        return search(q);
      },
    },

    /* ---------------- STREAM URL ---------------- */
    {
      name: 'Stream URL',
      method: 'GET',
      path: '/stream',
      group: 'Velofix',
      description:
        'Generate URL embed streaming dari TMDB ID (movie / tv). Tidak scraping — hanya generate dari daftar server publik.',
      cache: 3600,
      params: [
        {
          name: 'id',
          in: 'query',
          type: 'string',
          required: true,
          example: '1251636',
          description: 'TMDB ID.',
        },
        {
          name: 'media_type',
          in: 'query',
          type: 'string',
          required: false,
          default: 'movie',
          example: 'movie',
          description: 'movie | tv',
        },
        {
          name: 'season',
          in: 'query',
          type: 'number',
          required: false,
          default: 1,
          example: 1,
          description: 'Hanya untuk tv.',
        },
        {
          name: 'episode',
          in: 'query',
          type: 'number',
          required: false,
          default: 1,
          example: 1,
          description: 'Hanya untuk tv.',
        },
      ],
      responseShape: {
        id: 'string',
        media_type: 'string',
        available_servers: 'array',
      },
      handler: async ({ query }) => {
        const id = String(query.id || '').trim();
        if (!id) {
          const err = new Error('Parameter "id" (TMDB) wajib diisi.');
          err.statusCode = 400;
          throw err;
        }
        const mediaType = query.media_type === 'tv' ? 'tv' : 'movie';
        const season = Number(query.season) || 1;
        const episode = Number(query.episode) || 1;
        return {
          id,
          media_type: mediaType,
          available_servers: buildStreamUrls(id, mediaType, season, episode),
        };
      },
    },
  ],
};
