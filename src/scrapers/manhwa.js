'use strict';

const { get } = require('../core/http');

const BASE = 'https://manwhaku.my.id';

/* ---------------------------- parsers ---------------------------- */
function parseCards(html, sourceUrl) {
  const matches = [...html.matchAll(/<a\s+[^>]*href="(\/manga\/([^"]+))"[^>]*>([\s\S]*?)<\/a>/g)];
  return matches.map(([_, p, slug, inner]) => {
    const titleMatch = inner.match(/alt="([^"]+)"/) || inner.match(/<h3[^>]*>(.*?)<\/h3>/);
    const title = titleMatch ? titleMatch[1].replace(/<!--.*?-->/g, '').trim() : slug;

    const imgMatch = inner.match(/url=([^&"'\s]+)/);
    const cover = imgMatch
      ? decodeURIComponent(imgMatch[1])
      : (inner.match(/src="([^"]+)"/)?.[1] || null);

    const ratingMatch =
      inner.match(/(?:★|lucide-star[^>]*>[\s\S]*?<\/svg>)\s*(?:<!-- -->\s*)?<span[^>]*>([\d.]+)<\/span>/i) ||
      inner.match(/★\s*(?:<!-- -->\s*)?([\d.]+)/);

    const chapterMatch =
      inner.match(/(?:Chapter|Ch\.)\s*(?:<!-- -->\s*)?(\d+)/i) ||
      inner.match(/<span class="text-\[#d4d4d8\][^"]*">(.*?)<\/span>/i);

    let chapter = null;
    if (chapterMatch) {
      chapter = chapterMatch[1].replace(/<!--.*?-->/g, '').trim();
      if (/^\d+$/.test(chapter)) chapter = `Chapter ${chapter}`;
    }

    const typeMatch = inner.match(/<span class="capitalize">(.*?)<\/span>/i);

    return {
      title,
      slug,
      url: new URL(p, sourceUrl).href,
      cover,
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      chapter,
      type: typeMatch ? typeMatch[1].trim() : null
    };
  });
}

/* ---------------------------- actions ---------------------------- */
async function scrapeHome() {
  const html = await get(BASE);
  const data = parseCards(html, BASE);
  return { source: BASE, count: data.length, data };
}

async function scrapeManga({ query = null, page = 1 } = {}) {
  const url = new URL(`${BASE}/manga`);
  if (query) url.searchParams.set('q', query);
  if (page) url.searchParams.set('page', page);

  const html = await get(url.href);
  const data = parseCards(html, url.href);
  return { source: url.href, query: query || null, page: Number(page) || 1, count: data.length, data };
}

async function scrapeDetail(slug) {
  const url = slug.startsWith('http') ? slug : `${BASE}/manga/${slug}`;
  const html = await get(url);

  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const imgMatch = html.match(/url=([^&"'\s]+)/);
  const synMatch = html.match(/<p class="[^"]*text-\[#949ca8\][^"]*">([\s\S]*?)<\/p>/);
  const chapterMatches = [...html.matchAll(/href="(\/read\/([^"]+))"/g)];

  const chapters = [...new Set(chapterMatches.map((m) => m[1]))].map((p) => {
    const s = p.split('/').pop();
    const num = s.match(/chapter-([\d-]+)/i);
    return { slug: s, chapterNumber: num ? num[1].replace('-', '.') : null, url: `${BASE}${p}` };
  });

  return {
    url,
    title: titleMatch ? titleMatch[1].replace(/<!--.*?-->/g, '').trim() : null,
    cover: imgMatch ? decodeURIComponent(imgMatch[1]) : null,
    synopsis: synMatch ? synMatch[1].replace(/<[^>]+>/g, '').trim() : null,
    totalChapters: chapters.length,
    chapters
  };
}

async function scrapeChapter(slug) {
  const url = slug.startsWith('http') ? slug : `${BASE}/read/${slug}`;
  const raw = await get(url);
  const clean = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

  const pagesMatch = clean.match(/"totalPages":\s*(\d+)/i);
  const coverMatch =
    clean.match(/"coverImage":\s*"([^"]+)"/i) ||
    clean.match(/property="og:image"\s+content="([^"]+)"/i);
  const mangaMatch =
    clean.match(/"manga":\s*"([^"]+)"/i) ||
    clean.match(/property="og:image:alt"\s+content="([^-"]+)/i);
  const prevMatch = clean.match(/"prevChapterSlug":\s*"([^"]+)"/i);
  const nextMatch = clean.match(/"nextChapterSlug":\s*"([^"]+)"/i);

  const totalPages = pagesMatch ? parseInt(pagesMatch[1], 10) : 1;
  const firstPanel = coverMatch ? coverMatch[1] : null;
  const panels = [];

  if (firstPanel) {
    const seq = firstPanel.match(/^(.*?)(\d+)(\.[a-z0-9]+)$/i);
    if (seq) {
      for (let i = 1; i <= totalPages; i++) {
        panels.push(`${seq[1]}${String(i).padStart(seq[2].length, '0')}${seq[3]}`);
      }
    } else {
      panels.push(firstPanel);
    }
  }

  return {
    url,
    mangaTitle: mangaMatch ? mangaMatch[1].trim() : null,
    totalPages,
    prevChapter: prevMatch ? `${BASE}/read/${prevMatch[1]}` : null,
    nextChapter: nextMatch ? `${BASE}/read/${nextMatch[1]}` : null,
    panelsCount: panels.length,
    panels
  };
}

/* -------------------------- MANIFEST ----------------------------- */
module.exports = {
  meta: {
    id: 'manhwa',
    name: 'Manhwa / Manga',
    description: 'Scraper komik: populer terbaru, pencarian judul, detail seri lengkap dengan daftar chapter, dan panel gambar per chapter.',
    baseUrl: BASE,
    icon: 'book-open',
    tags: ['manhwa', 'manga', 'comic', 'reader'],
    order: 20,
    stability: 'stable'
  },

  endpoints: [
    {
      name: 'Home',
      method: 'GET',
      path: '/home',
      group: 'Discovery',
      description: 'Daftar komik yang tampil di halaman utama (update terbaru & populer).',
      cache: 180,
      params: [],
      responseShape: { count: 'number', data: '[{ title, slug, url, cover, rating, chapter, type }]' },
      handler: () => scrapeHome()
    },
    {
      name: 'List',
      method: 'GET',
      path: '/list',
      group: 'Discovery',
      description: 'Katalog komik dengan pagination.',
      cache: 180,
      params: [
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Nomor halaman katalog.' }
      ],
      handler: ({ query }) => scrapeManga({ page: parseInt(query.page, 10) || 1 })
    },
    {
      name: 'Search',
      method: 'GET',
      path: '/search',
      group: 'Discovery',
      description: 'Cari komik berdasarkan judul / keyword.',
      cache: 120,
      params: [
        { name: 'q', in: 'query', type: 'string', required: true, example: 'lookism', description: 'Kata kunci pencarian.' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Nomor halaman hasil.' }
      ],
      handler: ({ query }) => scrapeManga({ query: query.q, page: parseInt(query.page, 10) || 1 })
    },
    {
      name: 'Detail',
      method: 'GET',
      path: '/detail/:slug',
      group: 'Content',
      description: 'Detail seri: judul, cover, sinopsis, dan seluruh daftar chapter.',
      cache: 300,
      params: [
        { name: 'slug', in: 'path', type: 'string', required: true, example: 'lookism', description: 'Slug seri komik.' }
      ],
      handler: ({ params }) => scrapeDetail(params.slug)
    },
    {
      name: 'Chapter',
      method: 'GET',
      path: '/chapter/:slug',
      group: 'Content',
      description: 'Ambil seluruh panel gambar dari satu chapter beserta navigasi prev/next.',
      cache: 600,
      params: [
        { name: 'slug', in: 'path', type: 'string', required: true, example: 'lookism-chapter-623', description: 'Slug chapter.' }
      ],
      handler: ({ params }) => scrapeChapter(params.slug)
    }
  ],

  // diexport supaya bisa dipakai modul lain / unit test
  actions: { scrapeHome, scrapeManga, scrapeDetail, scrapeChapter }
};