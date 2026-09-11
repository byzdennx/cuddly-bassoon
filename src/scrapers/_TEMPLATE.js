'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — SCRAPER MODULE TEMPLATE
 * ---------------------------------------------------------------------
 *  CARA PAKAI:
 *  1. Copy file ini, rename tanpa underscore  ->  src/scrapers/tiktok.js
 *  2. Isi `meta` dan `endpoints`
 *  3. Simpan. Registry otomatis:
 *       - mendeteksi file baru (fs.watch)
 *       - membuat route  GET /api/v1/<meta.id><endpoint.path>
 *       - menambahkan dokumentasi di /docs
 *       - menambahkan form otomatis di /playground
 *     TANPA edit route/manual wiring sama sekali.
 *
 *  Catatan:
 *   - File berawalan "_" atau "." DIABAIKAN loader.
 *   - Path param (:slug) otomatis terdeteksi walau tidak dideklarasikan.
 *   - handler boleh async, return value apa saja (akan dibungkus envelope).
 * =====================================================================
 */

const { get } = require('../core/http');

const BASE = 'https://example.com';

module.exports = {
  meta: {
    id: 'example',                     // opsional, default = nama file
    name: 'Example Module',
    description: 'Deskripsi singkat modul ini untuk halaman dokumentasi.',
    baseUrl: BASE,
    icon: 'boxes',                     // nama icon Lucide
    tags: ['demo'],
    order: 90,                         // urutan tampil di docs
    stability: 'beta'                  // stable | beta | experimental
  },

  endpoints: [
    {
      name: 'Sample',
      method: 'GET',
      path: '/sample/:id',
      group: 'General',
      description: 'Contoh endpoint dengan path param dan query param.',
      cache: 60,                       // detik, 0 = tanpa cache
      params: [
        { name: 'id', in: 'path', type: 'string', required: true, example: '123', description: 'ID target.' },
        { name: 'limit', in: 'query', type: 'number', required: false, default: 10, example: 10, description: 'Jumlah item.' }
      ],
      responseShape: { id: 'string', items: 'array' },
      handler: async ({ params, query }) => {
        const html = await get(`${BASE}/item/${params.id}`);
        return { id: params.id, limit: Number(query.limit) || 10, length: html.length };
      }
    }
  ]
};