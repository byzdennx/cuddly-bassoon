'use strict';

const cheerio = require('cheerio');
const { get } = require('../core/http');

const BASE_URL = 'https://donghub.vip';

function parseAnimeCard($, $el) {
  const title = $el.find('.tt h2').text().trim();
  const url = $el.find('.bsx a').attr('href') || '';
  const slug = url.split('/').filter(Boolean).pop() || '';
  const image = $el.find('img').attr('src') || '';
  const status = $el.find('.epx').text().trim();
  const type = $el.find('.typez').text().trim();
  const sub = $el.find('.sub').length > 0 ? 'Sub' : '';

  return { title, slug, image, status, type, sub, url };
}

async function getLatestAnime(page = 1) {
  const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`;
  const html = await get(url);
  const $ = cheerio.load(html);
  const data = [];

  $('.listupd.normal .bs').each((_, element) => {
    data.push(parseAnimeCard($, $(element)));
  });

  return { source: url, page: Number(page), total: data.length, data };
}

async function getSeriesList(page = 1) {
  const url = `${BASE_URL}/anime/?page=${page}&status=&type=&order=update`;
  const html = await get(url);
  const $ = cheerio.load(html);
  const data = [];

  $('.listupd .bs').each((_, element) => {
    data.push(parseAnimeCard($, $(element)));
  });

  return { source: url, page: Number(page), total: data.length, data };
}

async function getSeriesDetail(slug) {
  const url = `${BASE_URL}/anime/${slug}/`;
  const html = await get(url);
  const $ = cheerio.load(html);

  const title = $('.entry-title').text().trim();
  const image = $('.thumb img').attr('src') || '';
  const synopsis = $('.entry-content').text().trim();

  const genres = [];
  $('.genxed a').each((_, el) => genres.push($(el).text().trim()));

  const info = $('.spe');
  const status = info.find('span:contains("Status")').text().replace('Status:', '').trim();
  const type = info.find('span:contains("Type")').text().replace('Type:', '').trim();
  const released = info.find('span:contains("Released")').text().replace('Released:', '').trim();
  const author = info.find('span:contains("Author")').text().replace('Author:', '').trim();

  const episodes = [];
  $('.eplister ul li').each((_, el) => {
    const $el = $(el);
    const epTitle = $el.find('.epl-title').text().trim();
    const epUrl = $el.find('a').attr('href') || '';
    const epSlug = epUrl.split('/').filter(Boolean).pop() || '';
    const epDate = $el.find('.epl-date').text().trim();
    episodes.push({ title: epTitle, slug: epSlug, url: epUrl, date: epDate });
  });

  return {
    url,
    slug,
    title,
    image,
    synopsis,
    genres,
    metadata: { status, type, released, author },
    totalEpisodes: episodes.length,
    episodes
  };
}

async function getEpisodeDetail(slug) {
  const url = `${BASE_URL}/${slug}/`;
  const html = await get(url);
  const $ = cheerio.load(html);

  const title = $('.entry-title').text().trim();
  const servers = [];

  $('select.mirror option').each((_, el) => {
    const $el = $(el);
    const name = $el.text().trim();
    const value = $el.attr('value');

    if (value) {
      try {
        const decoded = Buffer.from(value, 'base64').toString('utf-8');
        const iframeMatch = decoded.match(/src="([^"]+)"/);
        if (iframeMatch) {
          servers.push({ name, type: 'embed', embedUrl: iframeMatch[1] });
        }
      } catch (_) {}
    }
  });

  const prevEpisode = $('.naveps .nvs:contains("Prev") a').attr('href')?.split('/').filter(Boolean).pop() || null;
  const nextEpisode = $('.naveps .nvs:contains("Next") a').attr('href')?.split('/').filter(Boolean).pop() || null;
  const allEpisodes = $('.naveps .nvs:contains("All") a').attr('href')?.split('/').filter(Boolean).pop() || null;

  return {
    url,
    slug,
    title,
    totalServers: servers.length,
    servers,
    navigation: { prevEpisode, nextEpisode, allEpisodes }
  };
}

async function searchAnime(query) {
  const url = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  const html = await get(url);
  const $ = cheerio.load(html);
  const data = [];

  $('.listupd .bs').each((_, element) => {
    data.push(parseAnimeCard($, $(element)));
  });

  return { query, total: data.length, data };
}

module.exports = {
  meta: {
    id: 'donghua',
    name: 'Donghua Streaming',
    description: 'Scraper donghua (animasi 3D & 2D China) dari Donghub: rilis terbaru, katalog seri, pencarian judul, detail episode dengan decode base64 streaming server.',
    baseUrl: BASE_URL,
    icon: 'tv-minimal',
    tags: ['donghua', 'anime-china', 'streaming'],
    order: 40,
    stability: 'stable'
  },

  endpoints: [
    {
      name: 'Latest', method: 'GET', path: '/latest', group: 'Discovery',
      description: 'Daftar episode donghua terbaru.', cache: 120,
      params: [{ name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman.' }],
      handler: ({ query }) => getLatestAnime(parseInt(query.page, 10) || 1)
    },
    {
      name: 'Series List', method: 'GET', path: '/list', group: 'Discovery',
      description: 'Katalog serial donghua terupdate.', cache: 180,
      params: [{ name: 'page', in: 'query', type: 'number', required: false, default: 1, example: 1, description: 'Halaman.' }],
      handler: ({ query }) => getSeriesList(parseInt(query.page, 10) || 1)
    },
    {
      name: 'Search', method: 'GET', path: '/search', group: 'Discovery',
      description: 'Pencarian serial donghua.', cache: 120,
      params: [{ name: 'q', in: 'query', type: 'string', required: true, example: 'soul land', description: 'Kata kunci.' }],
      handler: ({ query }) => searchAnime(query.q)
    },
    {
      name: 'Detail', method: 'GET', path: '/detail/:slug', group: 'Content',
      description: 'Detail lengkap donghua beserta daftar episode.', cache: 300,
      params: [{ name: 'slug', in: 'path', type: 'string', required: true, example: 'soul-land', description: 'Slug serial.' }],
      handler: ({ params }) => getSeriesDetail(params.slug)
    },
    {
      name: 'Episode', method: 'GET', path: '/episode/:slug', group: 'Content',
      description: 'Detail episode donghua beserta embed player server.', cache: 300,
      params: [{ name: 'slug', in: 'path', type: 'string', required: true, example: 'soul-land-episode-100', description: 'Slug episode.' }],
      handler: ({ params }) => getEpisodeDetail(params.slug)
    }
  ],

  actions: { getLatestAnime, getSeriesList, getSeriesDetail, getEpisodeDetail, searchAnime }
};