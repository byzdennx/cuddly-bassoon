'use strict';

const TMDB_API_KEY = '82524e2faef91706a2d52d52496130ac';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

const SERVERS = {
  vidsrc: { movie: 'https://vidsrc.me/embed/movie?tmdb={id}', tv: 'https://vidsrc.me/embed/tv?tmdb={id}&season={s}&episode={e}' },
  embedsu: { movie: 'https://embed.su/embed/movie/{id}', tv: 'https://embed.su/embed/tv/{id}/{s}/{e}' },
  vidsrcpro: { movie: 'https://vidsrc.pro/embed/movie/{id}', tv: 'https://vidsrc.pro/embed/tv/{id}/{s}/{e}' }
};

/* ---------------------------- helpers ---------------------------- */
const tmdb = async (endpoint, params = {}) => {
  const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_API_KEY}&language=id-ID`;
  const qs = new URLSearchParams(params).toString();
  const full = qs ? `${url}&${qs}` : url;

  const res = await fetch(full, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  return res.json();
};

const img = (p) => p ? `${TMDB_IMG}${p}` : null;

/* ---------------------------- actions ---------------------------- */
async function search(query, page = 1) {
  const data = await tmdb('/search/multi', { query, page });
  if (!data?.results) return { query, page: Number(page), total: 0, data: [] };

  const results = data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => ({
      id: r.id,
      title: r.title || r.name,
      year: (r.release_date || r.first_air_date || '').split('-')[0] || 'N/A',
      type: r.media_type,
      rating: r.vote_average ? r.vote_average.toFixed(1) : 'N/A',
      poster: img(r.poster_path),
      backdrop: img(r.backdrop_path),
      overview: r.overview || '',
      popularity: r.popularity ? r.popularity.toFixed(2) : null
    }));

  return { query, page: Number(page), total: results.length, data: results };
}

async function detail(id, type = 'movie') {
  const [data, creditsData] = await Promise.all([
    tmdb(`/${type}/${id}`),
    tmdb(`/${type}/${id}/credits`)
  ]);

  if (!data) throw new Error('Gagal mengambil detail dari TMDB');

  const title = data.title || data.name;
  const releaseDate = data.release_date || data.first_air_date;
  const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';
  const runtime = type === 'movie' ? data.runtime : data.episode_run_time?.[0];
  const genres = data.genres?.map((g) => g.name) || [];

  const cast = (creditsData?.cast || [])
    .slice(0, 10)
    .map((a) => ({ name: a.name, character: a.character, photo: img(a.profile_path) }));

  const crew = (creditsData?.crew || [])
    .filter((c) => ['Director', 'Writer', 'Producer', 'Creator'].includes(c.job))
    .slice(0, 8)
    .map((c) => ({ name: c.name, job: c.job }));

  const altPosters = (data.backdrops || []).slice(0, 8).map((b) => img(b.file_path));

  const servers = {};
  for (const [name, tmpl] of Object.entries(SERVERS)) {
    servers[name] = type === 'movie'
      ? tmpl.movie.replace('{id}', String(id))
      : tmpl.tv.replace('{id}', String(id)).replace('{s}', '1').replace('{e}', '1');
  }

  let seasonsDetail = null;
  if (type === 'tv' && data.seasons) {
    seasonsDetail = data.seasons.map((s) => ({
      seasonNumber: s.season_number,
      episodeCount: s.episode_count,
      poster: img(s.poster_path),
      overview: s.overview || null
    }));
  }

  return {
    id, title, type, year,
    rating: data.vote_average ? data.vote_average.toFixed(1) : 'N/A',
    runtime: runtime ? `${runtime} min` : 'N/A',
    genres, overview: data.overview || 'Sinopsis tidak tersedia.',
    poster: img(data.poster_path),
    backdrop: img(data.backdrop_path),
    altPosters,
    tagline: data.tagline || null,
    status: data.status || null,
    releaseDate,
    runtimeRaw: runtime || null,
    budget: data.budget ? `$${data.budget.toLocaleString()}` : null,
    revenue: data.revenue ? `$${data.revenue.toLocaleString()}` : null,
    popularity: data.popularity ? data.popularity.toFixed(2) : null,
    voteCount: data.vote_count || null,
    seasons: type === 'tv' ? data.number_of_seasons : null,
    episodes: type === 'tv' ? data.number_of_episodes : null,
    episodeRunTime: type === 'tv' ? (data.episode_run_time || []).map(String) : null,
    cast, crew,
    production: (data.production_companies || []).slice(0, 6).map((p) => ({
      name: p.name, logo: img(p.logo_path)
    })),
    seasonsDetail,
    servers,
    streamUrl: servers.vidsrc,
    homepage: data.homepage || null,
    imdbId: data.imdb_id || null,
    originalLanguage: data.original_language || null,
    originalTitle: data.original_title || data.original_name || null
  };
}

async function streamingUrl(id, type = 'movie', server = 'vidsrc', season = 1, episode = 1) {
  const tmpl = SERVERS[server];
  if (!tmpl) throw new Error(`Server "${server}" tidak dikenal. Pilihan: ${Object.keys(SERVERS).join(', ')}`);
  if (type === 'movie') return tmpl.movie.replace('{id}', String(id));
  return tmpl.tv.replace('{id}', String(id)).replace('{s}', String(season)).replace('{e}', String(episode));
}

async function trending(timeWindow = 'week') {
  const data = await tmdb(`/trending/all/${timeWindow}`);
  if (!data?.results) return { timeWindow, total: 0, data: [] };

  const results = data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 20)
    .map((r) => ({
      id: r.id, title: r.title || r.name, type: r.media_type,
      rating: r.vote_average ? r.vote_average.toFixed(1) : 'N/A',
      poster: img(r.poster_path), backdrop: img(r.backdrop_path),
      overview: r.overview || '', popularity: r.popularity ? r.popularity.toFixed(2) : null,
      voteCount: r.vote_count || null
    }));

  return { timeWindow, total: results.length, data: results };
}

async function trendingMovies(timeWindow = 'week') {
  const data = await tmdb(`/trending/movie/${timeWindow}`);
  if (!data?.results) return { timeWindow, total: 0, data: [] };
  return {
    timeWindow, total: data.results.length,
    data: data.results.map((r) => ({
      id: r.id, title: r.title,
      rating: r.vote_average ? r.vote_average.toFixed(1) : 'N/A',
      poster: img(r.poster_path), overview: r.overview || '',
      popularity: r.popularity ? r.popularity.toFixed(2) : null
    }))
  };
}

async function trendingTv(timeWindow = 'week') {
  const data = await tmdb(`/trending/tv/${timeWindow}`);
  if (!data?.results) return { timeWindow, total: 0, data: [] };
  return {
    timeWindow, total: data.results.length,
    data: data.results.map((r) => ({
      id: r.id, title: r.name,
      rating: r.vote_average ? r.vote_average.toFixed(1) : 'N/A',
      poster: img(r.poster_path), overview: r.overview || '',
      popularity: r.popularity ? r.popularity.toFixed(2) : null
    }))
  };
}

async function recommendations(id, type = 'movie', limit = 12) {
  const data = await tmdb(`/${type}/${id}/recommendations`);
  if (!data?.results) return { id, type, total: 0, data: [] };

  const results = data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, limit)
    .map((r) => ({
      id: r.id, title: r.title || r.name, type: r.media_type,
      rating: r.vote_average ? r.vote_average.toFixed(1) : 'N/A',
      poster: img(r.poster_path), backdrop: img(r.backdrop_path),
      overview: r.overview || '', popularity: r.popularity ? r.popularity.toFixed(2) : null,
      voteCount: r.vote_count || null
    }));

  return { id, type, total: results.length, data: results };
}

async function topRated(limit = 20) {
  const data = await tmdb('/movie/top_rated');
  if (!data?.results) return { total: 0, data: [] };
  return {
    total: data.results.length,
    data: data.results.slice(0, limit).map((r) => ({
      id: r.id, title: r.title,
      rating: r.vote_average ? r.vote_average.toFixed(1) : 'N/A',
      poster: img(r.poster_path), overview: r.overview || '',
      releaseDate: r.release_date || null,
      popularity: r.popularity ? r.popularity.toFixed(2) : null
    }))
  };
}

async function popular(limit = 20) {
  const data = await tmdb('/movie/popular');
  if (!data?.results) return { total: 0, data: [] };
  return {
    total: data.results.length,
    data: data.results.slice(0, limit).map((r) => ({
      id: r.id, title: r.title,
      rating: r.vote_average ? r.vote_average.toFixed(1) : 'N/A',
      poster: img(r.poster_path), overview: r.overview || '',
      releaseDate: r.release_date || null,
      popularity: r.popularity ? r.popularity.toFixed(2) : null
    }))
  };
}

async function discover(type = 'movie', {
  withGenres = null, sortBy = 'popularity.desc', year = null,
  ratingGte = null, page = 1
} = {}) {
  const params = { language: 'id-ID', sort_by: sortBy, page: Number(page) };
  if (withGenres) params.with_genres = withGenres;
  if (year) params.year = year;
  if (ratingGte) params['vote_average.gte'] = ratingGte;

  const data = await tmdb(`/${type === 'tv' ? 'discover/tv' : 'discover/movie'}`, params);
  if (!data?.results) return { type, total: 0, data: [] };

  return {
    type, page: Number(page),
    totalPages: data.total_pages || null,
    totalResults: data.total_results || data.results.length,
    total: data.results.length,
    data: data.results.slice(0, 50).map((r) => ({
      id: r.id, title: r.title || r.name, type: r.media_type,
      rating: r.vote_average ? r.vote_average.toFixed(1) : 'N/A',
      poster: img(r.poster_path), backdrop: img(r.backdrop_path),
      overview: r.overview || '',
      releaseDate: r.release_date || r.first_air_date || null,
      popularity: r.popularity ? r.popularity.toFixed(2) : null,
      voteCount: r.vote_count || null
    }))
  };
}

async function getGenres() {
  const [movieGenres, tvGenres] = await Promise.all([
    tmdb('/genre/movie/list'),
    tmdb('/genre/tv/list')
  ]);

  const genres = [];
  if (movieGenres?.genres) movieGenres.genres.forEach((g) => genres.push({ id: g.id, name: g.name, type: 'movie' }));
  if (tvGenres?.genres) tvGenres.genres.forEach((g) => genres.push({ id: g.id, name: g.name, type: 'tv' }));

  return { total: genres.length, data: genres };
}

async function episodeDetail(id, season, episode) {
  const data = await tmdb(`/tv/${id}/season/${season}`);
  if (!data) throw new Error('Gagal mengambil daftar episode');

  const targetEp = data.episodes?.find((e) => e.episode_number === Number(episode));
  if (!targetEp) throw new Error(`Episode ${episode} season ${season} tidak ditemukan`);

  return {
    tvId: id, season: Number(season), episode: Number(episode),
    title: targetEp.name, overview: targetEp.overview || null,
    airDate: targetEp.air_date || null, runtime: targetEp.runtime || null,
    still: img(targetEp.still_path),
    streamingUrl: SERVERS.vidsrc.tv
      .replace('{id}', String(id))
      .replace('{s}', String(season))
      .replace('{e}', String(episode))
  };
}

/* ---------------------------- MANIFEST ---------------------------- */
module.exports = {
  meta: {
    id: 'tmdb',
    name: 'Film & TV (TMDB + LK21)',
    description: 'Scraper berbasis TMDB API untuk film & TV Series dengan embed streaming dari vidsrc.me, embed.su, dan vidsrc.pro.',
    baseUrl: TMDB_BASE,
    icon: 'film',
    tags: ['film', 'tv', 'movie', 'streaming', 'tmdb', 'embed'],
    order: 50,
    stability: 'stable'
  },

  endpoints: [
    {
      name: 'Search', method: 'GET', path: '/search', group: 'Discovery',
      description: 'Cari film atau TV Series berdasarkan judul.',
      cache: 120,
      params: [
        { name: 'q', in: 'query', type: 'string', required: true, example: 'avengers', description: 'Kata kunci pencarian.' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman hasil.' }
      ],
      responseShape: { total: 'number', data: '[{ id, title, year, type, rating, poster, overview }]' },
      handler: ({ query }) => search(query.q, parseInt(query.page, 10) || 1)
    },
    {
      name: 'Detail', method: 'GET', path: '/detail/:id', group: 'Content',
      description: 'Detail lengkap film/TV: judul, sinopsis, genre, cast, crew, server streaming.',
      cache: 300,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 299536, description: 'ID TMDB.' },
        { name: 'type', in: 'query', type: 'string', required: false, default: 'movie', example: 'movie', enum: ['movie', 'tv'], description: 'Tipe konten.' }
      ],
      handler: ({ params, query }) => detail(parseInt(params.id), query.type || 'movie')
    },
    {
      name: 'Stream URL', method: 'GET', path: '/stream', group: 'Content',
      description: 'Ambil URL embed streaming dari server pilihan.',
      cache: 600,
      params: [
        { name: 'id', in: 'query', type: 'number', required: true, example: 299536, description: 'ID TMDB.' },
        { name: 'type', in: 'query', type: 'string', required: false, default: 'movie', example: 'movie', enum: ['movie', 'tv'], description: 'Tipe konten.' },
        { name: 'server', in: 'query', type: 'string', required: false, default: 'vidsrc', example: 'vidsrc', enum: ['vidsrc', 'embedsu', 'vidsrcpro'], description: 'Server streaming.' },
        { name: 'season', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Nomor season (TV).' },
        { name: 'episode', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Nomor episode (TV).' }
      ],
      handler: ({ query }) => streamingUrl(
        parseInt(query.id), query.type || 'movie', query.server || 'vidsrc',
        parseInt(query.season) || 1, parseInt(query.episode) || 1
      )
    },
    {
      name: 'Trending', method: 'GET', path: '/trending', group: 'Discovery',
      description: 'Film & TV trending dari TMDB.',
      cache: 300,
      params: [{ name: 'window', in: 'query', type: 'string', required: false, default: 'week', example: 'week', enum: ['day', 'week'], description: 'Jendela waktu.' }],
      handler: ({ query }) => trending(query.window || 'week')
    },
    {
      name: 'Trending Movies', method: 'GET', path: '/trending/movies', group: 'Discovery',
      description: 'Film trending.',
      cache: 300,
      params: [{ name: 'window', in: 'query', type: 'string', required: false, default: 'week', example: 'week', enum: ['day', 'week'], description: 'Jendela waktu.' }],
      handler: ({ query }) => trendingMovies(query.window || 'week')
    },
    {
      name: 'Trending TV', method: 'GET', path: '/trending/tv', group: 'Discovery',
      description: 'TV Series trending.',
      cache: 300,
      params: [{ name: 'window', in: 'query', type: 'string', required: false, default: 'week', example: 'week', enum: ['day', 'week'], description: 'Jendela waktu.' }],
      handler: ({ query }) => trendingTv(query.window || 'week')
    },
    {
      name: 'Recommendations', method: 'GET', path: '/recommendations/:id', group: 'Content',
      description: 'Rekomendasi film/TV serupa.',
      cache: 300,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 299536, description: 'ID TMDB.' },
        { name: 'type', in: 'query', type: 'string', required: false, default: 'movie', example: 'movie', enum: ['movie', 'tv'], description: 'Tipe konten.' },
        { name: 'limit', in: 'query', type: 'number', required: false, default: 12, example: 12, description: 'Maksimal hasil.' }
      ],
      handler: ({ params, query }) => recommendations(parseInt(params.id), query.type || 'movie', parseInt(query.limit, 10) || 12)
    },
    {
      name: 'Top Rated', method: 'GET', path: '/top-rated', group: 'Discovery',
      description: 'Film dengan rating tertinggi.',
      cache: 600,
      params: [{ name: 'limit', in: 'query', type: 'number', required: false, default: 20, example: 20, description: 'Maksimal hasil.' }],
      handler: ({ query }) => topRated(parseInt(query.limit, 10) || 20)
    },
    {
      name: 'Popular', method: 'GET', path: '/popular', group: 'Discovery',
      description: 'Film populer saat ini.',
      cache: 300,
      params: [{ name: 'limit', in: 'query', type: 'number', required: false, default: 20, example: 20, description: 'Maksimal hasil.' }],
      handler: ({ query }) => popular(parseInt(query.limit, 10) || 20)
    },
    {
      name: 'Discover', method: 'GET', path: '/discover/:type', group: 'Discovery',
      description: 'Cari konten dengan filter canggih: genre, tahun, rating minim, pengurutan.',
      cache: 300,
      params: [
        { name: 'type', in: 'path', type: 'string', required: true, example: 'movie', enum: ['movie', 'tv'], description: 'Tipe konten.' },
        { name: 'withGenres', in: 'query', type: 'number', required: false, default: null, example: 28, description: 'ID genre TMDB.' },
        { name: 'sortBy', in: 'query', type: 'string', required: false, default: 'popularity.desc', example: 'popularity.desc', enum: ['popularity.asc', 'popularity.desc', 'vote_average.asc', 'vote_average.desc', 'release_date.asc', 'release_date.desc'], description: 'Pengurutan.' },
        { name: 'year', in: 'query', type: 'number', required: false, default: null, example: 2024, description: 'Filter tahun.' },
        { name: 'ratingGte', in: 'query', type: 'number', required: false, default: null, example: 7, description: 'Rating minimum (0-10).' },
        { name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman.' }
      ],
      handler: ({ params, query }) => discover(
        params.type, {
          withGenres: query.withGenres || null,
          sortBy: query.sortBy || 'popularity.desc',
          year: query.year ? parseInt(query.year, 10) : null,
          ratingGte: query.ratingGte ? parseFloat(query.ratingGte) : null,
          page: parseInt(query.page, 10) || 1
        }
      )
    },
    {
      name: 'Genres', method: 'GET', path: '/genres', group: 'Metadata',
      description: 'Daftar genre film & TV dari TMDB.',
      cache: 3600,
      params: [],
      handler: () => getGenres()
    },
    {
      name: 'Episode Detail', method: 'GET', path: '/episode/:id/:season/:episode', group: 'Content',
      description: 'Detail satu episode TV Series + URL streaming.',
      cache: 300,
      params: [
        { name: 'id', in: 'path', type: 'number', required: true, example: 1399, description: 'ID TV Series.' },
        { name: 'season', in: 'path', type: 'number', required: true, example: 1, description: 'Nomor season.' },
        { name: 'episode', in: 'path', type: 'number', required: true, example: 1, description: 'Nomor episode.' }
      ],
      handler: ({ params }) => episodeDetail(parseInt(params.id), parseInt(params.season, 10), parseInt(params.episode, 10))
    }
  ],

  actions: {
    search, detail, streamingUrl, trending, trendingMovies, trendingTv,
    recommendations, topRated, popular, discover, getGenres, episodeDetail
  }
};