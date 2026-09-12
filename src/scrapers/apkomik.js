'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — APKOMIK SCRAPER MODULE
 * ---------------------------------------------------------------------
 *  File   : src/scrapers/apkomik.js
 *  Source : https://01.apkomik.com
 * =====================================================================
 */

const cheerio = require('cheerio');
const { get } = require('../core/http');

const BASE_URL = 'https://01.apkomik.com';
const SOURCE = 'apkomik';
const MANGA_PATH_REGEX = /\/manga\/([^/?#]+)/i;

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

async function fetchHtml(url) {
  const html = await get(url);
  return cheerio.load(html);
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function slugifyGenre(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[’'".]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveMangaTarget(rawValue, fallbackBaseUrl = BASE_URL) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { slug: '', baseUrl: fallbackBaseUrl, url: null };

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const parsed = new URL(raw);
      const match = parsed.pathname.match(MANGA_PATH_REGEX);
      const slug = String(match?.[1] || '').replace(/\/$/, '').trim();
      return {
        slug,
        baseUrl: `${parsed.protocol}//${parsed.host}`,
        url: slug ? `${parsed.protocol}//${parsed.host}/manga/${slug}/` : parsed.toString(),
      };
    }
  } catch {}

  const pathMatch = raw.match(MANGA_PATH_REGEX);
  if (pathMatch?.[1]) {
    const slug = String(pathMatch[1]).replace(/\/$/, '').trim();
    return { slug, baseUrl: fallbackBaseUrl, url: `${fallbackBaseUrl}/manga/${slug}/` };
  }

  const slug = raw.replace(/^\/+|\/+$/g, '').replace(/^manga\//i, '').trim();
  return { slug, baseUrl: fallbackBaseUrl, url: slug ? `${fallbackBaseUrl}/manga/${slug}/` : null };
}

/* ------------------------------------------------------------------ */
/*  SCRAPERS                                                           */
/* ------------------------------------------------------------------ */

async function scrapeMangaDetail(slug, baseUrl = BASE_URL) {
  let cleanBaseUrl = baseUrl;
  if (cleanBaseUrl.startsWith('http://') || cleanBaseUrl.startsWith('https://')) {
    try {
      const parsed = new URL(cleanBaseUrl);
      cleanBaseUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {}
  }
  const mangaUrl = `${cleanBaseUrl}/manga/${slug}/`;
  const $ = await fetchHtml(mangaUrl);

  const title =
    cleanText($('.entry-title').first().text()) ||
    cleanText($('h1').first().text()) ||
    slug.replace(/-/g, ' ');

  let alternativeName = '';
  $('.wd-full').each((_, el) => {
    const bText = $(el).find('b').text().trim();
    if (bText.toLowerCase().includes('alternative')) {
      alternativeName = cleanText($(el).find('span').text());
    }
  });

  let coverImage = null;
  const coverImgEl = $('.thumb img').first();
  if (coverImgEl.length) {
    let src = coverImgEl.attr('src') || coverImgEl.attr('data-src');
    if (src) {
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) src = baseUrl + src;
      coverImage = src;
    }
  }

  let synopsis =
    cleanText($('.entry-content p, [itemprop="description"] p').text()) ||
    cleanText($('.entry-content, [itemprop="description"]').text());

  const genres = new Set();
  $('.mgen a').each((_, el) => {
    const txt = cleanText($(el).text());
    const gSlug = slugifyGenre(txt);
    if (gSlug) genres.add(gSlug);
  });

  let rating = null;
  const ratingText = $('.numrating').text().trim() || $('.rating-prc .num').text().trim();
  if (ratingText) {
    const parsedRating = parseFloat(ratingText);
    if (Number.isFinite(parsedRating) && parsedRating > 0) rating = parsedRating;
  }

  let contentType = 'manga';
  $('.imptdt, .tsinfo, .info-cast, .info-post').each((_, el) => {
    const text = $(el).text().toLowerCase();
    if (text.includes('type') || text.includes('tipe')) {
      if (text.includes('manhwa')) contentType = 'manhwa';
      else if (text.includes('manhua')) contentType = 'manhua';
      else if (text.includes('manga')) contentType = 'manga';
      else if (text.includes('comic')) contentType = 'comic';
    }
  });

  const chapters = [];
  $('#chapterlist ul li, .cl ul li').each((_, el) => {
    const item = $(el);
    const linkEl = item.find('a').first();
    const href = linkEl.attr('href') || '';
    if (!href) return;

    const fullUrl = href.startsWith('http') ? href : baseUrl + href.replace(/^\//, '');
    const chapterSlug = href.split('/').filter(Boolean).pop();

    const titleText = linkEl.find('.chapternum').text().trim() || linkEl.text().trim();

    let chapterNumber = null;
    const numMatch =
      chapterSlug.match(/chapter-([\d.]+)/i) ||
      titleText.match(/chapter\s+([\d.]+)/i) ||
      titleText.match(/ch\.\s*([\d.]+)/i) ||
      titleText.match(/([\d.]+)/);
    if (numMatch) chapterNumber = parseFloat(numMatch[1]);

    chapters.push({
      title: titleText || chapterSlug,
      url: fullUrl,
      slug: chapterSlug,
      chapterNumber,
    });
  });

  return {
    slug,
    url: mangaUrl,
    title,
    coverImage,
    alternativeName: alternativeName || null,
    synopsis,
    genres: Array.from(genres),
    chapters,
    rating,
    contentType,
  };
}

async function scrapeChapterImages(chapterUrl, baseUrl = BASE_URL) {
  const $ = await fetchHtml(chapterUrl);
  const images = [];
  const seen = new Set();

  $('script').each((_, el) => {
    const text = $(el).text();
    if (text.includes('ts_reader.run')) {
      const match = text.match(/ts_reader\.run\((.*?)\);/);
      if (match && match[1]) {
        try {
          const data = JSON.parse(match[1]);
          if (data.sources && data.sources[0] && data.sources[0].images) {
            for (let src of data.sources[0].images) {
              src = String(src).trim();
              if (!src) continue;
              if (src.startsWith('//')) src = 'https:' + src;
              else if (src.startsWith('/')) src = baseUrl + src;
              if (seen.has(src)) continue;
              seen.add(src);
              images.push(src);
            }
          }
        } catch (e) {
          console.error('Failed parsing ts_reader json:', e);
        }
      }
    }
  });

  if (images.length === 0) {
    $('#readerarea img').each((_, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src');
      if (!src) return;
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) src = baseUrl + src;
      src = src.trim();
      if (seen.has(src)) return;
      seen.add(src);
      images.push(src);
    });
  }

  return images;
}

async function scrapeMangaList(listUrl) {
  const $ = await fetchHtml(listUrl);
  const list = [];
  const seen = new Set();

  const selectors = [
    '.listupd .bsx a',
    '.listupd .bs a',
    '.listupd .utao a',
    '.listupd .soralist a',
    '#content .bsx a',
    'main .bsx a',
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href) return;

      const target = resolveMangaTarget(href);
      if (target.slug && !seen.has(target.slug)) {
        seen.add(target.slug);

        const title =
          cleanText($(el).find('.tt').text()) ||
          cleanText($(el).find('.tt').first().text()) ||
          cleanText($(el).attr('title')) ||
          cleanText($(el).find('img').attr('alt')) ||
          target.slug.replace(/-/g, ' ');

        list.push({
          title,
          slug: target.slug,
          url: target.url || href,
        });
      }
    });
    if (list.length > 0) break;
  }

  if (list.length === 0) {
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href) return;

      const target = resolveMangaTarget(href);
      if (target.slug && !seen.has(target.slug)) {
        seen.add(target.slug);
        const title = cleanText($(el).text()) || target.slug.replace(/-/g, ' ');
        list.push({
          title,
          slug: target.slug,
          url: target.url || href,
        });
      }
    });
  }

  return list;
}

/* ------------------------------------------------------------------ */
/*  MODULE EXPORT (EpannStream Format)                                 */
/* ------------------------------------------------------------------ */

module.exports = {
  meta: {
    id: 'apkomik',
    name: 'ApKomik',
    description: 'Scraper manga/manhwa/manhua dari situs ApKomik (01.apkomik.com).',
    baseUrl: BASE_URL,
    icon: 'book-open',
    tags: ['manga', 'manhwa', 'manhua', 'comic'],
    order: 50,
    stability: 'stable',
  },

  endpoints: [
    /* ---------------- MANGA LIST ---------------- */
    {
      name: 'Manga List',
      method: 'GET',
      path: '/list',
      group: 'ApKomik',
      description: 'Ambil daftar manga dari halaman list ApKomik.',
      cache: 120,
      params: [
        {
          name: 'url',
          in: 'query',
          type: 'string',
          required: false,
          default: `${BASE_URL}/manga/`,
          example: `${BASE_URL}/manga/`,
          description: 'URL halaman list manga (opsional).',
        },
      ],
      responseShape: { total: 'number', items: 'array' },
      handler: async ({ query }) => {
        const listUrl = String(query.url || `${BASE_URL}/manga/`).trim();
        const items = await scrapeMangaList(listUrl);
        return { total: items.length, items };
      },
    },

    /* ---------------- MANGA DETAIL ---------------- */
    {
      name: 'Manga Detail',
      method: 'GET',
      path: '/manga/:slug',
      group: 'ApKomik',
      description: 'Ambil detail manga (judul, cover, sinopsis, genre, daftar chapter).',
      cache: 60,
      params: [
        {
          name: 'slug',
          in: 'path',
          type: 'string',
          required: true,
          example: 'solo-leveling',
          description: 'Slug manga (mis. solo-leveling) atau URL lengkap.',
        },
        {
          name: 'baseUrl',
          in: 'query',
          type: 'string',
          required: false,
          default: BASE_URL,
          example: BASE_URL,
          description: 'Override base URL (opsional).',
        },
      ],
      responseShape: {
        slug: 'string',
        title: 'string',
        coverImage: 'string',
        genres: 'array',
        chapters: 'array',
        rating: 'number',
        contentType: 'string',
      },
      handler: async ({ params, query }) => {
        const target = resolveMangaTarget(params.slug, query.baseUrl || BASE_URL);
        if (!target.slug) {
          const err = new Error('Slug manga tidak valid.');
          err.statusCode = 400;
          throw err;
        }
        return scrapeMangaDetail(target.slug, target.baseUrl);
      },
    },

    /* ---------------- CHAPTER IMAGES ---------------- */
    {
      name: 'Chapter Images',
      method: 'GET',
      path: '/chapter',
      group: 'ApKomik',
      description: 'Ambil daftar URL gambar untuk sebuah chapter.',
      cache: 300,
      params: [
        {
          name: 'url',
          in: 'query',
          type: 'string',
          required: true,
          example: `${BASE_URL}/solo-leveling-chapter-1/`,
          description: 'URL lengkap halaman chapter.',
        },
        {
          name: 'baseUrl',
          in: 'query',
          type: 'string',
          required: false,
          default: BASE_URL,
          example: BASE_URL,
          description: 'Override base URL (opsional).',
        },
      ],
      responseShape: { total: 'number', images: 'array' },
      handler: async ({ query }) => {
        const chapterUrl = String(query.url || '').trim();
        if (!chapterUrl) {
          const err = new Error('Parameter "url" wajib diisi.');
          err.statusCode = 400;
          throw err;
        }
        const images = await scrapeChapterImages(chapterUrl, query.baseUrl || BASE_URL);
        return { total: images.length, images };
      },
    },

    /* ---------------- SEARCH ---------------- */
    {
      name: 'Search',
      method: 'GET',
      path: '/search',
      group: 'ApKomik',
      description: 'Cari manga berdasarkan keyword.',
      cache: 60,
      params: [
        {
          name: 'q',
          in: 'query',
          type: 'string',
          required: true,
          example: 'solo',
          description: 'Keyword pencarian.',
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
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(q)}`;
        const items = await scrapeMangaList(searchUrl);
        return { total: items.length, items };
      },
    },
  ],
};