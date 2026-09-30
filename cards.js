/* =====================================================================
   Shared "card" builders for initiatives and lake stories
   ---------------------------------------------------------------------
   Used by the public App page (initiatives.js, posts.js) and by the
   Admin panel (admin.js), so a submission looks the same everywhere.

   Each builder takes the item plus an optional list of buttons:
       { label, classes, ariaLabel, onClick }

   Everything visitors typed is inserted with textContent (never
   innerHTML), so nobody can inject code into the page.
   ===================================================================== */
(function () {
  'use strict';

  const store = window.LakeSentryStore;

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function tag(text, colour) {
    return el('span', 'rounded-full border px-3 py-1 font-mono ' + colour, text);
  }

  function statusTag(item) {
    if (item.status === 'approved') return tag('✓ Published', 'border-mint/50 text-mint');
    if (item.status === 'rejected') return tag('✕ Rejected', 'border-coral/60 text-coral');
    return tag('⏳ Waiting for review', 'border-sun/50 text-sun');
  }

  function buttonRow(actions) {
    const row = el('div', 'mt-4 flex flex-wrap items-center gap-2');
    (actions || []).forEach(function (a) {
      const b = el('button', 'rounded-md px-4 py-2 text-sm font-semibold transition ' + a.classes, a.label);
      b.type = 'button';
      if (a.ariaLabel) b.setAttribute('aria-label', a.ariaLabel);
      if (a.pressed != null) b.setAttribute('aria-pressed', String(a.pressed));
      if (a.data) Object.keys(a.data).forEach(function (k) { b.dataset[k] = a.data[k]; });
      b.addEventListener('click', a.onClick);
      row.appendChild(b);
    });
    return row;
  }

  /* ---------- Initiative card ---------- */
  function initiativeCard(it, opts) {
    opts = opts || {};
    const li = el('li', 'glow-card rounded-2xl border border-line bg-panel p-5');
    li.dataset.id = it.id;

    const tags = el('p', 'flex flex-wrap items-center gap-2 text-xs');
    tags.appendChild(tag(it.type, 'border-aqua/50 text-aqua'));
    if (opts.showStatus) tags.appendChild(statusTag(it));
    else if (it.status === 'approved') tags.appendChild(tag('✓ Reviewed by Lake Sentry', 'border-mint/50 text-mint'));
    if (it.sample) tags.appendChild(tag('Sample', 'border-sun/50 text-sun'));

    const meta = [store.lakeName(it.lake), it.organization, it.date ? 'Date: ' + it.date : ''].filter(Boolean).join(' · ');
    li.append(tags, el('h4', 'mt-3 font-display text-xl font-bold text-txt-1', it.name),
      el('p', 'mt-1 text-sm text-txt-3', meta), el('p', 'mt-3', it.description));

    if (it.participate) {
      const p = el('p', 'mt-2 text-sm');
      p.append(el('strong', 'text-txt-1', 'How to take part: '), document.createTextNode(it.participate));
      li.appendChild(p);
    }
    if (it.link) {
      const a = el('a', 'mt-2 inline-block break-all text-sm font-semibold text-aqua underline underline-offset-4 hover:text-mint', it.link);
      a.href = it.link; // only http(s) links are accepted by the form
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
    }
    li.appendChild(el('p', 'mt-3 font-mono text-xs text-txt-3',
      'Submitted ' + store.formatDate(it.submittedAt) + (it.reviewedAt ? ' · Reviewed ' + store.formatDate(it.reviewedAt) : '')));
    if (opts.actions) li.appendChild(buttonRow(opts.actions));
    return li;
  }

  /* ---------- Lake story (post) card ---------- */
  function postCard(p, opts) {
    opts = opts || {};
    const li = el('li', 'glow-card overflow-hidden rounded-2xl border border-line bg-panel');
    li.dataset.id = p.id;

    // Photos: one big photo, or a small grid when there are several.
    if (p.photos && p.photos.length) {
      const gallery = el('div', 'grid gap-0.5 bg-deep ' + (p.photos.length > 1 ? 'grid-cols-2' : ''));
      p.photos.forEach(function (ph, i) {
        const img = el('img', 'w-full object-cover ' + (p.photos.length === 3 && i === 0 ? 'col-span-2 aspect-[2/1]' : 'aspect-[4/3]'));
        img.src = ph.src;
        img.alt = ph.alt;
        img.loading = 'lazy';
        gallery.appendChild(img);
      });
      li.appendChild(gallery);
    }

    const body = el('div', 'p-5');
    const tags = el('p', 'flex flex-wrap gap-2 text-xs');
    tags.appendChild(tag('📍 ' + store.lakeName(p.lake), 'border-aqua/50 text-aqua'));
    if (opts.showStatus) tags.appendChild(statusTag(p));
    else if (p.status === 'approved') tags.appendChild(tag('✓ Reviewed', 'border-mint/50 text-mint'));
    if (p.sample) tags.appendChild(tag('Sample', 'border-sun/50 text-sun'));
    body.append(tags,
      el('h4', 'mt-3 font-display text-xl font-bold text-txt-1', p.title),
      el('p', 'mt-1 font-mono text-xs text-txt-3', 'By ' + p.author + ' · ' + store.formatDate(p.postedAt)),
      el('p', 'mt-3 whitespace-pre-line', p.text));
    if (opts.actions) body.appendChild(buttonRow(opts.actions));
    li.appendChild(body);
    return li;
  }

  window.LakeSentryCards = { initiativeCard: initiativeCard, postCard: postCard };
})();
