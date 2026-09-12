(function () {
  'use strict';

  const UI = window.EpannUI || {};
  const PREFIX = window.__API_PREFIX__ || '/api/v1';
  const ORIGIN = window.__ORIGIN__ || location.origin;
  const TIMEOUT_MS = 60000;

  const $ = (id) => document.getElementById(id);

  /* ---------------- DOM ---------------- */
  const selEndpoint = $('pgEndpoint');
  const boxParams   = $('pgParams');
  const boxDesc     = $('pgDesc');
  const inpUrl      = $('pgUrl');
  const btnSend     = $('pgSend');
  const btnReset    = $('pgReset');
  const linkOpen    = $('pgOpen');
  const preCurl     = $('pgCurl');
  const resCard     = $('pgResponseCard');
  const out         = $('resOutput');
  const outCode     = out.querySelector('code');
  const empty       = $('resEmpty');
  const loader      = $('resLoader');

  /* ---------------- State ---------------- */
  let MANIFEST = [];
  let current = null;
  let abortController = null;
  let timeoutTimer = null;

  /* =========================================================
     HELPERS
     ========================================================= */
  const renderIcons = () => {
    if (UI.renderIcons) UI.renderIcons();
    else if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  };

  const highlightJSON = (obj) => {
    if (UI.highlightJSON) return UI.highlightJSON(obj);
    const json = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    return json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const formatBytes = (n) => {
    if (UI.formatBytes) return UI.formatBytes(n);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };

  function setChip(id, icon, text, cls) {
    const el = $(id);
    if (!el) return;
    el.className = `res-chip ${cls || ''}`.trim();
    el.innerHTML = `<i data-lucide="${icon}"></i> ${text}`;
  }

  /* =========================================================
     STATE VISUAL (idle | loading | ok)
     ========================================================= */
  function showState(state) {
    resCard.dataset.state = state;
    const body = $('resBody');
    if (body) body.dataset.state = state;

    // ⬇️ empty hanya tampil saat idle
    empty.hidden  = state !== 'idle';
    loader.hidden = state !== 'loading';
    out.hidden    = state !== 'ok';

    renderIcons();
  }

  function setSendLoading(on) {
    btnSend.disabled = !!on;
    btnSend.dataset.state = on ? 'loading' : 'idle';
    const label = btnSend.querySelector('.btn-label');
    if (label) label.textContent = on ? 'Mengirim…' : 'Kirim Request';
  }

  function cancelInflight() {
    if (abortController) {
      try { abortController.abort('manual-cancel'); } catch {}
      abortController = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }

  /* =========================================================
     MANIFEST
     ========================================================= */
  async function loadManifest() {
    try {
      const res = await fetch(`${PREFIX}/endpoints`);
      const json = await res.json();
      MANIFEST = json.result || [];
    } catch (err) {
      boxDesc.textContent = 'Gagal memuat manifest endpoint.';
      return;
    }

    const wanted = new URLSearchParams(location.search).get('ep');
    if (wanted && [...selEndpoint.options].some((o) => o.value === wanted)) {
      selEndpoint.value = wanted;
    }

    buildForm();
  }

  function findEndpoint(key) {
    for (const m of MANIFEST) {
      const ep = m.endpoints.find((e) => e.key === key);
      if (ep) return { module: m, ep };
    }
    return null;
  }

  /* =========================================================
     BUILD FORM
     ========================================================= */
  function buildForm() {
    const found = findEndpoint(selEndpoint.value);
    if (!found) return;
    current = found;

    boxDesc.innerHTML =
      `<b>${found.ep.name}</b> — ${found.ep.description || ''}` +
      `<br><span class="small muted">Modul: ${found.module.name} | Cache: ${found.ep.cache ?? 0}s | Method: ${found.ep.method}</span>`;

    boxParams.innerHTML = '';
    const params = found.ep.params || [];

    if (!params.length) {
      boxParams.innerHTML =
        '<p class="muted small"><i data-lucide="minus"></i> Endpoint ini tidak memerlukan parameter.</p>';
    }

    params.forEach((p) => {
      const wrap = document.createElement('label');
      wrap.className = 'field';

      const label = document.createElement('span');
      label.innerHTML =
        `<i data-lucide="${p.in === 'path' ? 'route' : 'search-code'}"></i> ${p.name}` +
        (p.required ? '<b class="req-star">*</b>' : '');
      wrap.appendChild(label);

      let field;
      if (Array.isArray(p.enum) && p.enum.length) {
        field = document.createElement('select');
        p.enum.forEach((v) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = v;
          field.appendChild(o);
        });
        field.value = p.example ?? p.default ?? p.enum[0];
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

    renderIcons();
    updateUrl();
    resetResponse();
  }

  /* =========================================================
     URL BUILDER
     ========================================================= */
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
    const abs = ORIGIN.replace(/\/$/, '') + rel;
    inpUrl.value = abs;
    linkOpen.href = abs || '#';
    preCurl.textContent = `curl -s "${abs}"`;
  }

  /* =========================================================
     RESET RESPONSE
     ========================================================= */
  function resetResponse() {
    cancelInflight();
    setSendLoading(false);
    outCode.innerHTML = '';
    showState('idle');

    setChip('resStatus', 'circle-dashed', 'idle', '');
    setChip('resTime', 'timer', '0 ms', '');
    setChip('resSize', 'hard-drive', '0 B', '');
    setChip('resCache', 'database', '-', '');
  }

  /* =========================================================
     SEND
     ========================================================= */
  async function send() {
    const url = composeUrl();
    if (!url) return;

    // Batalkan request sebelumnya
    cancelInflight();

    // ⬇️⬇️⬇️ PALING PENTING: hide empty & show loader SEGERA,
    // sebelum apapun yang bisa throw.
    empty.hidden  = true;
    loader.hidden = false;
    out.hidden    = true;
    resCard.dataset.state = 'loading';
    const body = $('resBody');
    if (body) body.dataset.state = 'loading';

    // Baru siapkan controller & timeout
    abortController = new AbortController();
    timeoutTimer = setTimeout(() => {
      if (abortController) abortController.abort('timeout');
    }, TIMEOUT_MS);

    setSendLoading(true);
    setChip('resStatus', 'loader-2', 'sending…', 'loading');
    setChip('resTime', 'timer', '-', '');
    setChip('resSize', 'hard-drive', '-', '');
    setChip('resCache', 'database', '-', '');
    renderIcons();

    const t0 = performance.now();

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: abortController.signal,
      });

      const text = await res.text();
      const ms = Math.round(performance.now() - t0);

      let parsed;
      try { parsed = JSON.parse(text); }
      catch { parsed = { raw: text }; }

      outCode.innerHTML = highlightJSON(parsed);
      showState('ok');

      setChip(
        'resStatus',
        res.ok ? 'circle-check' : 'circle-x',
        `${res.status} ${res.statusText || ''}`.trim(),
        res.ok ? 'ok' : 'err'
      );
      setChip('resTime', 'timer', `${ms} ms`, '');
      setChip('resSize', 'hard-drive', formatBytes(new Blob([text]).size), '');
      setChip(
        'resCache',
        'database',
        parsed && parsed.cached ? 'HIT' : 'MISS',
        parsed && parsed.cached ? 'ok' : ''
      );
    } catch (err) {
      const isAbort = err && err.name === 'AbortError';
      const isManual = isAbort && err.message === 'manual-cancel';
      const isTimeout = isAbort && err.message === 'timeout';

      // Kalau dibatalkan karena user ganti endpoint / reset → jangan render apa-apa
      if (isManual) return;

      const payload = isTimeout
        ? {
            status: false,
            error: `Request timeout setelah ${TIMEOUT_MS / 1000} detik.`,
            hint: 'Sumber mungkin sedang lambat. Coba lagi atau gunakan endpoint lain.',
          }
        : { status: false, error: (err && err.message) || 'Network error' };

      outCode.innerHTML = highlightJSON(payload);
      showState('ok');

      setChip('resStatus', 'circle-x', isTimeout ? 'timeout' : 'network error', 'err');
      setChip('resTime', 'timer', isTimeout ? `${TIMEOUT_MS / 1000}s+` : '-', '');
      setChip('resSize', 'hard-drive', '0 B', '');
      setChip('resCache', 'database', '-', '');
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      abortController = null;
      setSendLoading(false);
      renderIcons();
    }
  }

  /* =========================================================
     EVENTS
     ========================================================= */
  selEndpoint.addEventListener('change', buildForm);

  btnSend.addEventListener('click', (e) => {
    e.preventDefault();
    send();
  });

  btnReset.addEventListener('click', (e) => {
    e.preventDefault();
    buildForm();
  });

  $('pgCopyUrl').addEventListener('click', () => {
    if (!inpUrl.value) return;
    navigator.clipboard.writeText(inpUrl.value);
  });

  $('pgCopyRes').addEventListener('click', () => {
    const txt = outCode.innerText || '';
    if (!txt) return;
    navigator.clipboard.writeText(txt);
  });

  $('pgWrap').addEventListener('click', () => out.classList.toggle('wrap'));

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  });

  /* =========================================================
     INIT
     ========================================================= */
  loadManifest();
})();