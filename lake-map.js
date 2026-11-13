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
  const WATER = window.LAKE_SENTRY_WATER;

  let selectedId = null;

  function el(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text) node.textContent = text;
    return node;
  }

  /* ---------- 1. The water-body map ----------
     Outlines come from water-bodies.js (converted from the Hyderabad
     water-bodies KML). Map units are kilometres; north is up. */
  const LAT0 = 17.4;
  const KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.574; // km per degree
  const TYPES = {
    T: { label: 'Tank / reservoir', plural: 'Tanks & reservoirs', cls: 'wb-tank' },
    L: { label: 'Lake / pond', plural: 'Lakes & ponds', cls: 'wb-tank' },
    R: { label: 'River, stream or drain', plural: 'Rivers, streams & drains', cls: 'wb-river' },
    C: { label: 'Canal', plural: 'Canals', cls: 'wb-canal' },
  };
  // A few well-known areas, only to help people find their way around.
  const PLACES = [['Secunderabad', 17.4399, 78.4983], ['Gachibowli', 17.4401, 78.3489], ['Kukatpally', 17.4849, 78.4138],
    ['Charminar', 17.3616, 78.4747], ['Uppal', 17.4058, 78.5591], ['LB Nagar', 17.3457, 78.5522], ['Miyapur', 17.4968, 78.3614],
    ['Mehdipatnam', 17.3950, 78.4410], ['Begumpet', 17.4447, 78.4664]];

  function proj(lat, lon) { return [(lon - WATER.west) * KX, (WATER.north - lat) * KY]; }
  const polys = [];
  let FULL = null, view = null, svg = null, stage = null, overlay = null, infoBox = null, scaleBar = null, waterLayer = null;

  function decode() {
    WATER.items.forEach(function (it, idx) {
      const f = it[2], ring = [];
      let x = 0, y = 0;
      for (let i = 0; i < f.length; i += 2) {
        x += f[i]; y += f[i + 1];
        ring.push(proj(WATER.south + y / WATER.scale, WATER.west + x / WATER.scale));
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      ring.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
      polys.push({ idx: idx, type: it[0], area: it[1], ring: ring, box: [minX, minY, maxX, maxY] });
    });
    FULL = { x: 0, y: 0, w: (WATER.east - WATER.west) * KX, h: (WATER.north - WATER.south) * KY };
  }

  function pointIn(pt, poly) {
    const b = poly.box;
    if (pt[0] < b[0] || pt[0] > b[2] || pt[1] < b[1] || pt[1] > b[3]) return false;
    const r = poly.ring; let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < (r[j][0] - r[i][0]) * (pt[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  }

  function areaText(m2) {
    if (m2 >= 1e6) return (m2 / 1e6).toFixed(2) + ' km²';
    return (m2 / 1e4).toFixed(m2 >= 1e5 ? 1 : 2) + ' hectares';
  }

  // Lakes with a position: find the outline that contains their point.
  function matchLakes() {
    lakes.forEach(function (lake) {
      if (lake.lat == null || lake.lon == null) return;
      const pt = proj(lake.lat, lake.lon);
      lake._pt = pt;
      if (lake.positionUnknown) return;
      const p = polys.find(function (q) { return (q.type === 'T' || q.type === 'L') && pointIn(pt, q); });
      if (p) { lake._poly = p; p.lake = lake; lake._mapArea = p.area; }
    });
  }

  function fitView(box, pad) {
    const cw = stage.clientWidth || 800, ch = stage.clientHeight || 600, ar = cw / ch;
    let w = box.w * (1 + pad), h = box.h * (1 + pad);
    if (w / h > ar) h = w / ar; else w = h * ar;
    return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w: w, h: h };
  }

  function clampView(v) {
    const maxW = FULL.w * 1.6, minW = 0.25; // from the whole area down to ~250 m across
    if (v.w > maxW) { const k = maxW / v.w; v.x += v.w * (1 - k) / 2; v.y += v.h * (1 - k) / 2; v.w *= k; v.h *= k; }
    if (v.w < minW) { const k = minW / v.w; v.x -= v.w * (k - 1) / 2; v.y -= v.h * (k - 1) / 2; v.w *= k; v.h *= k; }
    const cx = Math.min(Math.max(v.x + v.w / 2, FULL.x), FULL.x + FULL.w), cy = Math.min(Math.max(v.y + v.h / 2, FULL.y), FULL.y + FULL.h);
    v.x = cx - v.w / 2; v.y = cy - v.h / 2;
    return v;
  }

  function apply() {
    svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
    const cw = stage.clientWidth, ch = stage.clientHeight;
    overlay.querySelectorAll('[data-x]').forEach(function (n) {
      const sx = (+n.dataset.x - view.x) / view.w * cw, sy = (+n.dataset.y - view.y) / view.h * ch;
      const inside = sx > -40 && sx < cw + 40 && sy > -20 && sy < ch + 20;
      n.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
      n.classList.toggle('is-off', !inside);
    });
    // Hide lake labels that would overlap a more important one (the dot stays;
    // zoom in and the name comes back). Lakes with data on file win.
    const placed = [];
    Array.prototype.slice.call(overlay.querySelectorAll('.wb-pin')).sort(function (m, n) {
      return (n.classList.contains('has-data') - m.classList.contains('has-data')) || (m.classList.contains('is-approx') - n.classList.contains('is-approx'));
    }).forEach(function (n) {
      const sx = (+n.dataset.x - view.x) / view.w * cw, sy = (+n.dataset.y - view.y) / view.h * ch;
      const lw = n.querySelector('span').offsetWidth || 120, box = [sx - 9, sy - 11, sx + 14 + lw, sy + 11];
      const hit = placed.some(function (q) { return box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]; });
      n.classList.toggle('no-label', hit && n.getAttribute('aria-pressed') !== 'true');
      placed.push(hit ? [sx - 9, sy - 9, sx + 9, sy + 9] : box);
    });
    // place names fade out when zoomed far in, lake labels when zoomed far out
    stage.classList.toggle('is-zoomed', view.w < FULL.w / 2.2);
    // scale bar: a round number of km close to a quarter of the map width
    const kmPerPx = view.w / cw, target = kmPerPx * 110;
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20].reduce(function (a, b) { return Math.abs(b - target) < Math.abs(a - target) ? b : a; });
    scaleBar.style.width = (nice / kmPerPx).toFixed(0) + 'px';
    scaleBar.querySelector('span').textContent = nice < 1 ? (nice * 1000) + ' m' : nice + ' km';
  }

  let anim = null;
  function animateTo(target) {
    if (anim) cancelAnimationFrame(anim);
    const from = Object.assign({}, view), t0 = performance.now(), dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
    (function step(now) {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e };
      apply();
      if (k < 1) anim = requestAnimationFrame(step);
    })(t0);
  }

  function zoomAt(sx, sy, factor) {
    const cw = stage.clientWidth, ch = stage.clientHeight;
    const mx = view.x + sx / cw * view.w, my = view.y + sy / ch * view.h;
    const v = { w: view.w / factor, h: view.h / factor };
    v.x = mx - (sx / cw) * v.w; v.y = my - (sy / ch) * v.h;
    view = clampView(v); apply();
  }

  function showInfo(p) {
    infoBox.textContent = '';
    const t = TYPES[p.type] || TYPES.T;
    const h = document.createElement('p'); h.className = 'font-semibold text-txt-1';
    h.textContent = p.lake ? p.lake.name : t.label;
    const s = document.createElement('p'); s.className = 'text-sm text-txt-3';
    s.textContent = (p.lake ? t.label + ' · ' : '') + 'mapped water area about ' + areaText(p.area);
    infoBox.append(h, s);
    if (p.lake) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'mt-2 rounded-md bg-aqua px-3 py-1.5 text-sm font-semibold text-onaccent';
      b.textContent = 'Open the ' + p.lake.name + ' report';
      b.addEventListener('click', function () { selectLake(p.lake.id, { scroll: true }); });
      infoBox.appendChild(b);
    } else {
      const n = document.createElement('p'); n.className = 'mt-1 text-sm';
      n.textContent = 'Not documented by Lake Sentry yet. Know its name or condition? Share a lake story about it.';
      infoBox.appendChild(n);
    }
    infoBox.hidden = false;
    svg.querySelectorAll('.is-picked').forEach(function (n) { n.classList.remove('is-picked'); });
    const path = svg.querySelector('[data-i="' + p.idx + '"]');
    if (path) path.classList.add('is-picked');
  }

  function buildMap() {
    if (!WATER) { mapBox.textContent = 'The map data could not be loaded.'; return; }
    decode(); matchLakes();
    stage = document.createElement('div');
    stage.className = 'wb-stage';
    stage.tabIndex = 0;
    stage.setAttribute('role', 'region');
    stage.setAttribute('aria-label', 'Map of water bodies in and around Hyderabad. Drag to move, use the plus and minus buttons or the + and - keys to zoom, arrow keys to move.');
    svg = el('svg', { class: 'wb-svg', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    // background + a light grid every 0.05° to help reading distances
    svg.appendChild(el('rect', { x: -50, y: -50, width: FULL.w + 100, height: FULL.h + 100, class: 'wb-land' }));
    const grid = el('g', { class: 'wb-grid' });
    for (let lon = Math.ceil(WATER.west * 20) / 20; lon < WATER.east; lon += 0.05) { const x = (lon - WATER.west) * KX; grid.appendChild(el('line', { x1: x, y1: -50, x2: x, y2: FULL.h + 50 })); }
    for (let lat = Math.ceil(WATER.south * 20) / 20; lat < WATER.north; lat += 0.05) { const y = (WATER.north - lat) * KY; grid.appendChild(el('line', { x1: -50, y1: y, x2: FULL.w + 50, y2: y })); }
    svg.appendChild(grid);
    waterLayer = el('g');
    polys.slice().sort(function (a, b) { return b.area - a.area; }).forEach(function (p) {
      const d = 'M' + p.ring.map(function (q) { return q[0].toFixed(3) + ' ' + q[1].toFixed(3); }).join('L') + 'Z';
      const path = el('path', { d: d, class: 'wb ' + (TYPES[p.type] || TYPES.T).cls + (p.lake ? ' wb-named' : ''), 'data-i': p.idx, 'data-t': p.type });
      if (p.lake) path.setAttribute('data-id', p.lake.id);
      waterLayer.appendChild(path);
    });
    svg.appendChild(waterLayer);
    stage.appendChild(svg);

    // HTML overlay: place names, lake pins and labels (stay sharp at any zoom)
    overlay = document.createElement('div');
    overlay.className = 'wb-overlay';
    PLACES.forEach(function (pl) {
      const p = proj(pl[1], pl[2]);
      const n = document.createElement('span'); n.className = 'wb-place'; n.dataset.x = p[0]; n.dataset.y = p[1]; n.textContent = pl[0];
      n.setAttribute('aria-hidden', 'true');
      overlay.appendChild(n);
    });
    lakes.filter(function (l) { return l._pt; }).forEach(function (lake) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'map-lake wb-pin' + (lake._poly ? '' : ' is-approx') + (lake.status === 'documented' ? ' has-data' : '');
      b.dataset.id = lake.id; b.dataset.x = lake._pt[0]; b.dataset.y = lake._pt[1];
      b.setAttribute('aria-pressed', 'false');
      const label = lake.name.replace(/ \(.*\)/, '');
      b.innerHTML = '<i aria-hidden="true"></i><span></span>';
      b.querySelector('span').textContent = label + (lake._poly ? '' : ' (approx.)');
      b.setAttribute('aria-label', lake.name + (lake._poly ? '' : ', approximate position') + '. Open the lake report.');
      b.addEventListener('click', function (e) { e.stopPropagation(); selectLake(lake.id, { scroll: true }); });
      overlay.appendChild(b);
    });
    stage.appendChild(overlay);

    // zoom controls + scale bar
    const ctr = document.createElement('div'); ctr.className = 'wb-controls';
    [['+', 'Zoom in', function () { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.6); }],
     ['−', 'Zoom out', function () { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1 / 1.6); }],
     ['⤢', 'Show the whole map', function () { animateTo(fitView(FULL, 0.02)); }]].forEach(function (c) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c[0]; b.setAttribute('aria-label', c[1]); b.title = c[1];
      b.addEventListener('click', c[2]); ctr.appendChild(b);
    });
    stage.appendChild(ctr);
    scaleBar = document.createElement('div'); scaleBar.className = 'wb-scale'; scaleBar.setAttribute('aria-hidden', 'true'); scaleBar.innerHTML = '<span></span>';
    stage.appendChild(scaleBar);
    const north = document.createElement('div'); north.className = 'wb-north'; north.setAttribute('aria-hidden', 'true'); north.textContent = 'N';
    stage.appendChild(north);
    mapBox.appendChild(stage);

    infoBox = document.getElementById('map-info');

    // --- interaction: drag, wheel, pinch, keyboard, hover, click ---
    const pts = new Map();
    let moved = 0, pinch = null;
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0;
      if (pts.size === 2) { const a = Array.from(pts.values()); pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) { hover(e); return; }
      const prev = pts.get(e.pointerId), r = stage.getBoundingClientRect();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const a = Array.from(pts.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        zoomAt((a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top, d / pinch); pinch = d; moved += 10; return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y; moved += Math.abs(dx) + Math.abs(dy);
      view.x -= dx / stage.clientWidth * view.w; view.y -= dy / stage.clientHeight * view.h; view = clampView(view); apply();
    });
    function end(e) {
      const was = pts.has(e.pointerId); pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      if (!pts.size) stage.classList.remove('is-dragging');
      if (was && moved < 6 && e.type === 'pointerup') {
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const i = t && t.getAttribute && t.getAttribute('data-i');
        if (i != null) showInfo(polys[+i]);
      }
    }
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('pointerleave', function () { if (tooltip) tooltip.hidden = true; });
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    stage.addEventListener('dblclick', function (e) { const r = stage.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 2); });
    stage.addEventListener('keydown', function (e) {
      const step = 0.12, cw = stage.clientWidth, ch = stage.clientHeight;
      if (e.key === '+' || e.key === '=') zoomAt(cw / 2, ch / 2, 1.5);
      else if (e.key === '-') zoomAt(cw / 2, ch / 2, 1 / 1.5);
      else if (e.key === 'ArrowLeft') { view.x -= view.w * step; view = clampView(view); apply(); }
      else if (e.key === 'ArrowRight') { view.x += view.w * step; view = clampView(view); apply(); }
      else if (e.key === 'ArrowUp') { view.y -= view.h * step; view = clampView(view); apply(); }
      else if (e.key === 'ArrowDown') { view.y += view.h * step; view = clampView(view); apply(); }
      else return;
      e.preventDefault();
    });
    function hover(e) {
      if (!tooltip) return;
      const i = e.target.getAttribute && e.target.getAttribute('data-i');
      if (i == null) { tooltip.hidden = true; return; }
      const p = polys[+i], r = mapBox.getBoundingClientRect();
      tooltip.querySelector('[data-name]').textContent = p.lake ? p.lake.name : (TYPES[p.type] || TYPES.T).label;
      tooltip.querySelector('[data-area]').textContent = 'About ' + areaText(p.area) + ' · click for details';
      tooltip.hidden = false;
      tooltip.style.left = Math.min(e.clientX - r.left + 14, r.width - tooltip.offsetWidth - 8) + 'px';
      tooltip.style.top = Math.max(8, e.clientY - r.top - tooltip.offsetHeight - 12) + 'px';
    }

    // type filters
    document.querySelectorAll('[data-wb-type]').forEach(function (cb) {
      cb.addEventListener('change', function () { stage.classList.toggle('hide-' + cb.dataset.wbType, !cb.checked); });
    });
    // counts for the legend and the intro
    const c = WATER.counts || {};
    document.querySelectorAll('[data-wb-count]').forEach(function (n) {
      const k = n.dataset.wbCount;
      n.textContent = k === 'all' ? String(polys.length) : k === 'standing' ? String((c.T || 0) + (c.L || 0)) : String(c[k] || 0);
    });
    const standing = polys.filter(function (p) { return p.type === 'T' || p.type === 'L'; }).reduce(function (s, p) { return s + p.area; }, 0);
    document.querySelectorAll('[data-wb-area]').forEach(function (n) { n.textContent = (standing / 1e6).toFixed(1); });

    view = fitView(FULL, 0.02);
    apply();
    window.addEventListener('resize', function () { apply(); });
    // the map tab may be hidden at first: fit again once it's shown
    if (window.ResizeObserver) new ResizeObserver(function () { if (stage.clientWidth) apply(); }).observe(stage);
  }

  // Zoom the map onto a lake (used when a lake is selected)
  function focusLake(lake) {
    if (!stage || !lake._pt) return;
    const b = lake._poly ? lake._poly.box : [lake._pt[0] - 0.6, lake._pt[1] - 0.6, lake._pt[0] + 0.6, lake._pt[1] + 0.6];
    const w = Math.max(b[2] - b[0], 1.2), h = Math.max(b[3] - b[1], 1.2);
    animateTo(clampView(fitView({ x: (b[0] + b[2]) / 2 - w / 2, y: (b[1] + b[3]) / 2 - h / 2, w: w, h: h }, 1.2)));
    svg.querySelectorAll('.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
    if (lake._poly) { const path = svg.querySelector('[data-i="' + lake._poly.idx + '"]'); if (path) path.classList.add('is-selected'); }
  }

  /* ---------- 2. (tooltip is handled by the map's hover above) ---------- */

  /* ---------- 3. The list of lakes (also the keyboard-friendly way in) ---------- */
  // What each lake's "status" badge says.
  const STATUS = {
    documented: { label: 'Data on file', cls: 'border border-mint/50 text-mint' },
    listed: { label: 'No data yet', cls: 'border border-sun/50 text-sun' },
  };

  function buildList() {
    const search = document.getElementById('lake-search');
    if (search) search.addEventListener('input', function () {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      listBox.querySelectorAll('li').forEach(function (li) { const on = !q || li.dataset.search.indexOf(q) !== -1; li.hidden = !on; if (on) shown++; });
      const none = document.getElementById('lake-search-none'); if (none) none.hidden = shown > 0;
    });
    lakes.forEach(function (lake) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = lake.id;
      btn.setAttribute('aria-pressed', 'false');
      btn.className = 'flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-left text-txt-1 transition hover:translate-x-1 hover:border-aqua aria-pressed:border-aqua aria-pressed:bg-aqua/15';
      const text = el2('span', 'min-w-0');
      text.append(el2('span', 'block font-semibold', lake.name));
      text.append(el2('span', 'block truncate text-xs text-txt-3', lake.lat == null ? lake.area + ' · not on the map yet' : lake.area + (lake._mapArea ? ' · ' + areaText(lake._mapArea) : (lake._pt ? ' · approx. position' : ''))));
      const st = STATUS[lake.status] || STATUS.listed;
      btn.append(text, el2('span', 'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ' + st.cls, st.label));
      btn.addEventListener('click', function () { selectLake(lake.id, { scroll: true }); });
      li.dataset.search = (lake.name + ' ' + lake.area).toLowerCase();
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
    if (lake._mapArea) tiles.unshift([lake._mapArea >= 1e6 ? (lake._mapArea / 1e6).toFixed(2) : (lake._mapArea / 1e4).toFixed(1), lake._mapArea >= 1e6 ? 'km² of water (mapped outline)' : 'hectares of water (mapped outline)', 'text-txt-1']);
    const dl = el2('dl', 'mt-5 grid grid-cols-2 gap-3 ' + (tiles.length > 4 ? 'sm:grid-cols-3 xl:grid-cols-5' : 'sm:grid-cols-4'));
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
        const dd = el2('dd', 'font-semibold text-txt-1', f.value);
        const src = sourceLine(f.source, 'mt-1 text-xs font-normal text-txt-3');
        if (src) dd.appendChild(src);
        d.append(el2('dt', 'font-mono text-xs uppercase tracking-wider text-txt-3', f.label), dd);
        fl.appendChild(d);
      });
      now.appendChild(fl);
    }
    // Pointer to the official maps (exact boundaries and water-spread area)
    const maps = el2('div', 'mt-5 rounded-xl border border-aqua/40 bg-aqua/10 p-4 text-sm');
    maps.append(el2('p', 'font-semibold text-txt-1', '📍 Exact location and water-spread area'),
      el2('p', 'mt-1', lake._mapArea ? 'The outline on our map comes from a water-body map of Hyderabad. For official boundaries and seasonal water spread, check the government’s water-body maps:' : 'This lake isn’t matched to an outline on our map yet (its pin is approximate). For exact boundaries, check the government’s official water-body maps:'));
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
    focusLake(lake);
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
