/* =====================================================================
   App page — Tool 3: Lake Initiative Network
   ---------------------------------------------------------------------
   Demonstrates the curated workflow:

       Submit  ->  Review  ->  Approve / Reject  ->  Publish

   - Visitors fill in the form. Submissions are NOT published straight
     away; they go into a "pending review" queue.
   - The review queue lets you play the part of the Lake Sentry team
     and approve or reject each one.
   - Approved initiatives appear in the public list (and on the lake's
     page in the map above).

   Where is the data stored?
   Because this site has no server, everything is saved in the
   browser's localStorage, so it survives a page refresh but only on
   this computer. On the real LakeSentry.in, submissions would be sent
   to a server and only admins would see the review queue.

   Security note: everything a visitor types is inserted with
   `textContent` (never `innerHTML`), so nobody can inject code.
   ===================================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'lakeSentry.initiatives.v1';
  const lakes = window.LAKE_SENTRY_LAKES || [];

  const ACTIVITY_TYPES = ['Clean-up drive', 'Awareness event', 'Restoration / planting', 'Monitoring / research', 'Other'];

  // Example entries shown the first time the page is opened.
  const SAMPLES = [
    {
      id: 'sample-1', sample: true, status: 'approved',
      name: 'Example: Weekend shoreline clean-up',
      lake: 'durgam-cheruvu', organization: 'Example school eco-club', date: '',
      type: 'Clean-up drive',
      description: 'A sample entry showing what a published initiative looks like. Volunteers collect litter along the shoreline before it reaches the water.',
      participate: 'Replace this sample with a real initiative.', link: '',
      submittedAt: Date.now() - 86400000 * 6, reviewedAt: Date.now() - 86400000 * 5,
    },
    {
      id: 'sample-2', sample: true, status: 'pending',
      name: 'Example: Lakeside awareness walk',
      lake: 'hussain-sagar', organization: 'Example residents’ association', date: '',
      type: 'Awareness event',
      description: 'A sample entry waiting in the review queue. Try approving or rejecting it to see the workflow.',
      participate: '', link: '',
      submittedAt: Date.now() - 86400000, reviewedAt: null,
    },
  ];

  /* ---------- Saving and loading ---------- */
  // localStorage can be blocked (e.g. private browsing), so every access
  // is wrapped in try/catch and we fall back to an in-memory list.
  let items = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore and use samples */ }
    return SAMPLES.map(function (s) { return Object.assign({}, s); });
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) { /* storage unavailable */ }
    // Let other parts of the page (the lake map) know things changed.
    document.dispatchEvent(new CustomEvent('lakesentry:initiatives-changed'));
  }

  // Public helper used by lake-map.js.
  window.LakeSentryInitiatives = {
    approvedFor: function (lakeId) {
      return items.filter(function (it) { return it.status === 'approved' && it.lake === lakeId; });
    },
  };

  function lakeName(id) {
    const lake = lakes.find(function (l) { return l.id === id; });
    return lake ? lake.name : 'Other / not listed';
  }

  /* ---------- Page elements ---------- */
  const form = document.getElementById('initiative-form');
  if (!form) return;
  const errorSummary = document.getElementById('init-errors');
  const successMsg = document.getElementById('init-success');
  const announcer = document.getElementById('init-status');
  const queueList = document.getElementById('review-queue');
  const queueEmpty = document.getElementById('review-empty');
  const queueCount = document.getElementById('review-count');
  const publishedList = document.getElementById('published-list');
  const publishedEmpty = document.getElementById('published-empty');
  const filterSelect = document.getElementById('published-filter');
  const rejectedList = document.getElementById('rejected-list');
  const rejectedCount = document.getElementById('rejected-count');
  const resetBtn = document.getElementById('init-reset');

  // Fill the lake drop-downs from lakes-data.js.
  function fillLakeOptions(select, firstLabel) {
    const first = document.createElement('option');
    first.value = '';
    first.textContent = firstLabel;
    select.appendChild(first);
    lakes.forEach(function (l) {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = l.name;
      select.appendChild(o);
    });
    const other = document.createElement('option');
    other.value = 'other';
    other.textContent = 'Other / not listed';
    select.appendChild(other);
  }
  fillLakeOptions(document.getElementById('init-lake'), 'Choose a lake…');
  fillLakeOptions(filterSelect, 'All lakes');

  const typeSelect = document.getElementById('init-type');
  ACTIVITY_TYPES.forEach(function (t) {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    typeSelect.appendChild(o);
  });

  /* ---------- Form validation ---------- */
  // Each rule returns an error message, or '' if the field is fine.
  const RULES = {
    'init-name': function (v) {
      if (!v) return 'Enter the name of the initiative.';
      if (v.length < 3) return 'The name must be at least 3 characters.';
      return '';
    },
    'init-lake': function (v) { return v ? '' : 'Choose the lake where the initiative takes place.'; },
    'init-type': function (v) { return v ? '' : 'Choose the type of activity.'; },
    'init-description': function (v) {
      if (!v) return 'Describe what the initiative does.';
      if (v.length < 20) return 'The description must be at least 20 characters (you have ' + v.length + ').';
      return '';
    },
    'init-link': function (v) {
      if (!v) return '';
      try {
        const u = new URL(v);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? '' : 'The link must start with http:// or https://';
      } catch (e) {
        return 'Enter a full web address, for example https://instagram.com/yourgroup';
      }
    },
  };

  function setFieldError(id, message) {
    const input = document.getElementById(id);
    const errorEl = document.getElementById(id + '-error');
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  // While the visitor fixes a field that was marked wrong, re-check it as
  // they type so the error disappears as soon as it's fixed. (Checking on
  // "blur" instead would shift the layout just as they click Submit.)
  Object.keys(RULES).forEach(function (id) {
    document.getElementById(id).addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid') === 'true') setFieldError(id, RULES[id](e.target.value.trim()));
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    successMsg.hidden = true;

    // Check every field and collect the problems.
    const problems = [];
    Object.keys(RULES).forEach(function (id) {
      const msg = RULES[id](document.getElementById(id).value.trim());
      setFieldError(id, msg);
      if (msg) problems.push({ id: id, msg: msg });
    });

    if (problems.length) {
      // Show an error summary with links to each problem, and move focus
      // to it so screen-reader users hear what needs fixing.
      const list = errorSummary.querySelector('ul');
      list.textContent = '';
      problems.forEach(function (p) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + p.id;
        a.textContent = p.msg;
        a.className = 'underline underline-offset-4';
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          document.getElementById(p.id).focus();
        });
        li.appendChild(a);
        list.appendChild(li);
      });
      errorSummary.hidden = false;
      errorSummary.focus();
      return;
    }
    errorSummary.hidden = true;

    const v = function (id) { return document.getElementById(id).value.trim(); };
    items.push({
      id: 'init-' + Date.now(),
      sample: false,
      status: 'pending',
      name: v('init-name'),
      lake: v('init-lake'),
      organization: v('init-org'),
      date: v('init-date'),
      type: v('init-type'),
      description: v('init-description'),
      participate: v('init-participate'),
      link: v('init-link'),
      submittedAt: Date.now(),
      reviewedAt: null,
    });
    save();
    render();
    form.reset();
    successMsg.hidden = false;
    successMsg.focus();
  });

  /* ---------- Rendering the lists ---------- */
  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Build one initiative "card". `actions` adds Approve/Reject buttons.
  function card(it, actions) {
    const li = document.createElement('li');
    li.className = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-lake-100';
    li.dataset.id = it.id;

    const top = document.createElement('div');
    top.className = 'flex flex-wrap items-center gap-2 text-xs font-semibold';
    const type = document.createElement('span');
    type.className = 'rounded-full bg-lake-100 px-3 py-1 text-lake-800';
    type.textContent = it.type;
    top.appendChild(type);
    if (it.status === 'approved') {
      const rev = document.createElement('span');
      rev.className = 'rounded-full bg-reed-100 px-3 py-1 text-reed-800';
      rev.textContent = '✓ Reviewed by Lake Sentry';
      top.appendChild(rev);
    }
    if (it.sample) {
      const s = document.createElement('span');
      s.className = 'rounded-full bg-sand-100 px-3 py-1 text-sand-800';
      s.textContent = 'Sample';
      top.appendChild(s);
    }

    const h = document.createElement('h4');
    h.className = 'mt-3 font-display text-xl font-semibold text-lake-950';
    h.textContent = it.name;

    const meta = document.createElement('p');
    meta.className = 'mt-1 text-sm text-slate-600';
    meta.textContent = [lakeName(it.lake), it.organization, it.date ? 'Date: ' + it.date : ''].filter(Boolean).join(' · ');

    const desc = document.createElement('p');
    desc.className = 'mt-3 text-slate-700';
    desc.textContent = it.description;

    li.append(top, h, meta, desc);

    if (it.participate) {
      const p = document.createElement('p');
      p.className = 'mt-2 text-sm text-slate-700';
      const b = document.createElement('strong');
      b.textContent = 'How to take part: ';
      p.append(b, document.createTextNode(it.participate));
      li.appendChild(p);
    }
    if (it.link) {
      const a = document.createElement('a');
      a.href = it.link; // already validated as http(s) when submitted
      a.rel = 'noopener noreferrer';
      a.className = 'mt-2 inline-block break-all text-sm font-semibold text-lake-700 underline underline-offset-4 hover:text-lake-900';
      a.textContent = it.link;
      li.appendChild(a);
    }

    const foot = document.createElement('p');
    foot.className = 'mt-3 text-xs text-slate-600';
    foot.textContent = 'Submitted ' + formatDate(it.submittedAt) + (it.reviewedAt ? ' · Reviewed ' + formatDate(it.reviewedAt) : '');
    li.appendChild(foot);

    if (actions) {
      const row = document.createElement('div');
      row.className = 'mt-4 flex flex-wrap gap-2';
      row.appendChild(actionButton('Approve', 'bg-reed-700 text-white hover:bg-reed-800', it, 'approved'));
      row.appendChild(actionButton('Reject', 'bg-white text-ink ring-1 ring-slate-400 hover:bg-slate-100', it, 'rejected'));
      li.appendChild(row);
    }
    return li;
  }

  function actionButton(label, classes, it, newStatus) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rounded-lg px-4 py-2 text-sm font-semibold ' + classes;
    b.textContent = label;
    // Give each button a unique accessible name, e.g. "Approve: Lakeside walk".
    b.setAttribute('aria-label', label + ': ' + it.name);
    b.addEventListener('click', function () { review(it.id, newStatus); });
    return b;
  }

  function review(id, status) {
    const it = items.find(function (x) { return x.id === id; });
    if (!it) return;
    it.status = status;
    it.reviewedAt = Date.now();
    save();
    render();
    announcer.textContent = '“' + it.name + '” was ' + (status === 'approved' ? 'approved and published.' : 'rejected and will not be published.');
    // Keep keyboard focus somewhere sensible: the next item in the queue,
    // or the queue heading if the queue is now empty.
    const nextBtn = queueList.querySelector('button');
    (nextBtn || document.getElementById('review-title')).focus();
  }

  function render() {
    // Review queue (pending)
    const pending = items.filter(function (it) { return it.status === 'pending'; });
    queueList.textContent = '';
    pending.forEach(function (it) { queueList.appendChild(card(it, true)); });
    queueEmpty.hidden = pending.length > 0;
    queueCount.textContent = String(pending.length);

    // Published (approved), optionally filtered by lake
    const filter = filterSelect.value;
    const approved = items
      .filter(function (it) { return it.status === 'approved' && (!filter || it.lake === filter); })
      .sort(function (a, b) { return b.reviewedAt - a.reviewedAt; });
    publishedList.textContent = '';
    approved.forEach(function (it) { publishedList.appendChild(card(it, false)); });
    publishedEmpty.hidden = approved.length > 0;

    // Rejected
    const rejected = items.filter(function (it) { return it.status === 'rejected'; });
    rejectedList.textContent = '';
    rejected.forEach(function (it) { rejectedList.appendChild(card(it, false)); });
    rejectedCount.textContent = String(rejected.length);
  }

  filterSelect.addEventListener('change', render);

  resetBtn.addEventListener('click', function () {
    if (!window.confirm('Reset the demo? This removes everything you submitted and restores the sample entries.')) return;
    items = SAMPLES.map(function (s) { return Object.assign({}, s); });
    save();
    render();
    announcer.textContent = 'Demo data reset.';
  });

  render();
})();
