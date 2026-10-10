/* =====================================================================
   Shared data store for initiatives and lake stories (posts)
   ---------------------------------------------------------------------
   The public App page (initiatives.js, posts.js) and the Admin panel
   (admin.js) all read and write submissions through this one file.

   Where is the data kept?
   The site has no server yet, so everything is saved in the browser's
   localStorage. That means each browser has its own copy: a visitor
   sees their own submissions, and the admin panel reviews the ones
   saved in the browser it's opened in. To share data between everyone,
   only the `read()` and `write()` functions below need to change (for
   example, to call an online database such as Firebase or Supabase).

   Each item has a `status`:
     'pending'  = waiting for review (not public)
     'approved' = published
     'rejected' = never published
   ===================================================================== */
(function () {
  'use strict';

  const DAY = 86400000;
  const KEYS = {
    initiatives: 'lakeSentry.initiatives.v1',
    posts: 'lakeSentry.posts.v1',
    messages: 'lakeSentry.messages.v1',
  };

  // OPTIONAL: paste a form-endpoint URL here (for example a free Formspree
  // form, https://formspree.io/f/xxxxxxx) and every message sent from the
  // "Contact me" form is also emailed to you, from any visitor's device.
  // Leave it empty and messages stay in the visitor's own browser only.
  const CONTACT_ENDPOINT = '';

  // Example entries shown the first time the site is opened in a browser.
  const SAMPLES = {
    initiatives: [
      {
        id: 'sample-1', sample: true, status: 'approved',
        name: 'Example: Weekend shoreline clean-up',
        lake: 'durgam-cheruvu', organization: 'Example school eco-club', date: '',
        type: 'Clean-up drive',
        description: 'A sample entry showing what a published initiative looks like. Volunteers collect litter along the shoreline before it reaches the water.',
        participate: 'Replace this sample with a real initiative.', link: '',
        submittedAt: Date.now() - DAY * 6, reviewedAt: Date.now() - DAY * 5,
      },
      {
        id: 'sample-2', sample: true, status: 'pending',
        name: 'Example: Lakeside awareness walk',
        lake: 'hussain-sagar', organization: 'Example residents’ association', date: '',
        type: 'Awareness event',
        description: 'A sample entry waiting for review. Log in to the Admin panel to approve or reject it.',
        participate: '', link: '',
        submittedAt: Date.now() - DAY, reviewedAt: null,
      },
    ],
    posts: [
      {
        id: 'post-sample-1', sample: true, status: 'approved',
        author: 'Lake Sentry team', lake: 'hussain-sagar',
        title: 'Example: what a lake story looks like',
        text: 'This is a sample post. Share what you notice at a lake: floating waste, wildlife, a clean-up you joined, or an idea to keep it clean. Posts are reviewed before they appear here.',
        photos: [], likes: 3, liked: false,
        postedAt: Date.now() - DAY * 3, reviewedAt: Date.now() - DAY * 2,
      },
    ],
    messages: [],
  };

  function copy(list) { return list.map(function (x) { return Object.assign({}, x); }); }

  function read(kind) {
    try {
      const raw = localStorage.getItem(KEYS[kind]);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage blocked or broken: fall back to samples */ }
    return copy(SAMPLES[kind]);
  }

  // Returns false if the browser refused to save (e.g. storage is full).
  function write(kind, list) {
    let ok = true;
    try { localStorage.setItem(KEYS[kind], JSON.stringify(list)); } catch (e) { ok = false; }
    // Tell anything on the page that shows this data to redraw.
    document.dispatchEvent(new CustomEvent('lakesentry:' + kind + '-changed'));
    return ok;
  }

  window.LakeSentryStore = {
    read: read,
    write: write,
    reset: function (kind) { return write(kind, copy(SAMPLES[kind])); },
    // Change one item's status (approve / reject / restore).
    setStatus: function (kind, id, status) {
      const list = read(kind);
      const item = list.find(function (x) { return x.id === id; });
      if (!item) return null;
      item.status = status;
      item.reviewedAt = Date.now();
      write(kind, list);
      return item;
    },
    // Add a new item to the top of a list (used by the contact form).
    add: function (kind, item) {
      const list = read(kind);
      list.unshift(item);
      return write(kind, list);
    },
    contactEndpoint: CONTACT_ENDPOINT,
    remove: function (kind, id) {
      const list = read(kind).filter(function (x) { return x.id !== id; });
      write(kind, list);
    },
    lakeName: function (id) {
      const lake = (window.LAKE_SENTRY_LAKES || []).find(function (l) { return l.id === id; });
      return lake ? lake.name : 'Other lake';
    },
    formatDate: function (ts) {
      return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    },
  };
})();
