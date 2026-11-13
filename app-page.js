/* =====================================================================
   Lake Explorer page extras (app.html)
   - live numbers in the page intro and the map tab
   - the "Share a story" / "Submit an initiative" panels: open on big
     screens, folded away on phones until tapped
   - "N stories" counters next to each list
   ===================================================================== */
(function () {
  'use strict';
  const store = window.LakeSentryStore;
  const lakes = window.LAKE_SENTRY_LAKES || [];

  function setStat(key, value) {
    document.querySelectorAll('[data-stat="' + key + '"]').forEach(function (n) { n.textContent = String(value); });
  }
  function refreshStats() {
    if (!store) return;
    setStat('lakes', lakes.length);
    setStat('stories', store.read('posts').filter(function (p) { return p.status === 'approved'; }).length);
    setStat('initiatives', store.read('initiatives').filter(function (i) { return i.status === 'approved'; }).length);
    if (window.LAKE_SENTRY_WATER) setStat('water', window.LAKE_SENTRY_WATER.items.length);
  }
  refreshStats();
  document.addEventListener('lakesentry:posts-changed', refreshStats);
  document.addEventListener('lakesentry:initiatives-changed', refreshStats);

  /* ---------- Composer panels ---------- */
  const wide = window.matchMedia('(min-width: 1024px)');
  const composers = document.querySelectorAll('details.composer');
  function syncComposers() { composers.forEach(function (d) { if (wide.matches) d.open = true; }); }
  syncComposers();
  if (wide.addEventListener) wide.addEventListener('change', syncComposers);
  // On big screens the panel stays open (it's a side panel, not a fold-out).
  composers.forEach(function (d) {
    d.querySelector('summary').addEventListener('click', function (e) { if (wide.matches) e.preventDefault(); });
  });
  document.querySelectorAll('[data-open-composer]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const d = document.getElementById(btn.dataset.openComposer);
      if (!d) return;
      d.open = true;
      d.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      const first = d.querySelector('input:not([type=hidden]), select, textarea');
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 350);
    });
  });

  /* ---------- "N stories" counters ---------- */
  document.querySelectorAll('[data-count-of]').forEach(function (badge) {
    const list = document.getElementById(badge.dataset.countOf);
    if (!list) return;
    const update = function () { badge.textContent = String(list.querySelectorAll(':scope > li').length); };
    update();
    new MutationObserver(update).observe(list, { childList: true });
  });
})();
