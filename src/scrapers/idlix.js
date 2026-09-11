'use strict';

const BASE_URL = 'https://z2.idlixku.com';
const API_BASE_URL = 'https://api.idlixku.com';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const jar = {};

async function idlixFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Origin': BASE_URL,
    'Referer': `${BASE_URL}/`,
    'Accept': 'application/json, text/plain, */*',
    ...options.headers
  };

  const cookieStr = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookieStr) headers['Cookie'] = cookieStr;

  const init = {
    method: options.method || 'GET',
    headers,
    signal: AbortSignal.timeout(options.timeout || 20000)
  };

  if (options.body) {
    if (typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    } else {
      init.body = options.body;
    }
  }

  const res = await fetch(url, init);

  const setCookies = res.headers.get('set-cookie');
  if (setCookies) {
    const rawList = Array.isArray(setCookies) ? setCookies : [setCookies];
    for (const c of rawList) {
      const parts = c.split(';')[0].split('=');
      if (parts[0] && parts[1]) jar[parts[0].trim()] = parts.slice(1).join('=');
    }
  }

  if (res.status === 429 && !options._retried) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
    await new Promise((r) => setTimeout(r, Math.max(retryAfter, 2) * 1000));
    return idlixFetch(endpoint, { ...options, _retried: true });
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatImageUrl(path, size = 'w500') {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

function cleanSlug(input) {
  if (!input) return '';
  let clean = String(input).trim();
  clean = clean.replace(/^https?:\/\/[^/]+/i, '');
  clean = clean.replace(/^\/(movie|series|shorts|watch)\//i, '');
  clean = clean.replace(/\/season\/.*$/i, '');
  clean = clean.replace(/\?.*$/i, '');
  clean = clean.replace(/^\/+|\/+$/g, '');
  return clean;
}

async function extractStream(type, contentId, episodeId = null) {
  try {
    const trackBody = {
      contentType: type === 'movie' ? 'movie' : 'tv_series',
      contentId,
      ...(episodeId ? { episodeId } : {})
    };
    await idlixFetch('/api/views/track', { method: 'POST', body: trackBody });

    const playInfoType = type === 'movie' ? 'movie' : 'episode';
    const playInfoId = type === 'movie' ? contentId : episodeId;
    const playInfo = await idlixFetch(`/api/watch/play-info/${playInfoType}/${playInfoId}`);

    if (!playInfo || !playInfo.gateToken) return null;

    const waitMs = Math.max(0, (playInfo.unlockAt - playInfo.serverNow) + 500);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 14000)));

    const claimData = await idlixFetch('/api/watch/session/claim', {
      method: 'POST',
      body: { gateToken: playInfo.gateToken }
    });

    if (claimData && claimData.redeemUrl && claimData.claim) {
      const redeemRes = await idlixFetch(claimData.redeemUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ claim: claimData.claim })
      });

      if (redeemRes && redeemRes.url) {
        return {
          streamUrl: redeemRes.url,
          videoId: redeemRes.videoId || null,
          maxHeight: claimData.maxHeight || null,
          subtitles: (redeemRes.subtitles || []).map((s) => ({
            lang: s.lang,
            label: s.label,
            url: s.path
          }))
        };
      }
    }
  } catch (_) {}
  return null;
}

function mapMediaItem(item) {
  if (!item) return null;

  if (item.contentType === 'episode') {
    const epNum = item.episodeNumber || 1;
    const seasonNum = item.season?.seasonNumber || 1;
    const seriesTitle = item.series?.title || 'Series';
    const epTitle = item.name ? `: ${item.name}` : '';
    const seriesSlug = item.series?.slug || '';

    return {
      id: item.id || null,
      title: `${seriesTitle} S${seasonNum}E${epNum}${epTitle}`,
      originalTitle: item.name || '',
      type: 'episode',
      slug: seriesSlug,
      overview: item.overview || null,
      rating: item.voteAverage ? parseFloat(item.voteAverage) : null,
      releaseDate: item.airDate || item.series?.firstAirDate || null,
      year: item.airDate ? parseInt(String(item.airDate).substring(0, 4), 10) : null,
      quality: item.quality || null,
      views: item.viewCount !== undefined ? item.viewCount : null,
      poster: formatImageUrl(item.stillPath || item.series?.posterPath, 'w500'),
      stillPoster: formatImageUrl(item.stillPath, 'w500'),
      url: `${BASE_URL}/series/${seriesSlug}/season/${seasonNum}/episode/${epNum}`
    };
  }

  const dataItem = item.content || item;
  const isSeries = dataItem.contentType === 'tv_series' || dataItem.contentType === 'series' || !!dataItem.numberOfSeasons || !!dataItem.firstAirDate;
  const type = isSeries ? 'series' : 'movie';
  const slug = dataItem.slug || cleanSlug(dataItem.title);
  const releaseDate = dataItem.releaseDate || dataItem.firstAirDate || null;
  const year = releaseDate ? parseInt(String(releaseDate).substring(0, 4), 10) : null;

  return {
    id: dataItem.id || null,
    title: dataItem.title || dataItem.name || '',
    originalTitle: dataItem.originalTitle || dataItem.title || '',
    type,
    slug,
    overview: dataItem.overview || null,
    rating: dataItem.voteAverage ? parseFloat(dataItem.voteAverage) : null,
    releaseDate,
    year,
    quality: dataItem.quality || null,
    country: dataItem.country || null,
    language: dataItem.originalLanguage || null,
    views: dataItem.viewCount !== undefined ? dataItem.viewCount : null,
    genres: (dataItem.genres || []).map((g) => (typeof g === 'object' ? g.name : g)).filter(Boolean),
    poster: formatImageUrl(dataItem.posterPath, 'w500'),
    backdrop: formatImageUrl(dataItem.backdropPath, 'original'),
    url: `${BASE_URL}/${type}/${slug}`
  };
}

async function getHome() {
  const res = await idlixFetch('/api/homepage');
  const allSections = [...(res.above || []), ...(res.below || [])];
  const sections = {};

  for (const section of allSections) {
    const name = section.title && section.title.trim() ? section.title.trim() : (section.slug || 'Trending');
    const items = (section.data || []).map(mapMediaItem).filter(Boolean);
    if (items.length > 0) {
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      sections[key] = { title: name, total: items.length, items };
    }
  }

  return { source: BASE_URL, totalSections: Object.keys(sections).length, sections };
}

async function searchContent(query) {
  const res = await idlixFetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
  const results = (res.results || []).map(mapMediaItem).filter(Boolean);
  return { query: query.trim(), total: results.length, data: results };
}

async function getDetail(targetUrl, targetSeason = null, targetEpisode = null) {
  const raw = targetUrl.trim();
  const episodeUrlMatch = raw.match(/\/series\/([^/]+)\/season\/(\d+)\/episode\/(\d+)/i);
  let requestedSeason = targetSeason ? parseInt(targetSeason, 10) : null;
  let requestedEpisode = targetEpisode ? parseInt(targetEpisode, 10) : null;
  let slug = '';

  if (episodeUrlMatch) {
    slug = episodeUrlMatch[1];
    requestedSeason = parseInt(episodeUrlMatch[2], 10);
    requestedEpisode = parseInt(episodeUrlMatch[3], 10);
  } else {
    slug = cleanSlug(raw);
  }

  if (requestedEpisode !== null && !isNaN(requestedEpisode)) {
    const seriesData = await idlixFetch(`/api/series/${slug}`);
    const seasonNum = requestedSeason || 1;
    const epRes = await idlixFetch(`/api/series/${slug}/season/${seasonNum}`);
    const episodes = epRes.season?.episodes || [];
    const ep = episodes.find((e) => e.episodeNumber === requestedEpisode) || episodes[0];

    if (!ep) throw new Error(`Episode ${requestedEpisode} season ${seasonNum} tidak ditemukan`);

    let directStream = null;
    if (ep.hasVideo && ep.id) {
      directStream = await extractStream('tv_series', seriesData.id, ep.id);
    }

    return {
      type: 'episode',
      seriesTitle: seriesData.title || '',
      seriesSlug: slug,
      seasonNumber: seasonNum,
      episodeNumber: ep.episodeNumber,
      title: ep.name || `Episode ${ep.episodeNumber}`,
      overview: ep.overview || null,
      airDate: ep.airDate || null,
      runtimeMinutes: ep.runtime || null,
      stillPoster: formatImageUrl(ep.stillPath, 'w500'),
      streamUrl: directStream ? directStream.streamUrl : `${BASE_URL}/series/${slug}/season/${seasonNum}/episode/${ep.episodeNumber}`,
      subtitles: directStream ? directStream.subtitles : [],
      streamData: directStream || null,
      hasVideo: Boolean(ep.hasVideo)
    };
  }

  let movieData = null;
  let seriesData = null;

  if (raw.includes('/movie/')) {
    try { movieData = await idlixFetch(`/api/movies/${slug}`); } catch (_) {}
  } else if (raw.includes('/series/')) {
    try { seriesData = await idlixFetch(`/api/series/${slug}`); } catch (_) {}
  } else {
    try {
      movieData = await idlixFetch(`/api/movies/${slug}`);
    } catch (_) {
      try { seriesData = await idlixFetch(`/api/series/${slug}`); } catch (err) {
        throw new Error(`Konten tidak ditemukan untuk slug "${slug}"`);
      }
    }
  }

  if (movieData) {
    const m = movieData;
    let directStream = null;
    if (m.hasVideo && m.id) directStream = await extractStream('movie', m.id);

    return {
      type: 'movie',
      title: m.title || '',
      originalTitle: m.originalTitle || m.title || '',
      slug: m.slug || slug,
      tagline: m.tagline || null,
      overview: m.overview || null,
      releaseDate: m.releaseDate || null,
      year: m.releaseDate ? parseInt(String(m.releaseDate).substring(0, 4), 10) : null,
      runtimeMinutes: m.runtime || null,
      quality: m.quality || null,
      rating: m.voteAverage ? parseFloat(m.voteAverage) : null,
      views: m.viewCount || 0,
      country: m.country || null,
      language: m.originalLanguage || null,
      genres: (m.genres || []).map((g) => (typeof g === 'object' ? g.name : g)).filter(Boolean),
      director: m.director || null,
      productionCompanies: (m.productionCompanies || []).map((p) => p.name).filter(Boolean),
      cast: (m.cast || []).map((c) => ({
        name: c.name,
        character: c.character || null,
        photo: formatImageUrl(c.profilePath, 'w185')
      })),
      poster: formatImageUrl(m.posterPath, 'w500'),
      backdrop: formatImageUrl(m.backdropPath, 'original'),
      url: `${BASE_URL}/movie/${slug}`,
      streamUrl: directStream ? directStream.streamUrl : `${BASE_URL}/movie/${slug}`,
      subtitles: directStream ? directStream.subtitles : [],
      streamData: directStream || null,
      trailerUrl: m.trailerUrl || null,
      hasVideo: Boolean(m.hasVideo)
    };
  }

  if (seriesData) {
    const s = seriesData;
    const seasons = [];
    let firstEpisodeStream = null;

    for (const sea of (s.seasons || [])) {
      const seasonNum = sea.seasonNumber || 1;
      let episodes = [];

      try {
        const epRes = await idlixFetch(`/api/series/${slug}/season/${seasonNum}`);
        if (epRes.season && Array.isArray(epRes.season.episodes)) {
          episodes = epRes.season.episodes.map((e) => ({
            id: e.id,
            episodeNumber: e.episodeNumber,
            title: e.name || `Episode ${e.episodeNumber}`,
            overview: e.overview || null,
            airDate: e.airDate || null,
            stillPoster: formatImageUrl(e.stillPath, 'w500'),
            url: `${BASE_URL}/series/${slug}/season/${seasonNum}/episode/${e.episodeNumber}`,
            hasVideo: Boolean(e.hasVideo)
          }));
        }
      } catch (_) {}

      if (seasonNum === 1 && episodes.length > 0 && episodes[0].hasVideo && !firstEpisodeStream) {
        firstEpisodeStream = await extractStream('tv_series', s.id, episodes[0].id);
      }

      seasons.push({
        id: sea.id || null,
        seasonNumber: seasonNum,
        name: sea.name || `Season ${seasonNum}`,
        poster: formatImageUrl(sea.posterPath, 'w500'),
        episodeCount: sea.episodeCount || episodes.length,
        episodes
      });
    }

    return {
      type: 'series',
      title: s.title || '',
      originalTitle: s.originalTitle || s.title || '',
      slug: s.slug || slug,
      tagline: s.tagline || null,
      overview: s.overview || null,
      firstAirDate: s.firstAirDate || null,
      year: s.firstAirDate ? parseInt(String(s.firstAirDate).substring(0, 4), 10) : null,
      numberOfSeasons: s.numberOfSeasons || seasons.length,
      numberOfEpisodes: s.numberOfEpisodes || 0,
      rating: s.voteAverage ? parseFloat(s.voteAverage) : null,
      views: s.viewCount || 0,
      genres: (s.genres || []).map((g) => (typeof g === 'object' ? g.name : g)).filter(Boolean),
      cast: (s.cast || []).map((c) => ({
        name: c.name,
        character: c.character || null,
        photo: formatImageUrl(c.profilePath, 'w185')
      })),
      poster: formatImageUrl(s.posterPath, 'w500'),
      backdrop: formatImageUrl(s.backdropPath, 'original'),
      url: `${BASE_URL}/series/${slug}`,
      streamUrl: firstEpisodeStream ? firstEpisodeStream.streamUrl : `${BASE_URL}/series/${slug}`,
      subtitles: firstEpisodeStream ? firstEpisodeStream.subtitles : [],
      streamData: firstEpisodeStream || null,
      trailerUrl: s.trailerUrl || null,
      seasons
    };
  }

  throw new Error(`Data tidak ditemukan untuk "${targetUrl}"`);
}

async function getShorts() {
  const res = await idlixFetch('/api/search?q=shorts');
  const items = (res.results || []).map((item) => {
    const isSeries = item.contentType === 'tv_series' || item.contentType === 'series' || !!item.numberOfSeasons;
    const type = isSeries ? 'series' : 'movie';
    const slug = item.slug;

    return {
      id: item.id,
      title: item.title || '',
      type,
      slug,
      overview: item.overview || null,
      releaseDate: item.releaseDate || item.firstAirDate || null,
      rating: item.voteAverage ? parseFloat(item.voteAverage) : null,
      poster: formatImageUrl(item.posterPath, 'w500'),
      shortsUrl: `${BASE_URL}/shorts/${slug}`,
      url: `${BASE_URL}/${type}/${slug}`
    };
  });

  return { category: 'Shorts & Short Drama', total: items.length, data: items };
}

module.exports = {
  meta: {
    id: 'idlix',
    name: 'IDLIX Streaming',
    description: 'Scraper film bioskop, series TV, drama pendek & shorts dari IDLIX dengan resolusi direct HLS m3u8 stream link dan multi-bahasa subtitle.',
    baseUrl: BASE_URL,
    icon: 'video',
    tags: ['film', 'series', 'shorts', 'streaming', 'idlix', 'm3u8'],
    order: 35,
    stability: 'stable'
  },

  endpoints: [
    {
      name: 'Homepage', method: 'GET', path: '/home', group: 'Discovery',
      description: 'Daftar kurasi film & series dari beranda IDLIX (Trending, Popular, Latest update).',
      cache: 180, params: [],
      handler: () => getHome()
    },
    {
      name: 'Search', method: 'GET', path: '/search', group: 'Discovery',
      description: 'Pencarian film, serial, dan drama pendek.',
      cache: 120,
      params: [{ name: 'q', in: 'query', type: 'string', required: true, example: 'avatar', description: 'Kata kunci pencarian.' }],
      handler: ({ query }) => searchContent(query.q)
    },
    {
      name: 'Detail & Stream', method: 'GET', path: '/detail', group: 'Content',
      description: 'Detail komprehensif film atau series beserta direct streaming URL (HLS m3u8) & subtitle.',
      cache: 300,
      params: [
        { name: 'url', in: 'query', type: 'string', required: true, example: 'libang-libu-2026', description: 'Slug atau URL target (contoh: avatar-the-way-of-water-2022 atau libang-libu-2026).' },
        { name: 'season', in: 'query', type: 'number', required: false, default: null, example: 1, description: 'Nomor season (khusus serial).' },
        { name: 'episode', in: 'query', type: 'number', required: false, default: null, example: 1, description: 'Nomor episode (khusus serial).' }
      ],
      handler: ({ query }) => getDetail(query.url, query.season, query.episode)
    },
    {
      name: 'Shorts', method: 'GET', path: '/shorts', group: 'Discovery',
      description: 'Koleksi video shorts & short drama dari IDLIX.',
      cache: 300, params: [],
      handler: () => getShorts()
    }
  ],

  actions: { getHome, searchContent, getDetail, getShorts }
};