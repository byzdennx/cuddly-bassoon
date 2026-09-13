'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — UNGGAH.WEB.ID UPLOADER MODULE
 * ---------------------------------------------------------------------
 *  File   : src/scrapers/unggah.js
 *  Source : https://unggah.web.id
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');
const { get } = require('../core/http');

const BASE = 'https://unggah.web.id';
const UPLOAD_URL = `${BASE}/api/unggah`;

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

function randomBoundary() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomPart = '';
  for (let i = 0; i < 16; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `WebKitFormBoundary${randomPart}`;
}

async function uploadFile(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const boundary = randomBoundary();

  const head = Buffer.from(
    `------${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: image/png\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n------${boundary}--\r\n`);
  const body = Buffer.concat([head, fileBuffer, tail]);

  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=----${boundary}`,
      accept: '*/*',
      origin: BASE,
      referer: `${BASE}/pengunggah`,
      'user-agent':
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
    },
    body,
  });

  const status = res.status;
  const result = await res.json();

  return {
    status: status === 201 ? 'success' : 'failed',
    code: status,
    input: filePath,
    result_url: result.url || null,
  };
}

/* ------------------------------------------------------------------ */
/*  MODULE EXPORT (EpannStream Format)                                 */
/* ------------------------------------------------------------------ */

module.exports = {
  meta: {
    id: 'unggah',
    name: 'Unggah.web.id Uploader',
    description: 'Upload file gambar ke unggah.web.id (multipart/form-data).',
    baseUrl: BASE,
    icon: 'upload-cloud',
    tags: ['uploader', 'image', 'file'],
    order: 80,
    stability: 'beta',
  },

  endpoints: [
    {
      name: 'Upload File',
      method: 'POST',
      path: '/upload',
      group: 'Unggah',
      description:
        'Upload file gambar ke unggah.web.id. Kirim path file lokal server (karena ini backend-side).',
      cache: 0,
      params: [
        {
          name: 'filePath',
          in: 'body',
          type: 'string',
          required: true,
          example: '/home/container/Gyji.png',
          description: 'Absolute path file lokal yang akan di-upload.',
        },
      ],
      responseShape: { status: 'string', code: 'number', result_url: 'string' },
      handler: async ({ body }) => {
        const filePath = String(body.filePath || '').trim();
        if (!filePath) {
          const err = new Error('Parameter "filePath" wajib diisi.');
          err.statusCode = 400;
          throw err;
        }
        if (!fs.existsSync(filePath)) {
          const err = new Error(`File tidak ditemukan: ${filePath}`);
          err.statusCode = 404;
          throw err;
        }
        return uploadFile(filePath);
      },
    },
  ],
};
