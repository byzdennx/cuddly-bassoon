(function () {
  'use strict';

  const UI = window.EpannUI;
  const PREFIX = window.__API_PREFIX__ || '/api/v1';

  const $ = (id) => document.getElementById(id);
  const selEndpoint = $('pgEndpoint');
  const boxParams = $('pgParams');
  const boxDesc = $('pgDesc');
  const inpUrl = $('pgUrl');
  const btnSend = $('pgSend');
  const btnReset = $('pgReset');
  const linkOpen = $('pgOpen');
  const preCurl = $('pgCurl');
  const out = $('resOutput');
  const empty = $('resEmpty');
  const loader = $('resLoader');

  let MANIFEST = [];
  let current = null;
  let abortController = null;
  let timeoutTimer = null;
  const TIMEOUT_MS = 60000; // 60 detik

  /* ---------------- load manifest ---------------- */
  fetch(`${PREFIX}/endpoints`)
    .then((r) => r.json())
    .then((json) => {
      MANIFEST = json.result || [];
      const wanted = new URLSearchParams(location.search).get('ep');
      if (wanted && [...selEndpoint.options].some((o) => o.value === wanted)) {
        selEndpoint.value = wanted;
      }
      buildForm();
    })
    .catch(() => {
      boxDesc.textContent = 'Gagal memuat manifest endpoint.';
    });

  function findEndpoint(key) {
    for (const m of MANIFEST) {
      const ep = m.endpoints.find((e) => e.key === key);
      if (ep) return { module: m, ep };
    }
    return null;
  }

  /* ---------------- build param form ---------------- */
  function buildForm() {
    const found = findEndpoint(selEndpoint.value);
    if (!found) return;
    current = found;

    boxDesc.innerHTML =
      `<b>${found.ep.name}</b> — ${found.ep.description}` +
      `<br><span class="small muted">Modul: ${found.module.name} | Cache: ${found.ep.cache}s | Method: ${found.ep.method}</span>`;

    boxParams.innerHTML = '';
    if (!found.ep.params.length) {
      boxParams.innerHTML = '<p class="muted small"><i data-lucide="minus"></i> Endpoint ini tidak memerlukan parameter.</p>';
    }

    found.ep.params.forEach((p) => {
      const wrap = document.createElement('label');
      wrap.className = 'field';

      const label = document.createElement('span');
      label.innerHTML =
        `<i data-lucide="${p.in === 'path' ? 'route' : 'search-code'}"></i> ${p.name}` +
        (p.required ? '<b class="req-star">*</b>' : '');
      wrap.appendChild(label);

      let field;
      if (p.enum) {
        field = document.createElement('select');
        p.enum.forEach((v) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = v;
          field.appendChild(o);
        });
        field.value = p.example ?? p.enum[0];
      } else {
        field = document.createElement('input');
        field.type = p.type === 'number' ? 'number' : 'text';
        field.placeholder = p.description || p.name;
        field.value = p.example ?? p.default ?? '';
      }
      field.dataset.name = p.name;
      field.dataset.in = p.in;
      field.addEventListener('input', updateUrl);
      field.addEventListener('change', updateUrl);
      wrap.appendChild(field);

      if (p.description) {
        const hint = document.createElement('small');
        hint.className = 'param-hint';
        hint.textContent = p.description;
        wrap.appendChild(hint);
      }
      boxParams.appendChild(wrap);
    });

    UI.renderIcons();
    updateUrl();
    resetResponse();
  }

  /* ---------------- compose url ---------------- */
  function composeUrl() {
    if (!current) return '';
    let path = current.ep.route;
    const qs = new URLSearchParams();

    boxParams.querySelectorAll('[data-name]').forEach((f) => {
      const val = String(f.value || '').trim();
      if (f.dataset.in === 'path') {
        path = path.replace(`:${f.dataset.name}`, encodeURIComponent(val || 'value'));
      } else if (val) {
        qs.set(f.dataset.name, val);
      }
    });

    const q = qs.toString();
    return path + (q ? `?${q}` : '');
  }

  function updateUrl() {
    const rel = composeUrl();
    const abs = location.origin + rel;
    inpUrl.value = abs;
    linkOpen.href = abs;
    preCurl.textContent = `curl -s "${abs}"`;
  }

  /* ---------------- reset response (PERBAIKAN UTAMA) ---------------- */
  function resetResponse() {
    // 1. Batalkan request yang sedang berlangsung
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    // 2. Hapus timeout timer
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }

    // 3. Sembunyikan loader & output
    out.hidden = true;
    empty.hidden = false;
    loader.hidden = true;
    btnSend.disabled = false;

    // 4. Reset semua chip status
    setChip('resStatus', 'circle-dashed', 'idle', '');
    setChip('resTime', 'timer', '0 ms', '');
    setChip('resSize', 'hard-drive', '0 B', '');
    setChip('resCache', 'database', '-', '');

    UI.renderIcons();
  }

  /* ---------------- send request ---------------- */
  async function send() {
    const url = composeUrl();
    if (!url) return;

    // Batalkan request sebelumnya jika ada
    if (abortController) abortController.abort();
    abortController = new AbortController();

    // Set timeout
    timeoutTimer = setTimeout(() => {
      if (abortController) abortController.abort();
    }, TIMEOUT_MS);

    // Siapkan UI loading
    empty.hidden = true;
    out.hidden = true;
    loader.hidden = false;
    btnSend.disabled = true;

    setChip('resStatus', 'loader-circle', 'sending...', 'loading');
    setChip('resTime', 'timer', '0 ms', '');
    setChip('resSize', 'hard-drive', '0 B', '');
    setChip('resCache', 'database', '-', '');
    UI.renderIcons();

    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: abortController.signal
      });

      const text = await res.text();
      const ms = Math.round(performance.now() - t0);

      // Parse JSON
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text, note: 'Response bukan JSON valid' };
      }

      // Tampilkan output
      out.querySelector('code').innerHTML = UI.highlightJSON(parsed);
      out.hidden = false;

      // Update chip status
      setChip('resStatus', res.ok ? 'circle-check' : 'circle-x',
        `${res.status} ${res.statusText}`, res.ok ? 'ok' : 'err');
      setChip('resTime', 'timer', `${ms} ms`, '');
      setChip('resSize', 'hard-drive', UI.formatBytes(new Blob([text]).size), '');
      setChip('resCache', 'database',
        parsed && parsed.cached ? 'HIT' :
        parsed && parsed.error ? 'MISS (error)' : 'MISS', '');

    } catch (err) {
      // Handle error dengan spesifik
      if (err.name === 'AbortError') {
        // Timeout atau user batalkan
        out.querySelector('code').innerHTML = UI.highlightJSON({
          status: false,
          error: 'Request timeout (>60 detik) atau dibatalkan.',
          hint: 'Sumber mungkin lambat atau sedang down. Coba lagi nanti.'
        });
        out.hidden = false;
        setChip('resStatus', 'circle-x', 'timeout / aborted', 'err');
        setChip('resTime', 'timer', '60s+', '');
        setChip('resSize', 'hard-drive', '0 B', '');
        setChip('resCache', 'database', '-', '');
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        // Network error
        out.querySelector('code').innerHTML = UI.highlightJSON({
          status: false,
          error: 'Koneksi jaringan gagal.',
          hint: 'Cek koneksi internet atau coba lagi.'
        });
        out.hidden = false;
        setChip('resStatus', 'circle-x', 'network error', 'err');
      } else {
        // Error umum
        out.querySelector('code').innerHTML = UI.highlightJSON({
          status: false,
          error: err.message || 'Terjadi kesalahan tidak terduga.'
        });
        out.hidden = false;
        setChip('resStatus', 'circle-x', 'error', 'err');
      }
    } finally {
      // Bersihkan
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      abortController = null;
      loader.hidden = true;
      btnSend.disabled = false;
      UI.renderIcons();
    }
  }

  /* ---------------- helper chip ---------------- */
  function setChip(id, icon, text, cls) {
    const el = $(id);
    el.className = 'res-chip' + (cls ? ' ' + cls : '');
    el.innerHTML = `<i data-lucide="${icon}"></i> ${text}`;
  }

  /* ---------------- events ---------------- */
  selEndpoint.addEventListener('change', buildForm);
  btnSend.addEventListener('click', send);
  btnReset.addEventListener('click', () => {
    buildForm();
    resetResponse();
  });

  $('pgCopyUrl').addEventListener('click', () => {
    navigator.clipboard.writeText(inpUrl.value);
    $('pgCopyUrl').innerHTML = '<i data-lucide="check"></i>';
    UI.renderIcons();
    setTimeout(() => {
      $('pgCopyUrl').innerHTML = '<i data-lucide="copy"></i>';
      UI.renderIcons();
    }, 1200);
  });

  $('pgCopyRes').addEventListener('click', () => {
    const text = out.querySelector('code').innerText;
    navigator.clipboard.writeText(text);
    $('pgCopyRes').innerHTML = '<i data-lucide="check"></i>';
    UI.renderIcons();
    setTimeout(() => {
      $('pgCopyRes').innerHTML = '<i data-lucide="clipboard-copy"></i>';
      UI.renderIcons();
    }, 1200);
  });

  $('pgWrap').addEventListener('click', () => {
    out.classList.toggle('wrap');
    $('pgWrap').innerHTML = out.classList.contains('wrap')
      ? '<i data-lucide="code-from-string"></i>'
      : '<i data-lucide="wrap-text"></i>';
    UI.renderIcons();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  });

  // Handle sebelum unload (hindari request stuck)
  window.addEventListener('beforeunload', () => {
    if (abortController) abortController.abort();
    if (timeoutTimer) clearTimeout(timeoutTimer);
  });
})();