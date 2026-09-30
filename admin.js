/* =====================================================================
   Admin panel (admin.html)
   ---------------------------------------------------------------------
   - Logged out: shows a login form.
   - Logged in: tabs for Dashboard, Initiatives, Lake stories, Settings.
     Approve or reject submissions, unpublish or delete published ones,
     and restore rejected ones.

   Submissions come from store.js (the same place the public App page
   saves them). Without a server they live in this browser only, so
   this panel shows the submissions made in this browser.
   ===================================================================== */
(function () {
  'use strict';

  const store = window.LakeSentryStore;
  const cards = window.LakeSentryCards;
  const admin = window.LakeSentryAdmin;
  const $ = function (id) { return document.getElementById(id); };
  const loginSection = $('admin-login');
  const panel = $('admin-panel');
  const status = $('admin-status');
  if (!loginSection || !panel) return;

  function announce(msg) { status.textContent = msg; }

  /* ---------- Logged in or out? ---------- */
  function showState() {
    const on = admin.isLoggedIn();
    loginSection.hidden = on;
    panel.hidden = !on;
    if (on) render();
  }
  document.addEventListener('lakesentry:admin-changed', showState);

  /* ---------- Login form ---------- */
  const loginForm = $('admin-login-form');
  const pw = $('admin-login-password');
  const loginError = $('admin-login-form-error');
  $('admin-login-show').addEventListener('click', function (e) {
    const visible = pw.type === 'password';
    pw.type = visible ? 'text' : 'password';
    e.currentTarget.textContent = visible ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-pressed', String(visible));
    pw.focus();
  });
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!pw.value) {
      loginError.textContent = 'Enter the admin password.';
      pw.setAttribute('aria-invalid', 'true');
      pw.focus();
      return;
    }
    if (await admin.login(pw.value)) {
      pw.value = '';
      loginError.textContent = '';
      pw.removeAttribute('aria-invalid');
      showState();
      $('admin-panel-title').focus();
      announce('Logged in.');
    } else {
      loginError.textContent = 'That password isn’t right. Please try again.';
      pw.setAttribute('aria-invalid', 'true');
      pw.select();
    }
  });

  /* ---------- Review actions ---------- */
  const LABELS = { initiatives: 'initiative', posts: 'story' };

  function titleOf(item) { return item.name || item.title; }

  function act(kind, item, action, listEl) {
    const name = '“' + titleOf(item) + '”';
    if (action === 'delete') {
      if (!window.confirm('Delete ' + name + ' permanently? This can’t be undone.')) return;
      store.remove(kind, item.id);
      announce(name + ' was deleted.');
    } else {
      store.setStatus(kind, item.id, action);
      announce(name + {
        approved: ' was approved and is now published.',
        rejected: ' was rejected and will not be published.',
        pending: ' was moved back to “waiting for review”.',
      }[action]);
    }
    // store.write() fires a change event that redraws; then keep focus
    // somewhere sensible (the next item in the same list, or its heading).
    render();
    const next = listEl.querySelector('button');
    (next || $(listEl.getAttribute('aria-labelledby'))).focus();
  }

  function actionsFor(kind, item, listEl) {
    const n = titleOf(item);
    const b = function (label, classes, action) {
      return { label: label, classes: classes, ariaLabel: label + ': ' + n, onClick: function () { act(kind, item, action, listEl); } };
    };
    const del = b('Delete', 'border border-coral/70 text-coral hover:bg-coral/10', 'delete');
    if (item.status === 'pending') {
      return [b('Approve', 'bg-mint text-[#00251A] hover:-translate-y-0.5', 'approved'),
              b('Reject', 'border border-coral/70 text-coral hover:bg-coral/10', 'rejected')];
    }
    if (item.status === 'approved') return [b('Unpublish', 'border border-linehi text-txt-1 hover:border-sun hover:text-sun', 'pending'), del];
    return [b('Move back to review', 'border border-linehi text-txt-1 hover:border-aqua hover:text-aqua', 'pending'), del];
  }

  /* ---------- Drawing the lists ---------- */
  function fillList(kind, statusName, listId, emptyText) {
    const listEl = $(listId);
    const items = store.read(kind)
      .filter(function (x) { return x.status === statusName; })
      .sort(function (a, b) { return (b.submittedAt || b.postedAt) - (a.submittedAt || a.postedAt); });
    listEl.textContent = '';
    items.forEach(function (item) {
      const card = kind === 'posts' ? cards.postCard : cards.initiativeCard;
      listEl.appendChild(card(item, { showStatus: true, actions: actionsFor(kind, item, listEl) }));
    });
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'rounded-xl border border-dashed border-line px-4 py-3 text-txt-3';
      li.textContent = emptyText;
      listEl.appendChild(li);
    }
    // Show the count next to the list heading.
    const count = document.querySelector('[data-list-count="' + listId + '"]');
    if (count) count.textContent = String(items.length);
    return items.length;
  }

  function render() {
    if (panel.hidden) return;
    const pi = fillList('initiatives', 'pending', 'adm-init-pending', 'Nothing waiting for review.');
    const ai = fillList('initiatives', 'approved', 'adm-init-approved', 'No published initiatives.');
    const ri = fillList('initiatives', 'rejected', 'adm-init-rejected', 'No rejected initiatives.');
    const pp = fillList('posts', 'pending', 'adm-post-pending', 'Nothing waiting for review.');
    const ap = fillList('posts', 'approved', 'adm-post-approved', 'No published stories.');
    fillList('posts', 'rejected', 'adm-post-rejected', 'No rejected stories.');

    // Badges on the tabs + dashboard numbers
    document.querySelectorAll('[data-badge="initiatives"]').forEach(function (b) { b.textContent = String(pi); b.hidden = pi === 0; });
    document.querySelectorAll('[data-badge="posts"]').forEach(function (b) { b.textContent = String(pp); b.hidden = pp === 0; });
    const photos = store.read('posts').reduce(function (n, p) { return n + (p.photos ? p.photos.length : 0); }, 0);
    const stats = { 'stat-init-pending': pi, 'stat-post-pending': pp, 'stat-init-approved': ai, 'stat-post-approved': ap, 'stat-photos': photos, 'stat-init-rejected': ri };
    Object.keys(stats).forEach(function (id) { if ($(id)) $(id).textContent = String(stats[id]); });
    $('dash-summary').textContent = (pi + pp) === 0
      ? 'You’re all caught up. Nothing is waiting for review.'
      : (pi + pp) + ' submission' + ((pi + pp) === 1 ? ' is' : 's are') + ' waiting for your review.';
  }

  document.addEventListener('lakesentry:initiatives-changed', render);
  document.addEventListener('lakesentry:posts-changed', render);

  /* ---------- Settings: new password ---------- */
  $('pw-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const a = $('pw-new').value;
    const b = $('pw-confirm').value;
    const err = $('pw-error');
    const out = $('pw-output');
    out.hidden = true;
    if (a.length < 10) { err.textContent = 'Use at least 10 characters.'; $('pw-new').focus(); return; }
    if (a !== b) { err.textContent = 'The two passwords don’t match.'; $('pw-confirm').focus(); return; }
    err.textContent = '';
    $('pw-code').textContent = "const PASSWORD_HASH = '" + (await admin.sha256(a)) + "';";
    out.hidden = false;
    $('pw-output-title').focus();
  });
  $('pw-copy').addEventListener('click', function () {
    const text = $('pw-code').textContent;
    const done = function () { announce('Copied.'); $('pw-copy').textContent = 'Copied ✓'; };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { announce('Select the line and copy it manually.'); });
  });

  /* ---------- Settings: reset + log out ---------- */
  $('reset-initiatives').addEventListener('click', function () {
    if (!window.confirm('Delete all initiatives saved in this browser and restore the samples?')) return;
    store.reset('initiatives');
    announce('Initiatives reset.');
  });
  $('reset-posts').addEventListener('click', function () {
    if (!window.confirm('Delete all lake stories (and photos) saved in this browser and restore the sample?')) return;
    store.reset('posts');
    announce('Lake stories reset.');
  });
  function logOut() {
    admin.logout();
    announce('Logged out.');
    pw.focus();
  }
  $('admin-logout').addEventListener('click', logOut);
  document.querySelectorAll('[data-logout]').forEach(function (btn) { btn.addEventListener('click', logOut); });

  showState();
})();
