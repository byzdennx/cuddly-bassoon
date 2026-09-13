'use strict';

/**
 * =====================================================================
 *  EPANNSTREAM — ALIGHT MOTION PREMIUM V2 MODULE
 * ---------------------------------------------------------------------
 *  File   : src/scrapers/alightmotion.js
 *  Source : https://am.neonode.my.id
 *  Note   : Modul asli adalah Baileys/WhatsApp bot. Versi ini
 *           meng-expose logic sebagai REST endpoint (2-step flow).
 * =====================================================================
 */

const axios = require('axios');

const API_URL = 'https://am.neonode.my.id/api';

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

// Session in-memory — key: email (karena tidak ada WA sender di REST)
const sessions = new Map();

async function sendLink(email) {
  try {
    const { data } = await axios.post(
      `${API_URL}/send-link`,
      { email },
      { headers: { 'content-type': 'application/json' }, timeout: 30000 }
    );
    return data;
  } catch (error) {
    return error.response?.data || { success: false, message: error.message };
  }
}

async function verifyLink(email, magicLink) {
  try {
    const { data } = await axios.post(
      `${API_URL}/verify-link`,
      { email, magicLink },
      { headers: { 'content-type': 'application/json' }, timeout: 30000 }
    );
    return data;
  } catch (error) {
    return error.response?.data || { success: false, message: error.message };
  }
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ------------------------------------------------------------------ */
/*  MODULE EXPORT (EpannStream Format)                                 */
/* ------------------------------------------------------------------ */

module.exports = {
  meta: {
    id: 'alightmotion',
    name: 'Alight Motion Prem V2',
    description:
      'Aktifkan Alight Motion Premium via magic link 2-step (send-link → verify-link).',
    baseUrl: 'https://am.neonode.my.id',
    icon: 'sparkles',
    tags: ['premium', 'alight-motion', 'magic-link'],
    order: 70,
    stability: 'beta',
  },

  endpoints: [
    /* ---------------- STEP 1: SEND MAGIC LINK ---------------- */
    {
      name: 'Send Magic Link',
      method: 'POST',
      path: '/send-link',
      group: 'Alight Motion',
      description:
        'Langkah 1: kirim magic link ke email. Simpan email untuk step berikutnya.',
      cache: 0,
      params: [
        {
          name: 'email',
          in: 'body',
          type: 'string',
          required: true,
          example: 'user@gmail.com',
          description: 'Email tujuan untuk menerima magic link.',
        },
      ],
      responseShape: { success: 'boolean', message: 'string' },
      handler: async ({ body }) => {
        const email = String(body.email || '').trim();
        if (!email || !validEmail(email)) {
          const err = new Error('Email tidak valid.');
          err.statusCode = 400;
          throw err;
        }

        const result = await sendLink(email);
        if (!result?.success) {
          const err = new Error(result?.message || 'Gagal mengirim magic link.');
          err.statusCode = 502;
          throw err;
        }

        // Simpan session (TTL 15 menit)
        sessions.set(email, { email, createdAt: Date.now() });
        setTimeout(() => sessions.delete(email), 15 * 60 * 1000);

        return {
          success: true,
          message: 'Magic link berhasil dikirim. Cek inbox/spam.',
          email,
        };
      },
    },

    /* ---------------- STEP 2: VERIFY MAGIC LINK ---------------- */
    {
      name: 'Verify Magic Link',
      method: 'POST',
      path: '/verify-link',
      group: 'Alight Motion',
      description:
        'Langkah 2: verifikasi magic link yang diterima di email. Wajib sudah panggil /send-link terlebih dahulu.',
      cache: 0,
      params: [
        {
          name: 'email',
          in: 'body',
          type: 'string',
          required: true,
          example: 'user@gmail.com',
          description: 'Email yang sama saat /send-link.',
        },
        {
          name: 'magicLink',
          in: 'body',
          type: 'string',
          required: true,
          example: 'https://am.neonode.my.id/verify?token=...',
          description: 'Magic link dari email.',
        },
      ],
      responseShape: {
        success: 'boolean',
        data: 'object',
      },
      handler: async ({ body }) => {
        const email = String(body.email || '').trim();
        const magicLink = String(body.magicLink || '').trim();

        if (!email || !validEmail(email)) {
          const err = new Error('Email tidak valid.');
          err.statusCode = 400;
          throw err;
        }
        if (!magicLink) {
          const err = new Error('Parameter "magicLink" wajib diisi.');
          err.statusCode = 400;
          throw err;
        }

        const session = sessions.get(email);
        if (!session) {
          const err = new Error(
            'Session tidak ditemukan. Panggil /send-link terlebih dahulu.'
          );
          err.statusCode = 400;
          throw err;
        }

        const result = await verifyLink(email, magicLink);
        if (!result?.success) {
          const err = new Error(
            result?.message || 'Magic link tidak valid atau sudah kedaluwarsa.'
          );
          err.statusCode = 400;
          throw err;
        }

        sessions.delete(email);

        // Sanitasi: hapus ID token agar tidak bocor
        const d = result.data || {};
        return {
          success: true,
          message: result.message || 'Verifikasi berhasil, premium aktif.',
          data: {
            account: {
              email: d.email || email,
              uid: d.uid || null,
              status: d.status || null,
            },
            premium: {
              planName: d.planName || null,
              subscriptionType: d.subscriptionType || null,
              membershipStatus: d.membershipStatus || null,
              orderId: d.orderId || null,
              validUntil: d.validUntil || null,
            },
          },
        };
      },
    },
  ],
};
