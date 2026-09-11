'use strict';

const { get } = require('../core/http');

const BASE = 'https://webdracin.com';
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

/* ---------------------------- helpers ---------------------------- */
function rsc(html) {
  const out = [];
  const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let m;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse('"' + m[1] + '"')); } catch { out.push(m[1]); }
  }
  return out.join('\n');
}

const abs = (u) =>
  u?.startsWith('http') ? u.replace(/&amp;/g, '&') : u ? BASE + u.replace(/&amp;/g, '&') : null;

const realCover = (u) => {
  try {
    const x = new URL(abs(u));
    return x.pathname === '/api/cover' ? decodeURIComponent(x.searchParams.get('url')) : abs(u);
  } catch {
    return abs(u);
  }
};

function parseCards(html, limit = Infinity) {
  const cards = [...html.matchAll(/<a[^>]+href="(\/drama\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Map();
  for (const [, href, inner] of cards) {
    if (seen.has(href)) continue;
    const txt = (s) => (inner.match(s)?.[1] || '').replace(/<[^>]+>/g, '').trim() || null;
    seen.set(href, {
      slug: href.split('/drama/')[1],
      url: abs(href),
      title: txt(/line-clamp-2[^>]*>([^<]+)</) || txt(/font-semibold[^>]*>([^<]+)</),
      episodes: +(inner.match(/EP[\s\S]*?(\d+)/)?.[1] || 0) || null,
      platform: txt(/truncate[^>]*>([^<]+)</),
      cover: abs(inner.match(/src="([^"]+)"/)?.[1]),
      cover_real: realCover(inner.match(/src="([^"]+)"/)?.[1])
    });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/* ---------------------------- actions ---------------------------- */
async function getPlatforms() {
  const sm = await get(BASE + '/sitemap.xml');
  const slugs = [...sm.matchAll(/<loc>https:\/\/webdracin\.com\/([a-z0-9]+)gratis<\/loc>/g)].map((m) => m[1]);
  return slugs.length ? slugs : [
    'melolo', 'dramabox', 'cashdrama', 'shotshort', 'dramabite', 'dramapops', 'netshort',
    'playlet', 'flareflow', 'reelshort', 'dramadash', 'dramamax', 'dramawave', 'vigloo',
    'velolo', 'cubetv', 'minutedrama', 'rapidtv', 'dramanova', 'freereels', 'flextv',
    'dramarush', 'shortbox', 'radreels', 'flickreels'
  ];
}

async function listDramas(platform = null, limit = 50) {
  const url = platform ? `${BASE}/${platform.toLowerCase().replace(/gratis$/, '')}gratis` : BASE + '/';
  const html = await get(url);
  const data = parseCards(html, limit);
  return { source: url, platform: platform || 'home', total: data.length, data };
}

async function allPlatforms(limitPerPlatform = 10) {
  const plats = await getPlatforms();
  const platforms = {};

  await Promise.all(plats.map(async (p) => {
    try {
      const r = await listDramas(p, limitPerPlatform);
      platforms[p] = { total: r.total, data: r.data };
    } catch {
      platforms[p] = { total: 0, data: [] };
    }
  }));

  return { totalPlatforms: plats.length, platforms };
}

async function searchDramas(query, limit = 50) {
  const html = await get(`${BASE}/search?q=${encodeURIComponent(query)}`);
  const data = parseCards(html, limit);
  return { query, total: data.length, data };
}

async function dramaDetail(slug) {
  const url = `${BASE}/drama/${slug}`;
  const html = await get(url);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .find((j) => j?.['@graph']?.some((n) => n['@type'] === 'TVSeries'));
  const series = ld?.['@graph']?.find((n) => n['@type'] === 'TVSeries') ?? {};
  const eps = [...new Set([...html.matchAll(/\/watch\/[^"?]+\?ep=(\d+)/g)].map((m) => +m[1]))].sort((a, b) => a - b);

  return {
    slug,
    url,
    title: series.name ?? html.match(/<title>([^<]+)/)?.[1] ?? null,
    synopsis: series.description ?? null,
    cover: abs(html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]),
    episodeCount: series.numberOfEpisodes ?? (eps.at(-1) ?? null),
    episodesListed: eps,
    watchUrl: abs(html.match(/href="(\/watch\/[^"]+)"/)?.[1])
  };
}

async function watchDetail(slug) {
  const html = await get(`${BASE}/watch/${slug}?ep=1`);
  const payload = rsc(html);
  const i = payload.indexOf('"drama":{');
  if (i < 0) throw new Error('drama object not found in RSC');
  let s = payload.slice(payload.indexOf('{', i + 8));
  let d = 0, instr = false, esc = false;

  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (instr) {
      esc = c === '\\' && !esc;
      if (c === '"' && !esc) instr = false;
      if (c !== '\\') esc = false;
      continue;
    }
    if (c === '"') instr = true;
    else if (c === '{') d++;
    else if (c === '}') {
      d--;
      if (!d) { s = s.slice(0, k + 1); break; }
    }
  }

  const raw = JSON.parse(s.replace(/"\$undefined"/g, 'null'));
  const eps = raw.episodes.map((e) => ({ ...e, poster_real: realCover(e.poster) }));

  return {
    slug,
    dramaId: raw.id,
    title: raw.title,
    synopsis: raw.synopsis,
    platform: raw.platform ?? raw.platformLabel,
    episodeCount: raw.episodeCount ?? eps.length,
    cover: abs(raw.cover),
    coverReal: realCover(raw.cover),
    playable: raw.playable,
    episodes: eps
  };
}

async function episodeDetail(dramaId, ep, eid) {
  const res = await fetch(`${BASE}/api/episode?id=${encodeURIComponent(dramaId)}&ep=${ep}&eid=${eid}`, { headers: UA });
  if (!res.ok) throw new Error(`api/episode HTTP ${res.status}`);
  const json = await res.json();
  return { dramaId, episode: Number(ep), episodeId: eid, ...json };
}

async function fullDetail(slug, maxSampleEpisodes = 3) {
  const watchData = await watchDetail(slug);
  const withVideo = [];

  for (const ep of watchData.episodes.slice(0, maxSampleEpisodes)) {
    try {
      const video = await episodeDetail(watchData.dramaId, ep.number, ep.id);
      withVideo.push({ ...ep, ...video });
    } catch {
      withVideo.push({ ...ep, video: null, error: 'Failed to fetch video URL' });
    }
  }

  return { ...watchData, episodesSample: withVideo };
}

/* ---------------------------- MANIFEST ---------------------------- */
module.exports = {
  meta: {
    id: 'dracin',
    name: 'Drama Pendek (WebDracin)',
    description: 'Scraper drama pendek / short drama: daftar platform, daftar drama per platform, pencarian, detail drama, detail episode dengan URL video, dan full detail (dengan sample video).',
    baseUrl: BASE,
    icon: 'clapperboard',
    tags: ['drama', 'short-drama', 'streaming', 'webdracin'],
    order: 30,
    stability: 'beta'
  },

  endpoints: [
    {
      name: 'Platforms',
      method: 'GET',
      path: '/platforms',
      group: 'Discovery',
      description: 'Daftar semua platform drama pendek yang tersedia.',
      cache: 3600,
      params: [],
      responseShape: { data: '[string]' },
      handler: () => getPlatforms()
    },
    {
      name: 'List',
      method: 'GET',
      path: '/list',
      group: 'Discovery',
      description: 'Daftar drama terbaru dari halaman utama atau platform tertentu.',
      cache: 180,
      params: [
        { name: 'platform', in: 'query', type: 'string', required: false, default: null, example: 'dramabox', description: 'Nama platform (tanpa akhiran "gratis"). Kosongkan untuk halaman utama.' },
        { name: 'limit', in: 'query', type: 'number', required: false, default: 50, example: 20, description: 'Jumlah maksimal hasil.' }
      ],
      handler: ({ query }) => listDramas(query.platform || null, parseInt(query.limit, 10) || 50)
    },
    {
      name: 'All Platforms',
      method: 'GET',
      path: '/all',
      group: 'Discovery',
      description: 'Scrape semua platform sekaligus (paralel).',
      cache: 600,
      params: [
        { name: 'limitPerPlatform', in: 'query', type: 'number', required: false, default: 10, example: 10, description: 'Jumlah maksimal drama per platform.' }
      ],
      handler: ({ query }) => allPlatforms(parseInt(query.limitPerPlatform, 10) || 10)
    },
    {
      name: 'Search',
      method: 'GET',
      path: '/search',
      group: 'Discovery',
      description: 'Cari drama berdasarkan judul.',
      cache: 120,
      params: [
        { name: 'q', in: 'query', type: 'string', required: true, example: 'drama cinta', description: 'Kata kunci pencarian.' },
        { name: 'limit', in: 'query', type: 'number', required: false, default: 50, example: 30, description: 'Jumlah maksimal hasil.' }
      ],
      handler: ({ query }) => searchDramas(query.q, parseInt(query.limit, 10) || 50)
    },
    {
      name: 'Detail',
      method: 'GET',
      path: '/detail/:slug',
      group: 'Content',
      description: 'Detail drama dari halaman statis (title, sinopsis, cover, jumlah episode, watch URL).',
      cache: 300,
      params: [
        { name: 'slug', in: 'path', type: 'string', required: true, example: 'drama-cinta', description: 'Slug drama.' }
      ],
      handler: ({ params }) => dramaDetail(params.slug)
    },
    {
      name: 'Watch Detail',
      method: 'GET',
      path: '/watch/:slug',
      group: 'Content',
      description: 'Detail drama lengkap termasuk daftar episode dengan metadata dari RSC payload.',
      cache: 300,
      params: [
        { name: 'slug', in: 'path', type: 'string', required: true, example: 'drama-cinta', description: 'Slug drama dari URL /watch/.' }
      ],
      handler: ({ params }) => watchDetail(params.slug)
    },
    {
      name: 'Episode',
      method: 'GET',
      path: '/episode',
      group: 'Content',
      description: 'Ambil URL streaming untuk satu episode.',
      cache: 600,
      params: [
        { name: 'dramaId', in: 'query', type: 'string', required: true, example: 'abc123', description: 'ID drama dari watch detail.' },
        { name: 'ep', in: 'query', type: 'number', required: true, example: 1, description: 'Nomor episode.' },
        { name: 'eid', in: 'query', type: 'string', required: true, example: 'ep123', description: 'ID episode dari watch detail.' }
      ],
      handler: ({ query }) => episodeDetail(query.dramaId, query.ep, query.eid)
    },
    {
      name: 'Full Detail',
      method: 'GET',
      path: '/full/:slug',
      group: 'Content',
      description: 'Detail lengkap + sample video URL untuk beberapa episode pertama.',
      cache: 600,
      params: [
        { name: 'slug', in: 'path', type: 'string', required: true, example: 'drama-cinta', description: 'Slug drama.' },
        { name: 'eps', in: 'query', type: 'number', required: false, default: 3, example: 3, description: 'Jumlah episode sample yang diambil videonya.' }
      ],
      handler: ({ params, query }) => fullDetail(params.slug, parseInt(query.eps, 10) || 3)
    }
  ],

  actions: { getPlatforms, listDramas, allPlatforms, searchDramas, dramaDetail, watchDetail, episodeDetail, fullDetail }
};