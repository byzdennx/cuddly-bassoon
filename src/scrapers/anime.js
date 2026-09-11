'use strict';

const cheerio = require('cheerio');
const { get, post } = require('../core/http');

const BASE_URL = 'https://v2.samehadaku.how';

/* ---------------------------- helpers ---------------------------- */
function cleanUrl(link) {
  if (!link) return null;
  const v = String(link).trim();
  if (!v || v === '#' || v.startsWith('javascript:')) return null;
  if (v.startsWith('http')) return v;
  if (v.startsWith('/')) return `${BASE_URL}${v}`;
  return `${BASE_URL}/${v}`;
}

function extractSlug(link) {
  if (!link) return '';
  const p = String(link).replace(BASE_URL, '').replace(/^\/+|\/+$/g, '');
  return p.split('/').pop() || '';
}

/* ---------------------------- actions ---------------------------- */
async function getLatest(page = 1) {
  const target = page > 1 ? `${BASE_URL}/anime-terbaru/page/${page}/` : `${BASE_URL}/anime-terbaru/`;
  const $ = cheerio.load(await get(target));
  const data = [];

  $('.post-show ul li').each((_, el) => {
    const anchor = $(el).find('.entry-title a, .dtla h2 a').first();
    const title = anchor.text().trim();
    const epUrl = cleanUrl(anchor.attr('href'));
    if (!title || !epUrl) return;

    data.push({
      title,
      slug: extractSlug(epUrl),
      url: epUrl,
      thumbnail: $(el).find('.thumb img').attr('src') || null,
      episode: $(el).find('.dtla span:contains("Episode") author').text().trim() || null,
      postedBy: $(el).find('.dtla span.author author').text().trim() || null,
      releasedOn:
        $(el).find('.dtla span:contains("Released")').text().replace(/.*Released on:\s*/i, '').trim() || null
    });
  });

  return { source: target, page: Number(page), total: data.length, data };
}

async function getTopAnime() {
  const $ = cheerio.load(await get(BASE_URL));
  const data = [];

  $('.topten-animesu .animepost').each((i, el) => {
    const title = $(el).find('.title, h2').text().trim();
    const itemUrl = cleanUrl($(el).find('a').attr('href'));
    if (!title || !itemUrl) return;

    data.push({
      rank: i + 1,
      title,
      slug: extractSlug(itemUrl),
      url: itemUrl,
      thumbnail: $(el).find('img').attr('src') || null,
      score: $(el).find('.score').text().trim() || null,
      type: $(el).find('.type').text().trim() || null
    });
  });

  return { source: BASE_URL, total: data.length, data };
}

async function searchAnime(query, page = 1) {
  const target =
    page > 1
      ? `${BASE_URL}/page/${page}/?s=${encodeURIComponent(query)}`
      : `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  const $ = cheerio.load(await get(target));
  const data = [];
  const seen = new Set();

  $('article.animepost, .animepost').each((_, el) => {
    const title = $(el).find('.title h2, h2').text().trim();
    const itemUrl = cleanUrl($(el).find('a').attr('href'));
    if (!title || !itemUrl || seen.has(itemUrl)) return;

    seen.add(itemUrl);
    data.push({
      title,
      slug: extractSlug(itemUrl),
      url: itemUrl,
      thumbnail: $(el).find('img').attr('src') || null,
      type: $(el).find('.type').text().trim() || null,
      score: $(el).find('.score').text().trim() || null,
      genres: $(el).find('.genres, .genresx').text().trim() || null
    });
  });

  return { source: target, query, page: Number(page), total: data.length, data };
}

async function getAnimeDetail(slugOrUrl) {
  const target = slugOrUrl.startsWith('http')
    ? slugOrUrl
    : `${BASE_URL}/anime/${slugOrUrl.replace(/^\/+|\/+$/g, '')}/`;
  const $ = cheerio.load(await get(target));
  const info = {};

  $('.spe span').each((_, el) => {
    const key = $(el).find('b').text().replace(/[:\s]+$/, '').toLowerCase();
    const val = $(el).text().replace($(el).find('b').text(), '').replace(/^[:\s]+/, '').trim();
    if (key && val) info[key] = val;
  });

  const genres = [];
  $('.genre-info a, .genxed a').each((_, el) => {
    const name = $(el).text().trim();
    const href = $(el).attr('href');
    if (name) genres.push({ name, slug: extractSlug(href), url: cleanUrl(href) });
  });

  const episodes = [];
  $('.lstepsiode ul li').each((_, el) => {
    const a = $(el).find('a').first();
    const epUrl = cleanUrl(a.attr('href'));
    const epTitle = a.text().trim();
    if (!epUrl) return;
    const match = epTitle.match(/Episode\s*(\d+(\.\d+)?)/i) || epUrl.match(/-episode-(\d+(\.\d+)?)/i);
    episodes.push({
      episode: match ? match[1] : null,
      title: epTitle,
      slug: extractSlug(epUrl),
      url: epUrl,
      date: $(el).find('.date').text().trim() || null
    });
  });

  return {
    title: $('h1.entry-title').text().trim(),
    slug: extractSlug(target),
    url: target,
    thumbnail: $('.thumb img').first().attr('src') || null,
    synopsis: $('.desc p, .entry-content-single').text().trim() || null,
    metadata: {
      japanese: info.japanese || null,
      english: info.english || null,
      status: info.status || null,
      type: info.type || null,
      source: info.source || null,
      duration: info.duration || null,
      totalEpisode: info['total episode'] || null,
      season: info.season || null,
      studio: info.studio || null,
      producers: info.producers || null,
      released: info.released || null
    },
    genres,
    batchUrl: cleanUrl($('.batchlink a').first().attr('href')),
    totalEpisodes: episodes.length,
    episodes
  };
}

async function getEpisodeDetail(slugOrUrl, resolveStreams = true) {
  const target = slugOrUrl.startsWith('http')
    ? slugOrUrl
    : `${BASE_URL}/${slugOrUrl.replace(/^\/+|\/+$/g, '')}/`;
  const $ = cheerio.load(await get(target));

  const streamingServers = [];
  const serverEls = $('#server ul li div.east_player_option');

  for (let i = 0; i < serverEls.length; i++) {
    const el = serverEls[i];
    const name = $(el).find('span').text().trim();
    const postId = $(el).attr('data-post');
    const nume = $(el).attr('data-nume');
    const available = !($(el).attr('style') || '').includes('not-allowed');

    if (!resolveStreams) {
      if (available && postId && nume) streamingServers.push({ name, postId, nume, embedUrl: null });
      continue;
    }

    if (available && postId && nume) {
      try {
        const raw = await post(`${BASE_URL}/wp-admin/admin-ajax.php`, {
          action: 'player_ajax', post: postId, nume, type: 'schtml'
        });
        const m = raw.match(/src=["']([^"']+)["']/i);
        if (m) streamingServers.push({ name, postId, nume, embedUrl: m[1] });
      } catch (_) { /* skip server bermasalah */ }
    }
  }

  const pickNav = (sel) => {
    const a = $(`.naveps ${sel} a`).first();
    if (!a.length || a.hasClass('nonex')) return null;
    return cleanUrl(a.attr('href'));
  };

  const downloads = [];
  $('.download-eps').each((_, sec) => {
    const format = $(sec).find('p').first().text().trim() || 'Download';
    const qualities = [];

    $(sec).find('ul li').each((_, li) => {
      const q = $(li).find('strong, b').first().text().trim();
      const links = [];
      $(li).find('span a').each((_, a) => {
        const server = $(a).text().trim();
        const href = cleanUrl($(a).attr('href'));
        if (server && href) links.push({ server, url: href });
      });
      if (q && links.length) qualities.push({ quality: q, links });
    });

    if (qualities.length) downloads.push({ format, qualities });
  });

  return {
    title: $('h1.entry-title').text().trim(),
    slug: extractSlug(target),
    url: target,
    navigation: {
      allEpisodesUrl: pickNav('.nvsc'),
      prevEpisodeUrl: pickNav('.nvs:not(.nvsc):not(.rght)'),
      nextEpisodeUrl: pickNav('.nvs.rght')
    },
    totalServers: streamingServers.length,
    streamingServers,
    downloads
  };
}

async function getSchedule(day = 'monday') {
  const days = {
    senin: 'monday', selasa: 'tuesday', rabu: 'wednesday', kamis: 'thursday',
    jumat: 'friday', jumaat: 'friday', sabtu: 'saturday', minggu: 'sunday'
  };
  const selectedDay = days[String(day).toLowerCase()] || String(day).toLowerCase();
  const raw = await get(`${BASE_URL}/wp-json/custom/v1/all-schedule?perpage=50&day=${selectedDay}`);

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Schedule endpoint returned invalid JSON'); }
  if (!Array.isArray(parsed)) parsed = [];

  const data = parsed.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    url: cleanUrl(item.url),
    thumbnail: item.featured_img_src || null,
    genre: item.genre || null,
    score: item.east_score || null,
    type: item.east_type || null,
    day: item.east_schedule || selectedDay,
    time: item.east_time || null,
    synopsis: item.content ? item.content.replace(/<[^>]+>/g, '').trim() : null
  }));

  return { day: selectedDay, total: data.length, data };
}

async function getGenres() {
  const $ = cheerio.load(await get(BASE_URL));
  const data = [];
  const seen = new Set();

  $('a[href*="/genre/"]').each((_, el) => {
    const name = $(el).text().trim();
    const href = $(el).attr('href');
    const slug = extractSlug(href);
    if (!name || !slug || seen.has(slug)) return;
    seen.add(slug);
    data.push({ name, slug, url: cleanUrl(href) });
  });

  return { total: data.length, data };
}

async function getByGenre(genreSlug, page = 1) {
  const clean = genreSlug.replace(/^\/+|\/+$/g, '').replace('genre/', '');
  const target = page > 1 ? `${BASE_URL}/genre/${clean}/page/${page}/` : `${BASE_URL}/genre/${clean}/`;
  const $ = cheerio.load(await get(target));
  const data = [];
  const seen = new Set();

  $('.animepost, article').each((_, el) => {
    const title = $(el).find('.title h2, h2').first().text().trim();
    const itemUrl = cleanUrl($(el).find('a').first().attr('href'));
    if (!title || !itemUrl || seen.has(itemUrl)) return;
    seen.add(itemUrl);
    data.push({
      title,
      slug: extractSlug(itemUrl),
      url: itemUrl,
      thumbnail: $(el).find('img').first().attr('src') || null,
      score: $(el).find('.score').text().trim() || null,
      type: $(el).find('.type').text().trim() || null
    });
  });

  return { genre: clean, page: Number(page), total: data.length, data };
}

/* -------------------------- MANIFEST ----------------------------- */
module.exports = {
  meta: {
    id: 'anime',
    name: 'Anime Streaming',
    description: 'Scraper anime: rilis terbaru, top 10, pencarian, detail seri, episode dengan server streaming & link download, jadwal rilis, dan genre.',
    baseUrl: BASE_URL,
    icon: 'clapperboard',
    tags: ['anime', 'streaming', 'subtitle-indonesia', 'download'],
    order: 10,
    stability: 'stable'
  },

  endpoints: [
    {
      name: 'Latest',
      method: 'GET',
      path: '/latest',
      group: 'Discovery',
      description: 'Daftar episode anime terbaru yang dirilis.',
      cache: 120,
      params: [{ name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman rilis terbaru.' }],
      responseShape: { total: 'number', data: '[{ title, slug, url, thumbnail, episode, postedBy, releasedOn }]' },
      handler: ({ query }) => getLatest(parseInt(query.page, 10) || 1)
    },
    {
      name: 'Top Anime',
      method: 'GET',
      path: '/top',
      group: 'Discovery',
      description: 'Top 10 anime berdasarkan popularitas di halaman utama.',
      cache: 600,
      params: [],
      handler: () => getTopAnime()
    },
    {
      name: 'Search',
      method: 'GET',
      path: '/search',
      group: 'Discovery',
      description: 'Cari anime berdasarkan judul.',
      cache: 120,
      params: [
        { name: 'q', in: 'query', type: 'string', required: true, example: 'naruto', description: 'Keyword pencarian.' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman hasil.' }
      ],
      handler: ({ query }) => searchAnime(query.q, parseInt(query.page, 10) || 1)
    },
    {
      name: 'Detail',
      method: 'GET',
      path: '/detail/:slug',
      group: 'Content',
      description: 'Informasi lengkap satu seri anime beserta seluruh daftar episode.',
      cache: 300,
      params: [{ name: 'slug', in: 'path', type: 'string', required: true, example: 'naruto-kecil', description: 'Slug seri anime.' }],
      handler: ({ params }) => getAnimeDetail(params.slug)
    },
    {
      name: 'Episode',
      method: 'GET',
      path: '/episode/:slug',
      group: 'Content',
      description: 'Detail episode: server streaming (embed URL), navigasi prev/next, dan link download per kualitas.',
      cache: 300,
      params: [
        { name: 'slug', in: 'path', type: 'string', required: true, example: 'mushoku-tensei-isekai-ittara-honki-dasu-season-3-episode-11', description: 'Slug episode.' },
        { name: 'resolve', in: 'query', type: 'boolean', required: false, default: 'true', example: 'true', enum: ['true', 'false'], description: 'Resolve embed URL tiap server (lebih lambat bila true).' }
      ],
      handler: ({ params, query }) => getEpisodeDetail(params.slug, String(query.resolve ?? 'true') !== 'false')
    },
    {
      name: 'Schedule',
      method: 'GET',
      path: '/schedule',
      group: 'Metadata',
      description: 'Jadwal rilis anime per hari. Mendukung nama hari Indonesia maupun Inggris.',
      cache: 900,
      params: [
        {
          name: 'day', in: 'query', type: 'string', required: false, default: 'monday', example: 'senin',
          enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
                 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'],
          description: 'Hari jadwal tayang.'
        }
      ],
      handler: ({ query }) => getSchedule(query.day || 'monday')
    },
    {
      name: 'Genres',
      method: 'GET',
      path: '/genres',
      group: 'Metadata',
      description: 'Daftar seluruh genre yang tersedia.',
      cache: 3600,
      params: [],
      handler: () => getGenres()
    },
    {
      name: 'By Genre',
      method: 'GET',
      path: '/genre/:slug',
      group: 'Metadata',
      description: 'Daftar anime berdasarkan genre tertentu dengan pagination.',
      cache: 300,
      params: [
        { name: 'slug', in: 'path', type: 'string', required: true, example: 'action', description: 'Slug genre.' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman hasil.' }
      ],
      handler: ({ params, query }) => getByGenre(params.slug, parseInt(query.page, 10) || 1)
    }
  ],

  actions: {
    getLatest, getTopAnime, searchAnime, getAnimeDetail,
    getEpisodeDetail, getSchedule, getGenres, getByGenre
  }
};