(function () {
  'use strict';

  const PREFIX = window.__API_PREFIX__ || '/api/v1';
  const UI = window.EpannUI;
  const $ = (id) => document.getElementById(id);

  const fmtUptime = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
          m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [d && `${d}h`, h && `${h}j`, m && `${m}m`, `${sec}d`].filter(Boolean).join(' ');
  };

  const row = (icon, key, val) =>
    `<li><span><i data-lucide="${icon}"></i> ${key}</span><span>${val}</span></li>`;

  async function refresh() {
    try {
      const r = await fetch(`${PREFIX}/stats`);
      const { result: d } = await r.json();

      $('sHealth').textContent = 'Operational';
      $('sUptime').textContent = fmtUptime(d.uptimeSeconds);
      $('sHeap').textContent = `${d.memory.heapUsedMB} MB`;
      $('sHit').textContent = `${d.cache.hitRate}%`;

      $('kvRuntime').innerHTML = [
        row('hexagon', 'Node.js', d.node),
        row('monitor', 'Platform', d.platform),
        row('memory-stick', 'RSS', `${d.memory.rssMB} MB`),
        row('layers', 'Heap Total', `${d.memory.heapTotalMB} MB`),
        row('database', 'Cache Entries', `${d.cache.entries} / ${d.cache.maxEntries}`),
        row('target', 'Cache Hit / Miss', `${d.cache.hits} / ${d.cache.misses}`)
      ].join('');

      $('kvRegistry').innerHTML = [
        row('boxes', 'Modul Terhubung', d.registry.modules),
        row('route', 'Total Endpoint', d.registry.endpoints),
        row('eye', 'Auto Watch', d.registry.watching ? 'Aktif' : 'Nonaktif'),
        row('clock', 'Terakhir Dimuat', new Date(d.registry.loadedAt).toLocaleString('id-ID')),
        row('send', 'Total Request', d.registry.requests.total),
        row('triangle-alert', 'Failed Request', d.registry.requests.failed),
        row('file-warning', 'Modul Gagal', d.registry.failedModules.length)
      ].join('');

      const rows = [];
      d.modules.forEach((m) =>
        m.endpoints.forEach((e) =>
          rows.push(
            `<tr><td><span class="method m-${e.method.toLowerCase()}">${e.method}</span></td>
             <td><code>${e.route}</code></td><td>${e.hits.total}</td>
             <td>${e.hits.cached}</td><td>${e.hits.failed}</td></tr>`
          )
        )
      );
      $('epTable').innerHTML = rows.join('') || '<tr><td colspan="5" class="muted">Belum ada data.</td></tr>';

      UI.renderIcons();
    } catch (_) {
      $('sHealth').textContent = 'Unreachable';
    }
  }

  refresh();
  setInterval(refresh, 10000);
})();