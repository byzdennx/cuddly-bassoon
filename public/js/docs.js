(function () {
  'use strict';

  /* ---------- Search filter ---------- */
  const input = document.getElementById('docSearch');
  const sideLinks = [...document.querySelectorAll('.ep-link')];
  const endpoints = [...document.querySelectorAll('.endpoint')];
  const sections = [...document.querySelectorAll('.module-section')];

  if (input) {
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();

      sideLinks.forEach((a) => {
        a.style.display = !q || (a.dataset.search || '').includes(q) ? '' : 'none';
      });
      endpoints.forEach((el) => {
        el.style.display = !q || (el.dataset.search || '').includes(q) ? '' : 'none';
      });
      sections.forEach((sec) => {
        const visible = [...sec.querySelectorAll('.endpoint')].some((e) => e.style.display !== 'none');
        sec.style.display = !q || visible ? '' : 'none';
      });
    });
  }

  /* ---------- Scroll spy ---------- */
  const links = [...document.querySelectorAll('.side-link')];
  const targets = links
    .map((l) => document.querySelector(l.getAttribute('href')))
    .filter(Boolean);

  if ('IntersectionObserver' in window && targets.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          links.forEach((l) =>
            l.classList.toggle('active', l.getAttribute('href') === `#${e.target.id}`)
          );
        });
      },
      { rootMargin: '-92px 0px -70% 0px', threshold: 0 }
    );
    targets.forEach((t) => spy.observe(t));
  }
})();