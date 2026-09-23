/* =====================================================================
   App page — Tool 1: Interactive Hyderabad lake map
   ---------------------------------------------------------------------
   - Draws a simple schematic map of Hyderabad as an SVG, with one
     clickable shape per lake from lakes-data.js.
   - Hovering or focusing a lake shows its name in a tooltip.
   - Clicking a lake (or pressing Enter/Space on it, or using the list
     of buttons next to the map) shows that lake's "lake page" below.

   Keyboard: Tab moves between lakes; Enter or Space opens one.
   ===================================================================== */
(function () {
  'use strict';

  const lakes = window.LAKE_SENTRY_LAKES || [];
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
    bg.appendChild(el('rect', { width: VIEW_W, height: VIEW_H, fill: '#F5EEDC' }));
    // faint grid
    for (let x = 50; x < VIEW_W; x += 50) bg.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: VIEW_H, stroke: '#EBDDBB', 'stroke-width': 1 }));
    for (let y = 50; y < VIEW_H; y += 50) bg.appendChild(el('line', { x1: 0, y1: y, x2: VIEW_W, y2: y, stroke: '#EBDDBB', 'stroke-width': 1 }));
    // Musi river (runs west -> east through the city) and the Esi river
    bg.appendChild(el('path', { d: 'M150 372 C230 360 260 330 330 335 S470 350 540 340 S650 330 700 345 S770 360 800 352', fill: 'none', stroke: '#76BFCB', 'stroke-width': 6, 'stroke-linecap': 'round' }));
    bg.appendChild(el('path', { d: 'M340 490 C380 440 430 400 470 350', fill: 'none', stroke: '#76BFCB', 'stroke-width': 4, 'stroke-linecap': 'round' }));
    bg.appendChild(el('text', { x: 560, y: 368, fill: '#105565', 'font-size': 14, 'font-style': 'italic' }, 'Musi river'));
    // Area names
    [['Gachibowli', 230, 190], ['Kukatpally', 520, 118], ['Secunderabad', 690, 170], ['Old City', 640, 430]].forEach(function (a) {
      bg.appendChild(el('text', { x: a[1], y: a[2], fill: '#6B5A3A', 'font-size': 14, 'font-weight': 500, 'letter-spacing': '0.08em' }, a[0].toUpperCase()));
    });
    // Compass
    const compass = el('g', { transform: 'translate(752 56)' });
    compass.appendChild(el('circle', { r: 24, fill: '#FFFFFF', stroke: '#105565', 'stroke-width': 2 }));
    compass.appendChild(el('path', { d: 'M0 -16 L7 6 L0 2 L-7 6 Z', fill: '#105565' }));
    compass.appendChild(el('text', { y: 18, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#105565' }, 'N'));
    bg.appendChild(compass);
    svg.appendChild(bg);

    // Lakes — biggest first so small lakes are drawn on top.
    lakes.slice().sort(function (a, b) { return b.size - a.size; }).forEach(function (lake) {
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
        class: 'lake-shape',
        d: lakePath(p.x, p.y, 10 + lake.size * 12, lake.id),
        fill: lake.verified ? '#3F9FB0' : '#A9D8DF',
        stroke: '#105565',
        'stroke-width': 1.5,
        'stroke-dasharray': lake.verified ? '' : '5 4',
      }));
      // Label with a white "halo" so it stays readable over anything.
      g.appendChild(el('text', {
        class: 'lake-label',
        x: p.x + (lake.labelDx || 0),
        y: p.y + (lake.labelDy || 0),
        'text-anchor': 'middle',
        'font-size': 15,
        'font-weight': 600,
        fill: '#082E3A',
        stroke: '#FFFFFF',
        'stroke-width': 4,
        'paint-order': 'stroke',
      }, lake.name.replace(/ \(.*\)/, '')));

      g.addEventListener('click', function () { selectLake(lake.id); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLake(lake.id); }
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

  /* ---------- 3. The list of lake buttons (an accessible alternative to the map) ---------- */
  function buildList() {
    lakes.forEach(function (lake) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = lake.id;
      btn.setAttribute('aria-pressed', 'false');
      btn.className = 'flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left ring-1 ring-lake-100 hover:bg-lake-50 aria-pressed:bg-lake-700 aria-pressed:text-white aria-pressed:ring-lake-700';
      const name = document.createElement('span');
      name.className = 'font-semibold';
      name.textContent = lake.name;
      const badge = document.createElement('span');
      badge.className = 'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ' +
        (lake.status === 'observed' ? 'bg-reed-100 text-reed-800' : 'bg-sand-100 text-sand-800');
      badge.textContent = lake.status === 'observed' ? 'Field notes' : 'Visit planned';
      btn.append(name, badge);
      btn.addEventListener('click', function () { selectLake(lake.id); });
      li.appendChild(btn);
      listBox.appendChild(li);
    });
  }

  /* ---------- 4. The lake detail "page" ---------- */
  // Text starting with "TODO:" is shown as a friendly "to be added" note.
  function sectionText(text) {
    const p = document.createElement('p');
    if (/^TODO:?/i.test(text)) {
      p.className = 'mt-1 italic text-slate-600';
      p.textContent = 'To be added: ' + text.replace(/^TODO:?\s*/i, '');
    } else {
      p.className = 'mt-1 text-slate-700';
      p.textContent = text;
    }
    return p;
  }

  function section(title, content) {
    const wrap = document.createElement('div');
    const h = document.createElement('h4');
    h.className = 'text-sm font-bold uppercase tracking-wider text-lake-700';
    h.textContent = title;
    wrap.appendChild(h);
    wrap.appendChild(typeof content === 'string' ? sectionText(content) : content);
    return wrap;
  }

  function renderDetail(lake) {
    detailBox.textContent = '';

    const article = document.createElement('article');
    article.setAttribute('aria-labelledby', 'lake-detail-title');
    article.className = 'grid gap-8 md:grid-cols-[1fr_1.4fr]';

    // Photo (placeholder until you add real photos in lakes-data.js)
    const fig = document.createElement('figure');
    fig.className = 'overflow-hidden rounded-2xl ring-1 ring-lake-100 self-start';
    const img = document.createElement('img');
    img.src = lake.photo;
    img.alt = lake.photoAlt;
    img.width = 800; img.height = 500;
    img.className = 'img-placeholder h-auto w-full';
    const cap = document.createElement('figcaption');
    cap.className = 'bg-white px-4 py-2 text-sm text-slate-700';
    cap.textContent = lake.photo.indexOf('placeholder') !== -1 ? 'Field photo coming soon.' : lake.name;
    fig.append(img, cap);

    const body = document.createElement('div');
    const area = document.createElement('p');
    area.className = 'text-sm font-semibold uppercase tracking-wider text-slate-600';
    area.textContent = lake.area;
    const title = document.createElement('h3');
    title.id = 'lake-detail-title';
    title.className = 'mt-1 font-display text-3xl font-semibold text-lake-950';
    title.textContent = lake.name;
    const badges = document.createElement('p');
    badges.className = 'mt-3 flex flex-wrap gap-2 text-xs font-semibold';
    [
      lake.status === 'observed' ? ['Lake Sentry field notes', 'bg-reed-100 text-reed-800'] : ['Site visit planned', 'bg-sand-100 text-sand-800'],
      lake.verified ? ['Location verified', 'bg-lake-100 text-lake-800'] : ['Location to be verified', 'bg-sand-100 text-sand-800'],
    ].forEach(function (b) {
      const s = document.createElement('span');
      s.className = 'rounded-full px-3 py-1 ' + b[1];
      s.textContent = b[0];
      badges.appendChild(s);
    });

    const sections = document.createElement('div');
    sections.className = 'mt-6 space-y-5';
    sections.appendChild(section('About the lake', lake.about));
    sections.appendChild(section('Research', lake.research));
    sections.appendChild(section('Field observations', lake.observations));
    sections.appendChild(section('Community initiatives', initiativesList(lake)));
    sections.appendChild(section('Lake Sentry perspective', lake.perspective));

    body.append(area, title, badges, sections);
    article.append(fig, body);
    detailBox.appendChild(article);
  }

  // Approved initiatives for this lake come from initiatives.js.
  function initiativesList(lake) {
    const wrap = document.createElement('div');
    const approved = (window.LakeSentryInitiatives && window.LakeSentryInitiatives.approvedFor(lake.id)) || [];
    if (approved.length) {
      const ul = document.createElement('ul');
      ul.className = 'mt-1 list-disc space-y-1 pl-5 text-slate-700';
      approved.forEach(function (it) {
        const li = document.createElement('li');
        li.textContent = it.name + (it.organization ? ' (' + it.organization + ')' : '');
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    } else {
      const p = document.createElement('p');
      p.className = 'mt-1 text-slate-700';
      p.textContent = 'No published initiatives for this lake yet.';
      wrap.appendChild(p);
    }
    const link = document.createElement('a');
    link.href = '#initiatives';
    link.className = 'mt-2 inline-flex font-semibold text-lake-700 underline underline-offset-4 hover:text-lake-900';
    link.textContent = 'Submit an initiative for ' + lake.name;
    link.addEventListener('click', function () {
      // Pre-select this lake in the submission form further down the page.
      const select = document.getElementById('init-lake');
      if (select) select.value = lake.id;
    });
    wrap.appendChild(link);
    return wrap;
  }

  /* ---------- 5. Selecting a lake ---------- */
  function selectLake(id) {
    const lake = lakes.find(function (l) { return l.id === id; });
    if (!lake) return;
    selectedId = id;
    // Update the "pressed" state on both the map shapes and the list buttons.
    document.querySelectorAll('.map-lake, #lake-list button').forEach(function (node) {
      node.setAttribute('aria-pressed', String(node.getAttribute('data-id') === id));
    });
    renderDetail(lake);
    if (statusEl) statusEl.textContent = 'Showing the lake page for ' + lake.name + ' below the map.';
  }

  // Re-draw the open lake page when initiatives are approved/rejected.
  document.addEventListener('lakesentry:initiatives-changed', function () {
    if (selectedId) renderDetail(lakes.find(function (l) { return l.id === selectedId; }));
  });

  buildMap();
  buildList();
  // Start with the first lake selected (without announcing it).
  selectLake(lakes[0].id);
  if (statusEl) statusEl.textContent = '';
})();
