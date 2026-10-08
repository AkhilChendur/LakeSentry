/* =====================================================================
   Lake Explorer — Lake map and lake reports
   ---------------------------------------------------------------------
   - Draws a simple schematic map of Hyderabad as an SVG, with one
     clickable shape per lake from lakes-data.js. (Lakes without a map
     position are listed next to the map instead.)
   - Hovering or focusing a lake shows its name in a tooltip.
   - Clicking a lake (or pressing Enter/Space on it, or using the list
     next to the map) opens that lake's full REPORT below the map:
       overview, figures with sources, ongoing / upcoming initiatives,
       field notes, photos, visitor stories and sources.
   - Reports combine two kinds of information:
       1. Curated facts from lakes-data.js (you edit these)
       2. Live data from the site: published initiatives (initiatives
          submitted by visitors and approved in the Admin panel) and
          approved visitor stories.
   - Every lake has a shareable link:  app.html?lake=hussain-sagar#map

   Keyboard: Tab moves between lakes; Enter or Space opens one.
   ===================================================================== */
(function () {
  'use strict';

  const lakes = window.LAKE_SENTRY_LAKES || [];
  const SOURCES = window.LAKE_SENTRY_SOURCES || {};
  const FURTHER = window.LAKE_SENTRY_FURTHER_READING || [];
  const MAP_SOURCES = window.LAKE_SENTRY_MAP_SOURCES || [];
  const store = window.LakeSentryStore;
  const cards = window.LakeSentryCards;
  const mapBox = document.getElementById('lake-map');
  const listBox = document.getElementById('lake-list');
  const detailBox = document.getElementById('lake-detail');
  const statusEl = document.getElementById('lake-status');
  const tooltip = document.getElementById('lake-tooltip');
  if (!mapBox || !listBox || !detailBox || !lakes.length) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VIEW_W = 800, VIEW_H = 600;
  // The map's edges in degrees of longitude (x) and latitude (y).
  const BOUNDS = { west: 78.26, east: 78.52, south: 17.28, north: 17.52 };

  let selectedId = null;

  /* ---------- Helpers ---------- */
  // Convert latitude/longitude to x/y inside the SVG.
  function project(lat, lon) {
    return {
      x: ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * VIEW_W,
      y: ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * VIEW_H,
    };
  }

  function el(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text) node.textContent = text;
    return node;
  }

  // Tiny "random" number generator that always gives the same numbers
  // for the same lake id — so each lake keeps the same shape.
  function seededRandom(seedText) {
    let h = 2166136261;
    for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
    return function () {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }

  // Build an organic, blobby lake outline around (cx, cy).
  function lakePath(cx, cy, radius, seed) {
    const rnd = seededRandom(seed);
    const n = 9;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = radius * (0.72 + rnd() * 0.5);
      pts.push([cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r]);
    }
    // Smooth the points into curves (Catmull-Rom -> Bezier).
    let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ' C' + c1.map(function (v) { return v.toFixed(1); }).join(' ') + ' ' +
        c2.map(function (v) { return v.toFixed(1); }).join(' ') + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d + 'Z';
  }

  /* ---------- 1. Draw the map ---------- */
  function buildMap() {
    const svg = el('svg', {
      viewBox: '0 0 ' + VIEW_W + ' ' + VIEW_H,
      class: 'h-auto w-full',
      role: 'group',
      'aria-labelledby': 'lake-map-title',
    });

    // Background, rivers and area names are decoration only.
    const bg = el('g', { 'aria-hidden': 'true' });
    bg.appendChild(el('rect', { width: VIEW_W, height: VIEW_H, style: 'fill: rgb(var(--deep2))' }));
    // faint grid
    for (let x = 50; x < VIEW_W; x += 50) bg.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: VIEW_H, style: 'stroke: var(--line)', 'stroke-width': 1 }));
    for (let y = 50; y < VIEW_H; y += 50) bg.appendChild(el('line', { x1: 0, y1: y, x2: VIEW_W, y2: y, style: 'stroke: var(--line)', 'stroke-width': 1 }));
    // Musi river (runs west -> east through the city) and the Esi river
    bg.appendChild(el('path', { d: 'M150 372 C230 360 260 330 330 335 S470 350 540 340 S650 330 700 345 S770 360 800 352', fill: 'none', stroke: '#1E5C94', 'stroke-width': 7, 'stroke-linecap': 'round' }));
    bg.appendChild(el('path', { d: 'M340 490 C380 440 430 400 470 350', fill: 'none', stroke: '#1E5C94', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    bg.appendChild(el('text', { x: 560, y: 368, style: 'fill: rgb(var(--txt3))', 'font-size': 14, 'font-style': 'italic' }, 'Musi river'));
    // Area names
    [['Gachibowli', 230, 190], ['Kukatpally', 520, 118], ['Secunderabad', 690, 170], ['Old City', 640, 430]].forEach(function (a) {
      bg.appendChild(el('text', { x: a[1], y: a[2], style: 'fill: rgb(var(--txt3))', 'font-size': 13, 'font-family': 'IBM Plex Mono, monospace', 'letter-spacing': '0.08em' }, a[0].toUpperCase()));
    });
    // Compass
    const compass = el('g', { transform: 'translate(752 56)' });
    compass.appendChild(el('circle', { r: 24, style: 'fill: rgb(var(--panel)); stroke: rgb(var(--aqua))', 'stroke-width': 1.5 }));
    compass.appendChild(el('path', { d: 'M0 -16 L7 6 L0 2 L-7 6 Z', style: 'fill: rgb(var(--aqua))' }));
    compass.appendChild(el('text', { y: 18, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, style: 'fill: rgb(var(--txt2))' }, 'N'));
    bg.appendChild(compass);
    svg.appendChild(bg);

    // Lakes — biggest first so small lakes are drawn on top.
    lakes.filter(function (l) { return l.lat != null && l.lon != null; })
      .sort(function (a, b) { return b.size - a.size; }).forEach(function (lake) {
      const p = project(lake.lat, lake.lon);
      const g = el('g', {
        class: 'map-lake',
        role: 'button',
        tabindex: '0',
        'aria-pressed': 'false',
        'data-id': lake.id,
        'aria-label': lake.name + ' — ' + lake.area,
      });
      g.appendChild(el('path', {
        class: 'lake-shape' + (lake.positionUnknown ? ' is-guess' : ''),
        d: lakePath(p.x, p.y, 10 + lake.size * 12, lake.id),
        'stroke-width': 1.5,
      }));
      // Lakes we hold data on get a gently pulsing ring.
      if (lake.status === 'documented') {
        g.appendChild(el('circle', { class: 'pulse-ring', cx: p.x, cy: p.y, r: 10 + lake.size * 10, fill: 'none', style: 'stroke: rgb(var(--mint))', 'stroke-width': 2, 'aria-hidden': 'true' }));
      }
      // Label with a dark "halo" so it stays readable over anything.
      g.appendChild(el('text', {
        class: 'lake-label',
        x: p.x + (lake.labelDx || 0),
        y: p.y + (lake.labelDy || 0),
        'text-anchor': 'middle',
        'font-size': 15,
        'font-weight': 600,
        style: 'fill: rgb(var(--txt1)); stroke: rgb(var(--ink))',
        'stroke-width': 4,
        'paint-order': 'stroke',
      }, lake.name.replace(/ \(.*\)/, '')));

      g.addEventListener('click', function () { selectLake(lake.id, { scroll: true }); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLake(lake.id, { scroll: true }); }
      });
      g.addEventListener('mouseenter', function () { showTooltip(lake, g); });
      g.addEventListener('focus', function () { showTooltip(lake, g); });
      g.addEventListener('mouseleave', hideTooltip);
      g.addEventListener('blur', hideTooltip);
      svg.appendChild(g);
    });

    mapBox.appendChild(svg);
  }

  /* ---------- 2. Tooltip on hover / focus ---------- */
  function showTooltip(lake, g) {
    if (!tooltip) return;
    const box = mapBox.getBoundingClientRect();
    const r = g.querySelector('.lake-shape').getBoundingClientRect();
    tooltip.querySelector('[data-name]').textContent = lake.name;
    tooltip.querySelector('[data-area]').textContent = lake.area;
    tooltip.hidden = false;
    // Centre the tooltip above the lake, but keep it inside the map.
    const left = Math.min(Math.max(8, r.left - box.left + r.width / 2 - tooltip.offsetWidth / 2), box.width - tooltip.offsetWidth - 8);
    const top = Math.max(8, r.top - box.top - tooltip.offsetHeight - 10);
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }
  function hideTooltip() { if (tooltip) tooltip.hidden = true; }

  /* ---------- 3. The list of lakes (also the keyboard-friendly way in) ---------- */
  // What each lake's "status" badge says.
  const STATUS = {
    documented: { label: 'Data on file', cls: 'border border-mint/50 text-mint' },
    listed: { label: 'No data yet', cls: 'border border-sun/50 text-sun' },
  };

  function buildList() {
    lakes.forEach(function (lake) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = lake.id;
      btn.setAttribute('aria-pressed', 'false');
      btn.className = 'flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-left text-txt-1 transition hover:translate-x-1 hover:border-aqua aria-pressed:border-aqua aria-pressed:bg-aqua/15';
      const text = el2('span', 'min-w-0');
      text.append(el2('span', 'block font-semibold', lake.name));
      text.append(el2('span', 'block truncate text-xs text-txt-3', lake.lat == null ? lake.area + ' · not shown on the map' : lake.area));
      const st = STATUS[lake.status] || STATUS.listed;
      btn.append(text, el2('span', 'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ' + st.cls, st.label));
      btn.addEventListener('click', function () { selectLake(lake.id, { scroll: true }); });
      li.appendChild(btn);
      listBox.appendChild(li);
    });
  }

  /* ---------- 4. The lake report ---------- */
  // Small helper: make an HTML element with classes and (safe) text.
  function el2(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function isTodo(text) { return !text || /^TODO/i.test(text); }
  function pad(n) { return String(n).padStart(2, '0'); }

  // The sources cited while building the current report.
  let cited = new Set();

  function externalLink(href, text) {
    const a = el2('a', 'underline underline-offset-2 hover:text-aqua', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.append(el2('span', 'sr-only', ' (opens in a new tab)'));
    return a;
  }

  // "Source: …" line under a figure or finding.
  function sourceLine(id, cls) {
    const p = el2('p', cls || 'mt-2 text-xs text-txt-3');
    const src = SOURCES[id];
    if (!src) { p.textContent = 'Source to be added'; return p; }
    cited.add(id);
    p.append('Source: ');
    p.append(src.url ? externalLink(src.url, src.name) : document.createTextNode(src.name));
    return p;
  }

  // A report section: heading + content.
  function section(id, title, intro) {
    const sec = el2('section', 'border-t border-line pt-8');
    sec.id = id;
    sec.setAttribute('aria-labelledby', id + '-title');
    const h = el2('h4', 'font-display text-2xl font-bold text-txt-1', title);
    h.id = id + '-title';
    sec.appendChild(h);
    if (intro) sec.appendChild(el2('p', 'mt-1 text-sm text-txt-3', intro));
    return sec;
  }

  // Paragraph that turns "TODO: ..." into a friendly "To be added" note.
  function textBlock(label, text) {
    const wrap = el2('div');
    wrap.appendChild(el2('h5', 'font-mono text-xs uppercase tracking-wider text-aqua', label));
    wrap.appendChild(isTodo(text)
      ? el2('p', 'mt-1 italic text-txt-3', 'To be added: ' + String(text || '').replace(/^TODO:?\s*/i, ''))
      : el2('p', 'mt-1', text));
    return wrap;
  }

  // Initiatives for a lake: curated ones from lakes-data.js plus every
  // approved one from the initiative network. Timing is worked out from
  // the date: no date = ongoing, future date = upcoming, past = past.
  function initiativesFor(lake) {
    const now = new Date();
    const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    const items = (lake.initiatives || []).map(function (i) { return Object.assign({ community: false }, i); });
    store.read('initiatives')
      .filter(function (x) { return x.status === 'approved' && x.lake === lake.id; })
      .forEach(function (x) {
        items.push({
          community: true, sample: x.sample, name: x.name, organization: x.organization, date: x.date,
          description: x.description, participate: x.participate, link: x.link,
          timing: !x.date ? 'ongoing' : (x.date >= today ? 'upcoming' : 'past'),
        });
      });
    return items;
  }

  function prettyDate(ymd) {
    const d = new Date(ymd + 'T00:00:00');
    return isNaN(d) ? ymd : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function initiativeItem(it) {
    const li = el2('li', 'rounded-xl border border-line bg-deep p-5');
    const tags = el2('p', 'flex flex-wrap gap-2 text-xs');
    tags.append(el2('span', 'rounded-full border px-3 py-1 font-mono ' + (it.community ? 'border-aqua/50 text-aqua' : 'border-sun/50 text-sun'),
      it.community ? 'Community submitted' : 'Reported activity'));
    if (it.sample) tags.append(el2('span', 'rounded-full border border-sun/50 px-3 py-1 font-mono text-sun', 'Sample'));
    li.append(tags, el2('h6', 'mt-3 font-display text-lg font-bold text-txt-1', it.name));
    const meta = [it.organization, it.date ? 'Date: ' + prettyDate(it.date) : (it.timing === 'ongoing' ? 'Ongoing' : '')].filter(Boolean).join(' · ');
    if (meta) li.appendChild(el2('p', 'mt-1 text-sm text-txt-3', meta));
    li.appendChild(el2('p', 'mt-2', it.description));
    if (it.participate) {
      const p = el2('p', 'mt-2 text-sm');
      p.append(el2('strong', 'text-txt-1', 'How to take part: '), document.createTextNode(it.participate));
      li.appendChild(p);
    }
    if (it.link) {
      const a = el2('a', 'mt-2 inline-block break-all text-sm font-semibold text-aqua underline underline-offset-4 hover:text-mint', it.link);
      a.href = it.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.append(el2('span', 'sr-only', ' (opens in a new tab)'));
      li.appendChild(a);
    }
    if (it.source) li.appendChild(sourceLine(it.source));
    return li;
  }

  // Buttons that jump to the other tabs with this lake pre-selected.
  function goToTab(panelId, focusId, lake, eventName) {
    if (window.LakeSentryTabs) window.LakeSentryTabs.show(panelId);
    if (eventName) document.dispatchEvent(new CustomEvent(eventName, { detail: { lake: lake.id } }));
    const target = document.getElementById(focusId);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  }
  function actionButton(label, onClick, primary) {
    const b = el2('button', 'rounded-md px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 ' +
      (primary ? 'bg-aqua text-onaccent' : 'border border-linehi text-txt-1 hover:border-aqua hover:text-aqua'), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function lakeUrl(id) {
    return location.href.split(/[?#]/)[0] + '?lake=' + encodeURIComponent(id) + '#map';
  }

  function renderReport(lake) {
    cited = new Set();
    detailBox.textContent = '';
    const posts = store.read('posts').filter(function (p) { return p.status === 'approved' && p.lake === lake.id; });
    const inits = initiativesFor(lake);
    const by = function (t) { return inits.filter(function (i) { return i.timing === t; }); };
    const st = STATUS[lake.status] || STATUS.listed;

    const art = el2('article', 'space-y-8');
    art.setAttribute('aria-labelledby', 'lake-report-title');

    /* --- Header --- */
    const head = el2('header');
    const top = el2('div', 'flex flex-wrap items-center justify-between gap-3');
    const back = el2('button', 'inline-flex items-center gap-1 text-sm font-semibold text-aqua underline-offset-4 hover:underline', '← Back to the map');
    back.type = 'button';
    back.addEventListener('click', function () {
      mapBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const pin = document.querySelector('.map-lake[data-id="' + lake.id + '"]') || listBox.querySelector('button[data-id="' + lake.id + '"]');
      if (pin) pin.focus({ preventScroll: true });
    });
    const copy = el2('button', 'rounded-md border border-linehi px-3 py-1.5 text-sm font-semibold text-txt-1 transition hover:border-aqua hover:text-aqua', '🔗 Copy link to this report');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      const url = lakeUrl(lake.id);
      const done = function () { copy.textContent = '✓ Link copied'; if (statusEl) statusEl.textContent = 'Link to the ' + lake.name + ' report copied.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
      else window.prompt('Copy this link:', url);
    });
    top.append(back, copy);
    const title = el2('h3', 'mt-4 font-display text-3xl font-bold text-txt-1 sm:text-4xl', lake.name);
    title.id = 'lake-report-title';
    title.tabIndex = -1;
    const badges = el2('p', 'mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold');
    badges.append(el2('span', 'font-mono uppercase tracking-wider text-txt-3', lake.area), el2('span', 'rounded-full px-3 py-1 font-mono ' + st.cls, st.label));
    if (lake.positionUnknown) badges.append(el2('span', 'rounded-full border border-sun/50 px-3 py-1 font-mono text-sun', 'Map position is a guess'));
    if (lake.updated) badges.append(el2('span', 'font-mono font-normal text-txt-3', 'Updated ' + prettyDate(lake.updated)));
    head.append(top, title, badges);

    // Jump links to each part of the report
    const jump = el2('nav', 'mt-4');
    jump.setAttribute('aria-label', 'Sections of this report');
    const jl = el2('ul', 'flex flex-wrap gap-2 text-sm');
    [['lr-overview', 'Overview'], ['lr-figures', 'Figures'], ['lr-initiatives', 'Initiatives'], ['lr-notes', 'Field notes'], ['lr-photos', 'Photos'], ['lr-stories', 'Stories'], ['lr-sources', 'Sources']].forEach(function (j) {
      const li = el2('li');
      const a = el2('a', 'inline-block rounded-full border border-line bg-deep px-3 py-1.5 transition hover:border-aqua hover:text-aqua', j[1]);
      a.href = '#' + j[0];
      a.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation(); // keep the page address as it is
        document.getElementById(j[0]).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(a); jl.appendChild(li);
    });
    jump.appendChild(jl);
    head.appendChild(jump);
    art.appendChild(head);

    /* --- Overview: photo + where things stand + live numbers --- */
    const ov = el2('section', 'grid gap-6 lg:grid-cols-[1fr_1.3fr]');
    ov.id = 'lr-overview';
    ov.setAttribute('aria-labelledby', 'lr-overview-title');
    const fig = el2('figure', 'self-start overflow-hidden rounded-2xl border border-line');
    const img = el2('img', 'img-placeholder h-auto w-full');
    img.src = lake.photo; img.alt = lake.photoAlt; img.width = 800; img.height = 500;
    fig.append(img, el2('figcaption', 'bg-deep px-4 py-2 text-sm', lake.photo.indexOf('placeholder') !== -1 ? 'Photo to be added.' : lake.name));
    const now = el2('div');
    const nh = el2('h4', 'font-display text-2xl font-bold text-txt-1', 'Where things stand');
    nh.id = 'lr-overview-title';
    now.append(nh, el2('p', 'mt-2 text-lg', lake.summary));

    // Live "at a glance" numbers
    const recovered = (lake.stats || []).filter(function (x) { return x.group === 'recovered' && /tonne/i.test(x.unit); })
      .reduce(function (sum, x) { return sum + (parseFloat(String(x.value).replace(/,/g, '')) || 0); }, 0);
    const tiles = [
      [recovered ? recovered + ' t' : '—', recovered ? 'plastic recovered' : 'no recovery data yet', recovered ? 'text-mint' : 'text-txt-3'],
      [String(by('ongoing').length), 'ongoing initiatives', 'text-aqua'],
      [String(by('upcoming').length), 'upcoming initiatives', 'text-sun'],
      [String(posts.length), posts.length === 1 ? 'visitor story' : 'visitor stories', 'text-aqua'],
    ];
    const dl = el2('dl', 'mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4');
    tiles.forEach(function (t) {
      const d = el2('div', 'flex flex-col rounded-xl border border-line bg-deep p-4');
      d.append(el2('dt', 'mt-1 text-xs text-txt-3', t[1]), el2('dd', 'order-first font-mono text-3xl font-semibold ' + t[2], t[0]));
      dl.appendChild(d);
    });
    now.appendChild(dl);

    // Quick facts
    if ((lake.facts || []).length) {
      const fl = el2('dl', 'mt-5 grid gap-3 sm:grid-cols-3');
      lake.facts.forEach(function (f) {
        const d = el2('div', 'rounded-lg border border-line px-4 py-3');
        d.append(el2('dt', 'font-mono text-xs uppercase tracking-wider text-txt-3', f.label), el2('dd', 'font-semibold text-txt-1', f.value), sourceLine(f.source, 'mt-1 text-xs text-txt-3'));
        fl.appendChild(d);
      });
      now.appendChild(fl);
    }
    // Pointer to the official maps (exact boundaries and water-spread area)
    const maps = el2('div', 'mt-5 rounded-xl border border-aqua/40 bg-aqua/10 p-4 text-sm');
    maps.append(el2('p', 'font-semibold text-txt-1', '📍 Exact location and water-spread area'),
      el2('p', 'mt-1', 'Lake Sentry’s map is a simplified drawing. For exact boundaries, check the government’s official water-body maps:'));
    const ml = el2('p', 'mt-2 flex flex-wrap gap-x-5 gap-y-1 font-semibold');
    [['bhuvan', 'Bhuvan (ISRO) ↗'], ['india-wris', 'India WRIS ↗']].forEach(function (m) {
      const src = SOURCES[m[0]]; if (!src) return;
      const a = el2('a', 'text-aqua underline underline-offset-4 hover:text-mint', m[1]);
      a.href = src.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.append(el2('span', 'sr-only', ' (opens in a new tab)'));
      ml.appendChild(a);
    });
    maps.appendChild(ml);
    now.appendChild(maps);
    ov.append(fig, now);
    art.appendChild(ov);

    /* --- About + research --- */
    const about = el2('div', 'grid gap-5 md:grid-cols-2');
    about.append(textBlock('About the lake', lake.about), textBlock('Pollution research', lake.research));
    art.appendChild(about);

    /* --- Figures (with sources) --- */
    const fsec = section('lr-figures', 'Figures and findings', 'Every figure shows where it comes from.');
    const groups = [
      ['recovered', 'Waste recovered', 'text-mint', 'No recovery figures have been recorded for this lake yet.'],
      ['pollution', 'Pollution load', 'text-coral', ''],
    ];
    groups.forEach(function (g) {
      const items = (lake.stats || []).filter(function (x) { return x.group === g[0]; });
      if (!items.length && !g[3]) return;
      fsec.appendChild(el2('h5', 'mt-5 font-mono text-xs uppercase tracking-wider text-aqua', g[1]));
      if (!items.length) { fsec.appendChild(el2('p', 'mt-2 italic text-txt-3', g[3])); return; }
      const ul = el2('ul', 'mt-3 grid gap-4 sm:grid-cols-2');
      items.forEach(function (x) {
        const li = el2('li', 'rounded-xl border border-line bg-deep p-5');
        const v = el2('p', 'font-mono text-4xl font-semibold ' + g[2], x.value);
        v.append(el2('span', 'ml-2 text-base font-normal text-txt-2', x.unit));
        li.append(v, el2('p', 'mt-1 font-semibold text-txt-1', x.label));
        if (x.note) li.appendChild(el2('p', 'mt-1 text-sm', x.note));
        li.appendChild(sourceLine(x.source));
        ul.appendChild(li);
      });
      fsec.appendChild(ul);
    });
    if ((lake.findings || []).length) {
      fsec.appendChild(el2('h5', 'mt-6 font-mono text-xs uppercase tracking-wider text-aqua', 'Key findings'));
      const ul = el2('ul', 'mt-3 space-y-3');
      lake.findings.forEach(function (f) {
        const li = el2('li', 'border-l-2 border-aqua/60 pl-4');
        li.append(el2('p', '', f.text), sourceLine(f.source, 'mt-1 text-xs text-txt-3'));
        ul.appendChild(li);
      });
      fsec.appendChild(ul);
    }
    if ((lake.timeline || []).length) {
      fsec.appendChild(el2('h5', 'mt-6 font-mono text-xs uppercase tracking-wider text-aqua', 'Timeline'));
      const ol = el2('ol', 'mt-3 space-y-5 border-l-2 border-aqua/40 pl-5');
      lake.timeline.forEach(function (t) {
        const li = el2('li', 'relative');
        li.append(el2('span', 'absolute -left-[1.6rem] top-1.5 h-3 w-3 rounded-full border-2 border-aqua bg-ink'),
          el2('p', 'font-mono text-sm text-aqua', t.when), el2('p', 'font-display text-lg font-bold text-txt-1', t.title),
          el2('p', '', t.text), sourceLine(t.source, 'mt-1 text-xs text-txt-3'));
        ol.appendChild(li);
      });
      fsec.appendChild(ol);
    }
    art.appendChild(fsec);

    /* --- Initiatives: ongoing, upcoming, past --- */
    const isec = section('lr-initiatives', 'Clean-up and conservation initiatives', 'Ongoing and upcoming efforts at this lake. Approved community submissions appear here automatically.');
    [['ongoing', 'Ongoing', 'No ongoing initiatives are published for this lake yet.'], ['upcoming', 'Upcoming', 'No upcoming initiatives are published for this lake yet.'], ['past', 'Past activity', '']].forEach(function (g) {
      const list = by(g[0]);
      if (!list.length && !g[2]) return;
      const hh = el2('h5', 'mt-5 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-aqua', g[1]);
      hh.append(el2('span', 'rounded-full border border-line px-2 py-0.5 text-txt-2', String(list.length)));
      isec.appendChild(hh);
      if (!list.length) { isec.appendChild(el2('p', 'mt-2 italic text-txt-3', g[2])); return; }
      const ul = el2('ul', 'mt-3 grid gap-4 md:grid-cols-2');
      list.forEach(function (it) { ul.appendChild(initiativeItem(it)); });
      isec.appendChild(ul);
    });
    const irow = el2('div', 'mt-5');
    irow.appendChild(actionButton('Submit an initiative for ' + lake.name, function () {
      if (window.LakeSentryTabs) window.LakeSentryTabs.show('init-lake');
      const sel = document.getElementById('init-lake');
      sel.value = lake.id;
      sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      sel.focus({ preventScroll: true });
    }, true));
    isec.appendChild(irow);
    art.appendChild(isec);

    /* --- Field notes + Lake Sentry perspective --- */
    const nsec = section('lr-notes', 'Field notes and Lake Sentry’s view');
    const ng = el2('div', 'mt-4 grid gap-5 md:grid-cols-2');
    ng.append(textBlock('Field observations', lake.observations), textBlock('How Lake Sentry could help', lake.perspective));
    nsec.appendChild(ng);
    art.appendChild(nsec);

    /* --- Photos --- */
    const psec = section('lr-photos', 'Photos');
    const gal = (lake.gallery || []);
    const pg = el2('ul', 'mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3');
    if (gal.length) {
      gal.forEach(function (g) {
        const li = el2('li', 'overflow-hidden rounded-xl border border-line');
        const im = el2('img', 'aspect-[4/3] w-full object-cover'); im.src = g.src; im.alt = g.alt; im.loading = 'lazy';
        li.append(im); if (g.caption) li.append(el2('p', 'bg-deep px-3 py-2 text-sm', g.caption));
        pg.appendChild(li);
      });
    } else {
      for (let k = 1; k <= 3; k++) {
        const li = el2('li', 'overflow-hidden rounded-xl border border-line');
        const im = el2('img', 'img-placeholder aspect-[4/3] w-full object-cover'); im.src = 'placeholder.svg';
        im.alt = 'Placeholder ' + k + ' for a field photo of ' + lake.name + '.';
        li.append(im, el2('p', 'bg-deep px-3 py-2 text-sm', 'Field photo to be added'));
        pg.appendChild(li);
      }
    }
    psec.appendChild(pg);
    art.appendChild(psec);

    /* --- Visitor stories (live) --- */
    const ssec = section('lr-stories', 'Stories from visitors', posts.length ? posts.length + (posts.length === 1 ? ' published story' : ' published stories') + ' about this lake.' : 'No stories about this lake yet.');
    if (posts.length) {
      const sl = el2('ul', 'mt-4 grid gap-4 md:grid-cols-2');
      posts.slice().sort(function (a, b) { return b.postedAt - a.postedAt; }).slice(0, 2).forEach(function (p) { sl.appendChild(cards.postCard(p)); });
      ssec.appendChild(sl);
    }
    const srow = el2('div', 'mt-5 flex flex-wrap gap-3');
    if (posts.length) srow.appendChild(actionButton('Read all stories about ' + lake.name, function () { goToTab('stories', 'post-feed-title', lake, 'lakesentry:show-posts'); }));
    srow.appendChild(actionButton('Share a story about ' + lake.name, function () { goToTab('stories', 'post-title', lake, 'lakesentry:show-posts'); }, true));
    ssec.appendChild(srow);
    art.appendChild(ssec);

    /* --- What's missing: invites people to help --- */
    const missing = [];
    if (isTodo(lake.about)) missing.push('A description of the lake');
    if (isTodo(lake.research)) missing.push('Research on pollution at this lake');
    if (isTodo(lake.observations)) missing.push('Lake Sentry field notes');
    if (!(lake.stats || []).length) missing.push('Verified figures (waste recovered or pollution measurements)');
    else if (!(lake.stats || []).some(function (x) { return x.group === 'recovered'; })) missing.push('Waste-recovery figures');
    if (!gal.length && lake.photo.indexOf('placeholder') !== -1) missing.push('Photographs');
    if (!inits.length) missing.push('Clean-up and conservation initiatives');
    if (/^Location to be confirmed/.test(lake.area)) missing.push('The exact location');
    if (missing.length) {
      const box = el2('aside', 'rounded-2xl border border-dashed border-sun/50 bg-sun/[.05] p-5');
      box.setAttribute('aria-label', 'Help complete this report');
      box.append(el2('h4', 'font-display text-lg font-bold text-txt-1', 'Help complete this report'));
      box.append(el2('p', 'mt-1 text-sm', 'This report is still a work in progress. We’re still missing:'));
      const ul = el2('ul', 'mt-2 list-disc space-y-1 pl-5 text-sm');
      missing.forEach(function (m) { ul.appendChild(el2('li', '', m)); });
      box.append(ul, el2('p', 'mt-2 text-sm', 'Know something about ' + lake.name + '? Share a story or submit an initiative above.'));
      art.appendChild(box);
    }

    /* --- Sources --- */
    const srcSec = section('lr-sources', 'Sources');
    if (cited.size) {
      srcSec.appendChild(el2('p', 'mt-1 text-sm text-txt-3', 'Used in this report:'));
      const ol = el2('ol', 'mt-2 list-decimal space-y-1 pl-6 text-sm');
      cited.forEach(function (id) {
        const src = SOURCES[id]; if (!src) return;
        const li = el2('li');
        li.append(src.url ? externalLink(src.url, src.name) : document.createTextNode(src.name));
        ol.appendChild(li);
      });
      srcSec.appendChild(ol);
    } else {
      srcSec.appendChild(el2('p', 'mt-1 text-sm italic text-txt-3', 'No sources yet: this report has no cited figures so far.'));
    }
    srcSec.appendChild(el2('p', 'mt-4 text-sm text-txt-3', 'Official maps for exact lake boundaries and positions:'));
    const om = el2('ul', 'mt-2 list-disc space-y-1 pl-6 text-sm');
    MAP_SOURCES.forEach(function (id) {
      const src = SOURCES[id]; if (!src) return;
      const li = el2('li');
      li.append(src.url ? externalLink(src.url, src.name) : document.createTextNode(src.name));
      om.appendChild(li);
    });
    srcSec.appendChild(om);
    srcSec.appendChild(el2('p', 'mt-4 text-sm text-txt-3', 'Further reading on Hyderabad’s lakes in general:'));
    const fr = el2('ul', 'mt-2 list-disc space-y-1 pl-6 text-sm');
    FURTHER.forEach(function (id) {
      const src = SOURCES[id]; if (!src) return;
      const li = el2('li');
      li.append(src.url ? externalLink(src.url, src.name) : document.createTextNode(src.name));
      fr.appendChild(li);
    });
    srcSec.appendChild(fr);
    art.appendChild(srcSec);

    detailBox.appendChild(art);
  }

  // Shown before any lake is chosen.
  function showPrompt() {
    detailBox.textContent = '';
    const box = el2('div', 'py-6 text-center');
    box.append(el2('p', 'text-4xl', '🗺️'),
      el2('h3', 'mt-3 font-display text-2xl font-bold text-txt-1', 'Choose a lake to see its full report'),
      el2('p', 'mx-auto mt-2 max-w-xl', 'Select a lake on the map or in the list. You’ll see where things stand, recovery figures with their sources, ongoing and upcoming initiatives, field notes, photos and visitor stories.'));
    detailBox.appendChild(box);
  }

  /* ---------- 5. Selecting a lake ---------- */
  function selectLake(id, opts) {
    opts = opts || {};
    const lake = lakes.find(function (l) { return l.id === id; });
    if (!lake) return;
    selectedId = id;
    // Update the "pressed" state on both the map shapes and the list buttons.
    document.querySelectorAll('.map-lake, #lake-list button').forEach(function (node) {
      node.setAttribute('aria-pressed', String(node.getAttribute('data-id') === id));
    });
    renderReport(lake);
    try { history.replaceState(null, '', '?lake=' + encodeURIComponent(id) + '#map'); } catch (e) { /* ignore */ }
    if (statusEl) statusEl.textContent = 'Showing the full report for ' + lake.name + ' below the map.';
    if (opts.scroll) {
      const t = document.getElementById('lake-report-title');
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      t.focus({ preventScroll: true });
    }
  }

  // Redraw the open report when initiatives or stories change
  // (e.g. the admin approves one in another tab).
  function refresh() {
    if (!selectedId) return;
    const lake = lakes.find(function (l) { return l.id === selectedId; });
    const y = window.scrollY;
    renderReport(lake);
    window.scrollTo(0, y);
  }
  document.addEventListener('lakesentry:posts-changed', refresh);
  document.addEventListener('lakesentry:initiatives-changed', refresh);

  buildMap();
  buildList();
  // Open a lake straight from a shared link: app.html?lake=hussain-sagar#map
  const wanted = new URLSearchParams(location.search).get('lake');
  if (wanted && lakes.some(function (l) { return l.id === wanted; })) selectLake(wanted);
  else showPrompt();
  if (statusEl) statusEl.textContent = '';
})();
