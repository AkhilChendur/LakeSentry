/* =====================================================================
   App page — Initiative network (public side)
   ---------------------------------------------------------------------
   Visitors submit a lake clean-up or conservation initiative. It is
   NOT published straight away: it waits for the Lake Sentry team to
   approve it in the Admin panel (admin.html):

       Submit  ->  Review (admin)  ->  Approve / Reject  ->  Published

   This page shows the form and the list of published initiatives.
   Data is saved through store.js; cards are drawn by cards.js.
   ===================================================================== */
(function () {
  'use strict';

  const store = window.LakeSentryStore;
  const cards = window.LakeSentryCards;
  const lakes = window.LAKE_SENTRY_LAKES || [];
  const ACTIVITY_TYPES = ['Clean-up drive', 'Awareness event', 'Restoration / planting', 'Monitoring / research', 'Other'];

  // Used by lake-map.js to list a lake's published initiatives.
  window.LakeSentryInitiatives = {
    approvedFor: function (lakeId) {
      return store.read('initiatives').filter(function (it) { return it.status === 'approved' && it.lake === lakeId; });
    },
  };

  const $ = function (id) { return document.getElementById(id); };
  const form = $('initiative-form');
  if (!form) return;
  const errorSummary = $('init-errors');
  const successMsg = $('init-success');
  const publishedList = $('published-list');
  const publishedEmpty = $('published-empty');
  const filterSelect = $('published-filter');

  // Fill the lake drop-downs from lakes-data.js.
  function fillLakeOptions(select, firstLabel) {
    const first = document.createElement('option');
    first.value = ''; first.textContent = firstLabel;
    select.appendChild(first);
    lakes.forEach(function (l) {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = l.name;
      select.appendChild(o);
    });
    const other = document.createElement('option');
    other.value = 'other'; other.textContent = 'Other / not listed';
    select.appendChild(other);
  }
  fillLakeOptions($('init-lake'), 'Choose a lake…');
  fillLakeOptions(filterSelect, 'All lakes');
  ACTIVITY_TYPES.forEach(function (t) {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    $('init-type').appendChild(o);
  });

  /* ---------- Form validation ---------- */
  // Each rule returns an error message, or '' if the field is fine.
  const RULES = {
    'init-name': function (v) {
      if (!v) return 'Enter the name of the initiative.';
      return v.length < 3 ? 'The name must be at least 3 characters.' : '';
    },
    'init-lake': function (v) { return v ? '' : 'Choose the lake where the initiative takes place.'; },
    'init-type': function (v) { return v ? '' : 'Choose the type of activity.'; },
    'init-description': function (v) {
      if (!v) return 'Describe what the initiative does.';
      return v.length < 20 ? 'The description must be at least 20 characters (you have ' + v.length + ').' : '';
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
    const input = $(id);
    const errorEl = $(id + '-error');
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

  // Clear an error as the visitor fixes it. (Checking on "blur" instead
  // would shift the layout just as they click Submit.)
  Object.keys(RULES).forEach(function (id) {
    $(id).addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid') === 'true') setFieldError(id, RULES[id](e.target.value.trim()));
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    successMsg.hidden = true;

    const problems = [];
    Object.keys(RULES).forEach(function (id) {
      const msg = RULES[id]($(id).value.trim());
      setFieldError(id, msg);
      if (msg) problems.push({ id: id, msg: msg });
    });

    if (problems.length) {
      // Error summary with links to each problem; focus moves to it so
      // screen-reader users hear what needs fixing.
      const list = errorSummary.querySelector('ul');
      list.textContent = '';
      problems.forEach(function (p) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + p.id;
        a.textContent = p.msg;
        a.className = 'text-coral underline underline-offset-4';
        a.addEventListener('click', function (ev) { ev.preventDefault(); $(p.id).focus(); });
        li.appendChild(a);
        list.appendChild(li);
      });
      errorSummary.hidden = false;
      errorSummary.focus();
      return;
    }
    errorSummary.hidden = true;

    const v = function (id) { return $(id).value.trim(); };
    const list = store.read('initiatives');
    list.push({
      id: 'init-' + Date.now(), sample: false, status: 'pending',
      name: v('init-name'), lake: v('init-lake'), organization: v('init-org'), date: v('init-date'),
      type: v('init-type'), description: v('init-description'), participate: v('init-participate'), link: v('init-link'),
      submittedAt: Date.now(), reviewedAt: null,
    });
    store.write('initiatives', list);
    form.reset();
    successMsg.hidden = false;
    successMsg.focus();
  });

  /* ---------- Published list ---------- */
  function render() {
    const filter = filterSelect.value;
    const approved = store.read('initiatives')
      .filter(function (it) { return it.status === 'approved' && (!filter || it.lake === filter); })
      .sort(function (a, b) { return b.reviewedAt - a.reviewedAt; });
    publishedList.textContent = '';
    approved.forEach(function (it) { publishedList.appendChild(cards.initiativeCard(it)); });
    publishedEmpty.hidden = approved.length > 0;
  }

  filterSelect.addEventListener('change', render);
  document.addEventListener('lakesentry:initiatives-changed', render);
  render();
})();
