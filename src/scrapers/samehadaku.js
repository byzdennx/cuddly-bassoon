'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — SAMEHADAKU SCRAPER MODULE
 * ---------------------------------------------------------------------
 *  File   : src/scrapers/samehadaku.js
 *  Source : https://samehadaku.li  (NO CloudFlare — aman dari Vercel)
 * =====================================================================
 */

const cheerio = require('cheerio');
const { get } = require('../core/http');

const BASE = 'https://samehadaku.li';
const HOST = 'samehadaku.li';

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

async function fetchPage(url) {
  try {
    const html = await get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      },
    });
    return html || null;
  } catch (e) {
    console.error('[Samehadaku]', url, e.message);
    return null;
  }
}

// Helper: extract real poster from img src/data-src (skip lazyload placeholders)
function getPoster($, el) {
  const img = $(el).find('img').first();
  const src = img.attr('src') || '';
  const dataSrc = img.attr('data-src') || '';
  if (
    dataSrc &&
    !dataSrc.includes('svg+xml') &&
    !dataSrc.includes('js/jquery') &&
    !dataSrc.includes('acscdn')
  )
    return dataSrc;
  if (src && !src.includes('svg+xml') && !src.startsWith('data:')) return src;
  return dataSrc || src || '';
}

function cleanSlug(href) {
  return String(href || '')
    .replace(BASE, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/$/, '');
}

/* ------------------------------------------------------------------ */
/*  SCRAPERS                                                           */
/* ------------------------------------------------------------------ */

async function getTerbaru(page = 1) {
  const url = `${BASE}/anime/?page=${page}`;
  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('.listupd .bs, .listupd .bsx, .serieslist li').each((_, el) => {
    const a = $(el).find('a').first();
    const title = a.attr('title') || a.text().trim();
    const href = a.attr('href') || '';
    if (!href || seen.has(href) || !title) return;
    seen.add(href);
    const slug = cleanSlug(href);
    const poster = getPoster($, el);
    const ep = $(el).find('.episode, .epx, .epxs, .sb').text().trim();
    const rating = $(el).find('.numscore, .rating, .score').text().trim();
    const type = $(el).find('.typez, .typeflag, .type').first().text().trim();
    if (title && slug) results.push({ title, slug, poster, episode: ep, rating, type });
  });

  // Filter hanya yang tidak Completed
  return results.filter((r) => {
    if (!r.episode) return true;
    const ep = r.episode.toLowerCase();
    return !ep.includes('completed');
  });
}

async function getPopuler() {
  const html = await fetchPage(`${BASE}/anime/?order=popular`);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('.listupd .bs, .listupd .bsx').each((_, el) => {
    const a = $(el).find('a').first();
    const title = a.attr('title') || a.text().trim();
    const href = a.attr('href') || '';
    if (!href || seen.has(href) || !title) return;
    seen.add(href);
    const slug = cleanSlug(href);
    const poster = getPoster($, el);
    const rating = $(el).find('.numscore, .rating, .score').text().trim();
    results.push({ title, slug, poster, rating });
  });
  return results;
}

async function searchAnime(q, page = 1) {
  const url = `${BASE}/?s=${encodeURIComponent(q)}&page=${page}`;
  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('.listupd .bs, .listupd .bsx, .search-results article').each((_, el) => {
    const a = $(el).find('a').first();
    const title = a.attr('title') || a.text().trim();
    const href = a.attr('href') || '';
    if (!href || seen.has(href)) return;
    seen.add(href);
    const slug = cleanSlug(href);
    const poster = getPoster($, el);
    const ep = $(el).find('.episode, .epx, .epxs, .sb').text().trim();
    if (title && slug) results.push({ title, slug, poster, episode: ep });
  });
  return results;
}

async function getDaftarAnime(params = {}) {
  const { page = 1, order = 'latest', genre } = params;
  let url;
  if (genre) {
    if (page <= 1) {
      url = `${BASE}/genres/${encodeURIComponent(genre)}/`;
    } else {
      url = `${BASE}/genres/${encodeURIComponent(genre)}/page/${page}/`;
    }
    if (order === 'title') url += '&order=title';
    else if (order === 'popular') url += '&order=popular';
    else if (order === 'update') url += '&order=update';
  } else {
    url = `${BASE}/anime/?page=${page}`;
    if (order === 'title') url += '&order=title';
    else if (order === 'popular') url += '&order=popular';
    else if (order === 'update') url += '&order=update';
  }

  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('.listupd .bs, .listupd .bsx').each((_, el) => {
    const a = $(el).find('a').first();
    const title = a.attr('title') || a.text().trim();
    const href = a.attr('href') || '';
    if (!href || seen.has(href)) return;
    seen.add(href);
    const slug = cleanSlug(href);
    const poster = getPoster($, el);
    const rating = $(el).find('.numscore, .rating, .score').text().trim();
    const type = $(el).find('.typez, .typeflag, .type').first().text().trim();
    const ep = $(el).find('.episode, .epx, .epxs, .sb').text().trim();
    if (title && slug) results.push({ title, slug, poster, rating, type, episode: ep });
  });
  return results;
}

async function getDetail(slug) {
  const url = `${BASE}/anime/${slug}/`;
  const html = await fetchPage(url);
  if (!html) return null;
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim();
  const posterImg = $('.thumb img, .poster img, .anime-thumb img').first();
  const poster =
    (posterImg.attr('data-src') &&
    !posterImg.attr('data-src')?.includes('svg+xml') &&
    !posterImg.attr('data-src')?.includes('acscdn')
      ? posterImg.attr('data-src')
      : posterImg.attr('src')) || '';

  const rating = $('.numscore, .rating_value, .score, .rating').first().text().trim();
  const synopsis =
    $('.entry-content p, .sinopsis, .desc, .synopsis').first().text().trim() ||
    $('.summary .text').first().text().trim();

  const info = {};
  $('.spe span, .infoanime span, .infolist li, .sertoinfo span').each((_, el) => {
    const t = $(el).text().trim();
    const m = t.match(/^([^:]+)\s*:\s*(.+)$/);
    if (m) info[m[1].toLowerCase().trim()] = m[2].trim();
  });
  const bodyText = $('body').text();
  const statusMatch = bodyText.match(/Status\s*:\s*(\w+)/i);
  if (statusMatch) info['status'] = statusMatch[1];
  const typeMatch = bodyText.match(/Type\s*:\s*(\w+)/i);
  if (typeMatch) info['type'] = typeMatch[1];

  const totalEpisodes = info['total episode'] || info['episodes'] || '';
  const duration = info['duration'] || info['durasi'] || '';
  const releaseDate =
    info['released on'] || info['released'] || info['tanggal rilis'] || '';
  const rawStudio = info['studio'] || '';
  const studio = rawStudio.replace(/&[a-z]+;/gi, '').trim();

  const genresSet = new Set();
  $('.genxed a[href*="/genres/"], .genres a[href*="/genres/"]').each((_, el) => {
    const g = $(el).text().trim();
    if (g) genresSet.add(g);
  });
  if (genresSet.size === 0) {
    $('a[rel="tag"][href*="/genres/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && g.length < 30) genresSet.add(g);
    });
  }
  const genres = Array.from(genresSet);

  const episodes = [];
  const seenEp = new Set();
  for (const sel of ['.eplister li', '.episode-list li', '.episodelist li']) {
    $(sel).each((_, el) => {
      const a = $(el).find('a').first();
      const epTitle = a.text().trim();
      const href = a.attr('href') || '';
      const epSlug = cleanSlug(href);
      const date = $(el).find('.date, .epdate, .epl-date').text().trim();
      if (epTitle && epSlug && !seenEp.has(epSlug)) {
        seenEp.add(epSlug);
        episodes.push({ title: epTitle, slug: epSlug, date });
      }
    });
    if (episodes.length > 0) break;
  }

  return {
    title,
    poster,
    rating,
    type: info['type'] || info['tipe'] || $('.type').text().trim() || '',
    status: info['status'] || $('.status').text().trim() || '',
    totalEpisodes,
    duration,
    releaseDate,
    studio,
    genres,
    synopsis,
    episodes,
  };
}

async function getEpisode(slug) {
  const url = `${BASE}/${slug}/`;
  const html = await fetchPage(url);
  if (!html) return null;
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim();

  let animeSlug;
  const animeLink = $('a[href*="/anime/"]').first().attr('href') || '';
  if (animeLink) animeSlug = cleanSlug(animeLink);

  const prevHref =
    $('.naveps .nvs a[rel="prev"], .prev a, .naveps .prev a, .prevpost a, .naveps .prevpage a, a[aria-label="prev"]').attr('href') || '';
  const nextHref =
    $('.naveps .nvs a[rel="next"], .next a, .naveps .next a, .nextpost a, .naveps .nextpage a, a[aria-label="next"]').attr('href') || '';
  const prevSlug = prevHref.replace(BASE, '').replace(/^\/+|\/+$/g, '') || undefined;
  const nextSlug = nextHref.replace(BASE, '').replace(/^\/+|\/+$/g, '') || undefined;

  let streamUrl;
  const lazyIframe = $('iframe[data-litespeed-src]').first().attr('data-litespeed-src');
  if (
    lazyIframe &&
    (lazyIframe.includes('video.g') ||
      lazyIframe.includes('blogger') ||
      lazyIframe.includes('embed'))
  ) {
    streamUrl = lazyIframe;
  }
  if (!streamUrl) {
    const iframeSrc = $('iframe').first().attr('src');
    if (iframeSrc && !iframeSrc.includes('about:blank') && !iframeSrc.includes('facebook')) {
      streamUrl = iframeSrc;
    }
  }

  const downloads = [];
  const foundUrls = new Set();
  $('a').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || foundUrls.has(href)) return;

    const isDL =
      /gofile|krakenfiles|acefile|pixeldrain|mediafire|filedon|vidhide|mp4upload|drive\.google|mega\.nz|streamtape|doodstream|voe\.sx|mixdrop|terabox|dropbox|zippyshare|anonfiles|racaty|uqload|streamwish|lvturbo|filelions|upload\.cat|bayfiles/i.test(href);
    if (!isDL) return;
    foundUrls.add(href);

    const parentText = $(el).parent().text() + ' ' + $(el).parent().parent().text();
    const qMatch = parentText.match(/(360p|480p|720p|1080p|4K|MP4HD|FULLHD|x265|x264|MKV|MP4)/gi);
    let quality = qMatch ? qMatch[qMatch.length - 1].toUpperCase() : 'Download';
    if (quality === 'MKV' || quality === 'MP4') {
      const r = parentText.match(/(360p|480p|720p|1080p|4K)/i);
      quality = r ? r[1].toUpperCase() : quality;
    }

    let dlGroup = downloads.find((d) => d.quality === quality);
    if (!dlGroup) {
      dlGroup = { quality, links: [] };
      downloads.push(dlGroup);
    }
    const linkName = $(el).text().trim() || href.split('/')[2] || 'Download';
    if (!dlGroup.links.find((l) => l.url === href))
      dlGroup.links.push({ name: linkName, url: href });
  });

  const relatedEpisodes = [];
  const seenRel = new Set();
  $('.eplister li, .episode-list li, .episodelist li').each((_, el) => {
    const a = $(el).find('a').first();
    const epTitle = a.text().trim();
    const href = a.attr('href') || '';
    const epSlug = cleanSlug(href);
    const date = $(el).find('.date, .epdate, .epl-date').text().trim();
    if (epTitle && epSlug && !seenRel.has(epSlug)) {
      seenRel.add(epSlug);
      relatedEpisodes.push({ title: epTitle, slug: epSlug, date });
    }
  });

  return { title, animeSlug, prevSlug, nextSlug, streamUrl, downloads, relatedEpisodes };
}

function getGenres() {
  const genres = [
    'Action','Adult Cast','Adventure','Anthropomorphic','Avant Garde','Boys Love','CGDCT','Childcare',
    'Comedy','Crossdressing','Delinquents','Detective','Drama','Ecchi','Educational','Erotica',
    'Fantasy','Gag Humor','Girls Love','Gore','Gourmet','Harem','Hentai','High Stakes Game',
    'Historical','Horror','Idols (Female)','Idols (Male)','Isekai','Iyashikei','Josei','Kids',
    'Love Polygon','Love Status Quo','Magical Sex Shift','Mahou Shoujo','Martial Arts','Mecha',
    'Medical','Military','Music','Mystery','Mythology','Organized Crime','Otaku Culture','Parody',
    'Performing Arts','Pets','Psychological','Racing','Reincarnation','Reverse Harem','Romance',
    'Romantic Subtext','Samurai','School','Sci-Fi','Seinen','Shoujo','Shounen','Showbiz',
    'Slice of Life','Space','Sports','Strategy Game','Super Power','Supernatural','Survival',
    'Suspense','Team Sports','Time Travel','Urban Fantasy','Vampire','Video Game','Villainess',
    'Visual Arts','Workplace',
  ];
  return genres.map((name) => ({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
  }));
}

/* ------------------------------------------------------------------ */
/*  MODULE EXPORT (EpannStream Format)                                 */
/* ------------------------------------------------------------------ */

module.exports = {
  meta: {
    id: 'samehadaku',
    name: 'Samehadaku',
    description:
      'Scraper anime dari Samehadaku (samehadaku.li) — tanpa CloudFlare, aman dijalankan dari Vercel.',
    baseUrl: BASE,
    icon: 'tv',
    tags: ['anime', 'streaming', 'samehadaku'],
    order: 40,
    stability: 'stable',
  },

  endpoints: [
    /* ---------------- ANIME TERBARU ---------------- */
    {
      name: 'Anime Terbaru',
      method: 'GET',
      path: '/terbaru',
      group: 'Samehadaku',
      description: 'Ambil daftar anime terbaru (exclude Completed).',
      cache: 300,
      params: [
        {
          name: 'page',
          in: 'query',
          type: 'number',
          required: false,
          default: 1,
          example: 1,
          description: 'Halaman daftar anime.',
        },
      ],
      responseShape: { total: 'number', items: 'array' },
      handler: async ({ query }) => {
        const items = await getTerbaru(Number(query.page) || 1);
        return { total: items.length, items };
      },
    },

    /* ---------------- ANIME POPULER ---------------- */
    {
      name: 'Anime Populer',
      method: 'GET',
      path: '/populer',
      group: 'Samehadaku',
      description: 'Ambil daftar anime populer (order=popular).',
      cache: 600,
      params: [],
      responseShape: { total: 'number', items: 'array' },
      handler: async () => {
        const items = await getPopuler();
        return { total: items.length, items };
      },
    },

    /* ---------------- SEARCH ---------------- */
    {
      name: 'Search Anime',
      method: 'GET',
      path: '/search',
      group: 'Samehadaku',
      description: 'Cari anime berdasarkan keyword.',
      cache: 120,
      params: [
        {
          name: 'q',
          in: 'query',
          type: 'string',
          required: true,
          example: 'one piece',
          description: 'Keyword pencarian.',
        },
        {
          name: 'page',
          in: 'query',
          type: 'number',
          required: false,
          default: 1,
          example: 1,
          description: 'Halaman hasil pencarian.',
        },
      ],
      responseShape: { total: 'number', items: 'array' },
      handler: async ({ query }) => {
        const q = String(query.q || '').trim();
        if (!q) {
          const err = new Error('Parameter "q" wajib diisi.');
          err.statusCode = 400;
          throw err;
        }
        const items = await searchAnime(q, Number(query.page) || 1);
        return { total: items.length, items };
      },
    },

    /* ---------------- DAFTAR ANIME ---------------- */
    {
      name: 'Daftar Anime',
      method: 'GET',
      path: '/daftar',
      group: 'Samehadaku',
      description: 'Daftar anime dengan filter genre / order / page.',
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
          name: 'order',
          in: 'query',
          type: 'string',
          required: false,
          default: 'latest',
          example: 'popular',
          description: 'Urutan: latest | title | popular | update.',
        },
        {
          name: 'genre',
          in: 'query',
          type: 'string',
          required: false,
          example: 'action',
          description: 'Slug genre (opsional).',
        },
      ],
      responseShape: { total: 'number', items: 'array' },
      handler: async ({ query }) => {
        const items = await getDaftarAnime({
          page: Number(query.page) || 1,
          order: query.order || 'latest',
          genre: query.genre || undefined,
        });
        return { total: items.length, items };
      },
    },

    /* ---------------- ANIME DETAIL ---------------- */
    {
      name: 'Anime Detail',
      method: 'GET',
      path: '/anime/:slug',
      group: 'Samehadaku',
      description: 'Ambil detail lengkap sebuah anime termasuk daftar episode.',
      cache: 300,
      params: [
        {
          name: 'slug',
          in: 'path',
          type: 'string',
          required: true,
          example: 'one-piece',
          description: 'Slug anime (mis. one-piece).',
        },
      ],
      responseShape: {
        title: 'string',
        poster: 'string',
        genres: 'array',
        episodes: 'array',
      },
      handler: async ({ params }) => {
        const detail = await getDetail(params.slug);
        if (!detail) {
          const err = new Error('Anime tidak ditemukan.');
          err.statusCode = 404;
          throw err;
        }
        return detail;
      },
    },

    /* ---------------- EPISODE ---------------- */
    {
      name: 'Episode',
      method: 'GET',
      path: '/episode/:slug',
      group: 'Samehadaku',
      description: 'Ambil data episode: stream URL, download links, prev/next.',
      cache: 300,
      params: [
        {
          name: 'slug',
          in: 'path',
          type: 'string',
          required: true,
          example: 'one-piece-episode-1000',
          description: 'Slug episode (mis. one-piece-episode-1000).',
        },
      ],
      responseShape: {
        title: 'string',
        streamUrl: 'string',
        downloads: 'array',
      },
      handler: async ({ params }) => {
        const ep = await getEpisode(params.slug);
        if (!ep) {
          const err = new Error('Episode tidak ditemukan.');
          err.statusCode = 404;
          throw err;
        }
        return ep;
      },
    },

    /* ---------------- GENRES ---------------- */
    {
      name: 'List Genres',
      method: 'GET',
      path: '/genres',
      group: 'Samehadaku',
      description: 'Daftar genre statis yang didukung Samehadaku.',
      cache: 86400,
      params: [],
      responseShape: { total: 'number', items: 'array' },
      handler: async () => {
        const items = getGenres();
        return { total: items.length, items };
      },
    },
  ],
};