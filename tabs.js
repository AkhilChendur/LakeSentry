/* =====================================================================
   Accessible tabs (App page tools + Admin panel sections)
   ---------------------------------------------------------------------
   Markup:
     <div role="tablist" data-tabs>
       <button role="tab" id="tab-x" aria-controls="x" aria-selected="true">…
     </div>
     <section role="tabpanel" id="x" aria-labelledby="tab-x">…</section>

   - Click a tab, or use ← → / Home / End on the tab bar.
   - Links to "#x", or to anything inside panel x (e.g. app.html#map
     or #post-title), open the right tab automatically.
   - Other scripts can call LakeSentryTabs.show('x').
   ===================================================================== */
(function () {
  'use strict';

  const lists = document.querySelectorAll('[role="tablist"][data-tabs]');
  if (!lists.length) return;

  function tabsOf(list) { return Array.prototype.slice.call(list.querySelectorAll('[role="tab"]')); }

  function select(tab, opts) {
    opts = opts || {};
    const list = tab.closest('[role="tablist"]');
    tabsOf(list).forEach(function (t) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1; // only the active tab is in the Tab order
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (opts.focus) tab.focus();
    const id = tab.getAttribute('aria-controls');
    if (opts.updateUrl) history.replaceState(null, '', '#' + id);
    document.dispatchEvent(new CustomEvent('lakesentry:tab-changed', { detail: { panel: id } }));
  }

  lists.forEach(function (list) {
    const tabs = tabsOf(list);
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, { updateUrl: true }); });
      tab.addEventListener('keydown', function (e) {
        let next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, { focus: true, updateUrl: true }); }
      });
    });
    // Start with the tab that's already marked selected (or the first).
    select(tabs.find(function (t) { return t.getAttribute('aria-selected') === 'true'; }) || tabs[0]);
  });

  // Open the tab that contains the element with this id (if any).
  function showFor(id) {
    const target = id && document.getElementById(id);
    if (!target) return null;
    const panel = target.closest('[role="tabpanel"]');
    if (!panel) return null;
    const tab = document.querySelector('[role="tab"][aria-controls="' + panel.id + '"]');
    if (tab && tab.getAttribute('aria-selected') !== 'true') select(tab);
    return target;
  }

  window.LakeSentryTabs = { show: showFor };

  // Deep links: app.html#map, app.html#initiatives, #post-title …
  function fromHash(scroll) {
    const target = showFor(decodeURIComponent(location.hash.slice(1)));
    if (target && scroll) target.scrollIntoView({ block: 'start' });
  }
  fromHash(true);
  window.addEventListener('hashchange', function () { fromHash(true); });

  // In-page links to a hidden tab's content: switch tab first, then jump.
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const target = document.getElementById(id);
    if (!target || !target.closest('[role="tabpanel"]')) return;
    e.preventDefault();
    showFor(id);
    history.replaceState(null, '', '#' + id);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (target.matches('input, select, textarea, button, [tabindex]')) target.focus({ preventScroll: true });
  });
})();
