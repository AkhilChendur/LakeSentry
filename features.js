/* =====================================================================
   Site features that admins can switch on or off
   ---------------------------------------------------------------------
   lakeDive: the 3D "Lake Dive" explorer (dive.html) and its menu links.

   To switch it OFF for everyone, change  lakeDive: true  to
   lakeDive: false  below and save (commit) this file. Vercel updates the
   live site in about a minute. Admins can still open dive.html while it
   is off; the public sees a "not available" message and no menu link.

   (The Admin panel → Settings shows the current state and the exact line
   to use. Without an online database the switch can't be flipped from the
   browser alone; see README.)
   ===================================================================== */
window.LAKE_SENTRY_FEATURES = {
  lakeDive: true,
};

(function () {
  'use strict';
  const f = window.LAKE_SENTRY_FEATURES;
  // An admin can preview "switched off" in their own browser only.
  let preview = {};
  try { preview = JSON.parse(localStorage.getItem('lakeSentry.featurePreview') || '{}'); } catch (e) { /* storage blocked */ }
  const on = f.lakeDive && preview.lakeDive !== false;
  document.documentElement.setAttribute('data-lakedive', on ? 'on' : 'off');
  window.LakeSentryFeatures = {
    isOn: function (name) { return name === 'lakeDive' ? on : !!f[name]; },
    publicValue: function (name) { return !!f[name]; },
    setPreview: function (name, value) {
      try {
        const p = JSON.parse(localStorage.getItem('lakeSentry.featurePreview') || '{}');
        if (value === null) delete p[name]; else p[name] = value;
        localStorage.setItem('lakeSentry.featurePreview', JSON.stringify(p));
      } catch (e) { /* storage blocked */ }
    },
    previewValue: function (name) { return preview[name]; },
  };
})();
