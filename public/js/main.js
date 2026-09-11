(function () {
  'use strict';

  const render = () => window.lucide && window.lucide.createIcons();
  render();

  /* ---------- Theme ---------- */
  const root = document.documentElement;
  const saved = localStorage.getItem('epann-theme');
  if (saved) root.setAttribute('data-theme', saved);

  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('epann-theme', next);
    });
  }

  /* ---------- Mobile nav ---------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  }

  /* ---------- Nav shadow ---------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Copy buttons ---------- */
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-copy]');
    if (!btn) return;
    const block = btn.closest('.code-block');
    const text = block ? block.querySelector('pre').innerText : '';
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('done');
      btn.innerHTML = '<i data-lucide="check"></i>';
      render();
      setTimeout(() => {
        btn.classList.remove('done');
        btn.innerHTML = '<i data-lucide="copy"></i>';
        render();
      }, 1500);
    });
  });

  /* ---------- Tabs ---------- */
  document.querySelectorAll('[data-tabs]').forEach((group) => {
    group.addEventListener('click', (ev) => {
      const tab = ev.target.closest('.tab');
      if (!tab) return;
      const id = tab.dataset.tab;
      group.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      group.querySelectorAll('.tab-panel').forEach((p) =>
        p.classList.toggle('active', p.dataset.panel === id)
      );
    });
  });

  /* ---------- Counter animation ---------- */
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = parseInt(el.dataset.count, 10) || 0;
        let cur = 0;
        const step = Math.max(1, Math.ceil(target / 34));
        const tick = () => {
          cur = Math.min(target, cur + step);
          el.textContent = cur;
          if (cur < target) requestAnimationFrame(tick);
        };
        tick();
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach((c) => io.observe(c));
  }

  /* ---------- Shared JSON highlighter ---------- */
  window.EpannUI = {
    renderIcons: render,
    highlightJSON(value) {
      const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      return json
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(
          /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
          (m) => {
            let cls = 'num';
            if (/^"/.test(m)) cls = /:$/.test(m) ? 'key' : 'str';
            else if (/true|false/.test(m)) cls = 'bool';
            else if (/null/.test(m)) cls = 'null';
            return `<span class="tok-${cls}">${m}</span>`;
          }
        );
    },
    formatBytes(n) {
      if (n < 1024) return `${n} B`;
      if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1048576).toFixed(2)} MB`;
    }
  };
})();