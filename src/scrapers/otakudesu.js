'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — OTAKUDESU SCRAPER MODULE
 * ---------------------------------------------------------------------
 *  File   : src/scrapers/otakudesu.js
 *  Source : https://otakudesu.blog
 * =====================================================================
 */

const cheerio = require('cheerio');
const { get } = require('../core/http');

const BASE = 'https://otakudesu.blog';

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
    console.error('[Otakudesu]', url, e.message);
    return null;
  }
}

function getPoster($, el) {
  const img = $(el).find('img').first();
  const src = img.attr('src') || '';
  const dataSrc = img.attr('data-src') || '';
  if (
    dataSrc &&
    !dataSrc.includes('svg+xml') &&
    !dataSrc.includes('data:') &&
    !dataSrc.includes('acscdn')
  )
    return dataSrc;
  if (src && !src.includes('svg+xml') && !src.startsWith('data:')) return src;
  return dataSrc || src || '';
}

function cleanSlug(href) {
  return String(href || '')
    .replace(BASE, '')
    .replace(/^\/+/g, '')
    .replace(/\/+$/g, '')
    .replace(/^series\//, '');
}

function shortTitle(t) {
  const clean = String(t || '')
    .replace(/\s*Episode\s+\d+\s*Subtitle Indonesia\s*$/i, '')
    .trim();
  if (clean.length > 40) return clean.slice(0, 38) + '...';
  return clean;
}

function epSlugToSeriesSlug(epSlug) {
  return String(epSlug || '')
    .replace(/-episode-\d+-.*$/i, '')
    .replace(/\/+$/g, '');
}

// Resolve series slug: try direct URL → search fallback
async function resolveSeriesSlug(slug) {
  const candidate = slug.includes('episode') ? epSlugToSeriesSlug(slug) : slug;

  // Try direct URL
  const testUrl = `${BASE}/series/${candidate}/`;
  const testHtml = await fetchPage(testUrl);
  if (testHtml) {
    const $$ = cheerio.load(testHtml);
    const h1 = $$('h1').first().text().trim();
    if (h1 && h1.length > 5 && !$$('body').html()?.includes('Latest Release')) {
      return candidate;
    }
  }

  // If slug is episode, fetch episode page for breadcrumb link
  if (slug.includes('episode')) {
    const epUrl = `${BASE}/${slug}/`;
    const epHtml = await fetchPage(epUrl);
    if (epHtml) {
      const $$e = cheerio.load(epHtml);
      const seriesLink = $$e('a[href*="/series/"]').first().attr('href') || '';
      if (seriesLink) {
        const m = seriesLink.match(/\/series\/([^/]+)/);
        if (m) return m[1];
      }
    }
    return null;
  }

  // Fallback: search by keywords extracted from slug
  const words = candidate.replace(/-/g, ' ').split(' ').filter((w) => w.length > 3);
  const searchQuery = words.slice(0, 2).join(' ');
  if (!searchQuery) return null;

  const searchUrl = `${BASE}/page/1/?s=${encodeURIComponent(searchQuery)}`;
  const searchHtml = await fetchPage(searchUrl);
  if (searchHtml) {
    const $$s = cheerio.load(searchHtml);
    const seriesLink = $$s('a[href*="/series/"]').first().attr('href') || '';
    if (seriesLink) {
      const m = seriesLink.match(/\/series\/([^/]+)/);
      if (m) return m[1];
    }
  }

  return null;
}

function parseTimeAgo(timeago) {
  const idDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
  if (!timeago) return { date: '', day: '' };

  const minutesMatch = timeago.match(/(\d+)\s*minutes?\s*ago/i);
  const hoursMatch = timeago.match(/(\d+)\s*hours?\s*ago/i);
  const daysMatch = timeago.match(/(\d+)\s*days?\s*ago/i);
  const weeksMatch = timeago.match(/(\d+)\s*weeks?\s*ago/i);

  let targetDate = new Date();
  if (minutesMatch) targetDate.setMinutes(targetDate.getMinutes() - parseInt(minutesMatch[1]));
  else if (hoursMatch) targetDate.setHours(targetDate.getHours() - parseInt(hoursMatch[1]));
  else if (daysMatch) targetDate.setDate(targetDate.getDate() - parseInt(daysMatch[1]));
  else if (weeksMatch) targetDate.setDate(targetDate.getDate() - parseInt(weeksMatch[1]) * 7);
  else {
    const parsed = new Date(timeago);
    if (!isNaN(parsed.getTime())) targetDate = parsed;
  }

  const d = targetDate.getDate();
  const m = enMonths[targetDate.getMonth()];
  const dayName = idDays[targetDate.getDay()];
  return { date: `${d} ${m}`, day: dayName };
}

/* ------------------------------------------------------------------ */
/*  SCRAPERS                                                           */
/* ------------------------------------------------------------------ */

async function getTerbaru(page = 1) {
  const url = page <= 1 ? `${BASE}/` : `${BASE}/page/${page}/`;
  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('.bsx').each((_, el) => {
    const a = $(el).find('a').first();
    const title = a.attr('title') || a.text().trim();
    const href = a.attr('href') || '';
    if (!href || seen.has(href) || !title) return;
    seen.add(href);
    const episodeSlug = cleanSlug(href);
    const seriesSlug = epSlugToSeriesSlug(episodeSlug);
    const poster = getPoster($, el);
    const ep = $(el).find('.epx, .episode, .sb').text().trim();
    const type = $(el).find('.typez, .typeflag, .type').first().text().trim();
    const rating = $(el).find('.numscore, .rating, .score').text().trim();
    const timeago = $(el).find('.timeago').text().trim();
    const { date, day } = parseTimeAgo(timeago);
    if (title && seriesSlug) {
      results.push({
        title: shortTitle(title),
        slug: seriesSlug,
        episodeSlug,
        poster,
        episode: ep,
        rating,
        type,
        date,
        day,
      });
    }
  });
  return results;
}

async function getPopuler() {
  const html = await fetchPage(`${BASE}/`);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('.serieslist li, .popular-post article, .widget-post article').each((_, el) => {
    const a = $(el).find('a').first();
    const title = a.attr('title') || a.text().trim();
    const href = a.attr('href') || '';
    if (!href || seen.has(href) || !title) return;
    seen.add(href);
    const slug = cleanSlug(href);
    const seriesSlug = slug.includes('/series/') ? cleanSlug(href) : epSlugToSeriesSlug(slug);
    const poster = getPoster($, el);
    const rating = $(el).find('.rating, .score').text().trim() || undefined;
    if (title && seriesSlug)
      results.push({ title: shortTitle(title), slug: seriesSlug, poster, rating });
  });
  return results.slice(0, 10);
}

async function searchAnime(q, page = 1) {
  const url = `${BASE}/page/${page}/?s=${encodeURIComponent(q)}`;
  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();
  $('article, .animepost, .post').each((_, el) => {
    const a = $(el).find('a').first();
    const title = a.attr('title') || a.text().trim();
    const href = a.attr('href') || '';
    if (!href || seen.has(href) || !title) return;
    seen.add(href);
    const slug = cleanSlug(href);
    const seriesSlug = slug.includes('/series/') ? cleanSlug(href) : epSlugToSeriesSlug(slug);
    const poster = getPoster($, el);
    if (title && seriesSlug) results.push({ title: shortTitle(title), slug: seriesSlug, poster });
  });
  return results;
}

async function getDaftarAnime(params = {}) {
  const { page = 1, order = 'latest', genre } = params;
  let url;
  if (genre) {
    url = `${BASE}/genres/${encodeURIComponent(genre)}/page/${page}/`;
  } else {
    url = `${BASE}/page/${page}/`;
  }
  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();
  $('article, .animepost, .post').each((_, el) => {
    const a = $(el).find('a').first();
    const title = a.attr('title') || a.text().trim();
    const href = a.attr('href') || '';
    if (!href || seen.has(href) || !title) return;
    seen.add(href);
    const slug = cleanSlug(href);
    const seriesSlug = slug.includes('/series/') ? cleanSlug(href) : epSlugToSeriesSlug(slug);
    const poster = getPoster($, el);
    const rating = $(el).find('.rating, .score').text().trim() || undefined;
    if (title && seriesSlug)
      results.push({ title: shortTitle(title), slug: seriesSlug, poster, rating });
  });
  return results;
}

async function getDetail(slug) {
  const seriesSlug = await resolveSeriesSlug(slug);
  if (!seriesSlug) return null;

  const url = `${BASE}/series/${seriesSlug}/`;
  const html = await fetchPage(url);
  if (!html) return null;
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim();
  if (!title || title === 'Otaku Desu' || title.includes('Latest Release')) return null;

  const posterImg = $('.thumb img, .poster img, img.wp-post-image').first();
  const posterEl = posterImg.parent().length ? posterImg.parent().get(0) : $('body').get(0);
  const poster = getPoster($, posterEl);

  const rating = $('.numscore, .rating_value, .score, .rating').first().text().trim();
  const synopsis =
    $('.bixbox.synp .entry-content p').first().text().trim() ||
    $('.sinopsis, .desc, .synopsis').first().text().trim() ||
    $('.entry-content p').first().text().trim();

  const info = {};
  $('.spe span, .infoanime span, .infolist li, .series-info span, .data').each((_, el) => {
    const t = $(el).text().trim();
    const m = t.match(/^([^:]+)\s*:\s*(.+)$/);
    if (m) info[m[1].toLowerCase().trim()] = m[2].trim();
  });

  const totalEpisodes = info['total episode'] || info['episodes'] || '';
  const duration = info['duration'] || info['durasi'] || '';
  const releaseDate = info['released on'] || info['released'] || info['tanggal rilis'] || '';
  const rawStudio = info['studio'] || '';
  const studio = rawStudio.replace(/&[a-z]+;/gi, '').trim();

  const genresSet = new Set();
  $('.genxed a[href*="/genres/"], .genres a[href*="/genres/"]').each((_, el) => {
    const g = $(el).text().trim();
    if (g && g.length < 30) genresSet.add(g);
  });
  if (genresSet.size === 0) {
    $('a[rel="tag"][href*="/genres/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && g.length < 30) genresSet.add(g);
    });
  }

  const episodes = [];
  const seenEp = new Set();

  $('.eplister li a').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href) return;
    const epSlug = cleanSlug(href);
    if (!epSlug || seenEp.has(epSlug)) return;
    seenEp.add(epSlug);
    const num = $(el).find('.epl-num').text().trim();
    const epTitle = $(el).find('.epl-title').text().trim() || 'Episode ' + num;
    const date = $(el).find('.epl-date').text().trim();
    episodes.push({ title: epTitle, slug: epSlug, date });
  });

  if (episodes.length === 0) {
    $('.eplister a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href || !href.includes('episode')) return;
      const epSlug = cleanSlug(href);
      if (!epSlug || seenEp.has(epSlug)) return;
      seenEp.add(epSlug);
      const num = $(el).find('.epl-num').text().trim();
      const epTitle = $(el).find('.epl-title').text().trim() || 'Episode ' + num;
      const date = $(el).find('.epl-date').text().trim();
      episodes.push({ title: epTitle, slug: epSlug, date });
    });
  }

  return {
    title,
    poster,
    rating,
    type: info['type'] || info['tipe'] || $('.typez').first().text().trim() || '',
    status: info['status'] || $('.status').text().trim() || '',
    totalEpisodes,
    duration,
    releaseDate,
    studio,
    genres: Array.from(genresSet),
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

  let streamUrl;
  const lazyIframe = $('iframe[data-litespeed-src]').first().attr('data-litespeed-src');
  if (
    lazyIframe &&
    (lazyIframe.includes('video.g') ||
      lazyIframe.includes('blogger') ||
      lazyIframe.includes('embed'))
  )
    streamUrl = lazyIframe;
  if (!streamUrl) {
    const iframeSrc = $('iframe').first().attr('src');
    if (iframeSrc && !iframeSrc.includes('about:blank') && !iframeSrc.includes('facebook'))
      streamUrl = iframeSrc;
  }

  let animeSlug;
  const animeLink = $('a[href*="/series/"]').first().attr('href') || '';
  if (animeLink) animeSlug = cleanSlug(animeLink);

  const prevHref = $('.naveps .prev a, a[rel="prev"], .prevpost a').attr('href') || '';
  const nextHref = $('.naveps .next a, a[rel="next"], .nextpost a').attr('href') || '';
  const prevSlug = prevHref ? cleanSlug(prevHref) : undefined;
  const nextSlug = nextHref ? cleanSlug(nextHref) : undefined;

  const downloads = [];
  const dlMap = new Map();
  $(
    '.download ul li, .listdownload li, .soraddl a, .entry-content a[href*="gofile"], .entry-content a[href*="drive"], .entry-content a[href*="acefile"], .entry-content a[href*="mega"]'
  ).each((_, el) => {
    const a = $(el).is('a') ? $(el) : $(el).find('a').first();
    const href = a.attr('href') || '';
    const text = a.text().trim() || $(el).text().trim();
    if (!href || href.includes('#')) return;
    let quality = 'Download';
    const parentText = $(el).parent().text() || '';
    const qMatch = parentText.match(/(\d+p)/) || text.match(/(\d+p)/);
    if (qMatch) quality = qMatch[1];
    if (!dlMap.has(quality)) dlMap.set(quality, []);
    dlMap.get(quality).push({
      name: text.replace(quality, '').replace(/[\(\)]/g, '').trim() || 'Link',
      url: href,
    });
  });

  for (const [quality, links] of dlMap) downloads.push({ quality, links });

  const relatedEpisodes = [];
  $('.eplister li, .episodelist li').each((_, el) => {
    const a = $(el).find('a').first();
    const epTitle = a.text().trim();
    const href = a.attr('href') || '';
    const epSlug = cleanSlug(href);
    const date = $(el).find('.date, .epdate, .epl-date').text().trim();
    if (epTitle && epSlug)
      relatedEpisodes.push({ title: shortTitle(epTitle), slug: epSlug, date });
  });

  return {
    title: shortTitle(title),
    animeSlug,
    prevSlug,
    nextSlug,
    streamUrl,
    downloads,
    relatedEpisodes,
  };
}

function getGenres() {
  return [
    'Action','Adventure','Comedy','Drama','Ecchi','Fantasy','Game','Harem','Historical','Horror',
    'Isekai','Magic','Martial Arts','Mecha','Military','Music','Mystery','Psychological',
    'Reincarnation','Romance','Samurai','School','Sci-Fi','Seinen','Shoujo','Shounen',
    'Slice of Life','Space','Sports','Super Power','Supernatural','Thriller','Vampire',
  ];
}

/* ------------------------------------------------------------------ */
/*  MODULE EXPORT (EpannStream Format)                                 */
/* ------------------------------------------------------------------ */

module.exports = {
  meta: {
    id: 'otakudesu',
    name: 'Otakudesu',
    description:
      'Scraper anime subtitle Indonesia dari Otakudesu (otakudesu.blog).',
    baseUrl: BASE,
    icon: 'clapperboard',
    tags: ['anime', 'streaming', 'otakudesu', 'indonesia'],
    order: 45,
    stability: 'stable',
  },

  endpoints: [
    /* ---------------- ANIME TERBARU ---------------- */
    {
      name: 'Anime Terbaru',
      method: 'GET',
      path: '/terbaru',
      group: 'Otakudesu',
      description: 'Ambil daftar rilis episode terbaru dari homepage Otakudesu.',
      cache: 300,
      params: [
        {
          name: 'page',
          in: 'query',
          type: 'number',
          required: false,
          default: 1,
          example: 1,
          description: 'Halaman (1 = homepage).',
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
      group: 'Otakudesu',
      description: 'Ambil 10 anime populer dari homepage.',
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
      group: 'Otakudesu',
      description: 'Cari anime berdasarkan keyword.',
      cache: 120,
      params: [
        {
          name: 'q',
          in: 'query',
          type: 'string',
          required: true,
          example: 'jujutsu',
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
      group: 'Otakudesu',
      description: 'Daftar anime dengan filter genre & page.',
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
          name: 'genre',
          in: 'query',
          type: 'string',
          required: false,
          example: 'action',
          description: 'Slug genre (opsional).',
        },
        {
          name: 'order',
          in: 'query',
          type: 'string',
          required: false,
          default: 'latest',
          example: 'latest',
          description: 'Urutan (reserved, default: latest).',
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
      group: 'Otakudesu',
      description:
        'Ambil detail lengkap anime (judul, poster, sinopsis, genre, daftar episode). Bisa terima slug series ATAU slug episode — akan di-resolve otomatis.',
      cache: 300,
      params: [
        {
          name: 'slug',
          in: 'path',
          type: 'string',
          required: true,
          example: 'jujutsu-kaisen',
          description: 'Slug series (mis. jujutsu-kaisen) atau slug episode.',
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
      group: 'Otakudesu',
      description:
        'Ambil data episode: stream URL, download links (grouped per quality), prev/next episode, dan related episodes.',
      cache: 300,
      params: [
        {
          name: 'slug',
          in: 'path',
          type: 'string',
          required: true,
          example: 'jujutsu-kaisen-episode-1-subtitle-indonesia',
          description: 'Slug episode lengkap.',
        },
      ],
      responseShape: {
        title: 'string',
        streamUrl: 'string',
        downloads: 'array',
        relatedEpisodes: 'array',
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
      group: 'Otakudesu',
      description: 'Daftar genre statis yang didukung Otakudesu.',
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