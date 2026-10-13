/* =====================================================================
   Lake Dive page setup (dive.html)
   - Respects the admin on/off switch (features.js)
   - Opens the disclaimer pop-up
   - Loads the 3D scene (three.min.js + dive.js) only when it's switched on
   ===================================================================== */
(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };

  /* ---------- Disclaimer pop-up (same text as the section at the bottom) ---------- */
  const dlg = $('disclaimer-dialog');
  dlg.querySelector('[data-disclaimer-copy]').innerHTML = $('disclaimer-text').innerHTML;
  let opener = null;
  document.querySelectorAll('[data-open-disclaimer]').forEach(function (b) {
    b.addEventListener('click', function () { opener = b; dlg.showModal(); dlg.querySelector('[data-close-disclaimer]').focus(); });
  });
  dlg.querySelector('[data-close-disclaimer]').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', function () { if (opener) opener.focus(); });

  /* ---------- On / off ---------- */
  const features = window.LakeSentryFeatures;
  const adminOnly = document.body.hasAttribute('data-admin-only');
  const on = adminOnly ? false : (!features || features.isOn('lakeDive'));
  const isAdmin = window.LakeSentryAdmin && window.LakeSentryAdmin.isLoggedIn();
  if (!on && !isAdmin) {
    document.body.classList.add('dive-is-off');
    $('dive-off').hidden = false;
    return; // nothing else loads
  }
  if (!on && !adminOnly) $('dive-admin-note').hidden = false;

  /* ---------- Load the 3D scene ---------- */
  document.body.classList.add('dive-js');
  function load(src, done) {
    const s = document.createElement('script');
    s.src = src; s.onload = done;
    s.onerror = function () { $('dive-fallback').hidden = false; $('dive-loader').hidden = true; };
    document.body.appendChild(s);
  }
  load('three.min.js', function () { load('dive.js', function () {}); });
})();
