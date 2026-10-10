/* =====================================================================
   Home page — interactive lake surface
   ---------------------------------------------------------------------
   What you see:
     1. A water surface drawn on a <canvas>. Moving the cursor (or a
        finger) across it creates ripples; clicking/tapping makes a
        gentle splash. Small natural ripples keep the water alive.
     2. Pieces of floating trash (bottles, bags, cans, wrappers...) that
        drift with the current and get pushed around by the ripples.
     3. A tiny Lake Sentry robot that cruises around collecting trash —
        a playful nod to the real V1 prototype.
     4. Fish shadows swimming under the surface (they dart away from
        your cursor), lily pads and swaying reeds at the edges.

   How the ripples work (the classic "2D wave equation" trick):
     - The water is split into a grid of small cells. Each cell stores a
       height number. We keep two grids: the current heights and the
       previous heights.
     - Every frame, each cell's new height = (average of its 4 neighbours
       x 2) - its old height, multiplied by a damping factor so waves
       slowly die out. That simple rule makes circular waves spread.
     - To draw it, we look at the slope between neighbouring cells and
       make slopes facing the "light" brighter and the others darker.
       That shading is what makes it look like rippling water.

   Accessibility:
     - The canvas is purely decorative (aria-hidden) — all real content
       is in normal HTML on top of it.
     - A "Pause animation" button stops all motion (WCAG 2.2.2).
     - If the visitor's system asks for reduced motion, the lake still
       moves, but more calmly (fewer ripples, slower robot).
   ===================================================================== */
(function () {
  'use strict';

  const hero = document.getElementById('hero');
  const canvas = document.getElementById('lake-canvas');
  if (!hero || !canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const pauseBtn = document.getElementById('lake-pause');
  const counterEl = document.getElementById('lake-counter');
  const kgEl = document.getElementById('lake-kg');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmallScreen = window.matchMedia('(max-width: 640px)').matches;

  /* ---------- Tunable settings — play with these! ---------- */
  const SETTINGS = {
    damping: 0.968,            // 0.95 = ripples fade fast, 0.99 = ripples last ages
    shade: 4.6,                // how strongly slopes are lit (bigger = more contrast)
    cursorStrength: 2.4,       // ripple size from moving the cursor (kept gentle)
    splashStrength: 26,        // ripple size from a click / tap
    calmStartMs: 3000,         // cursor ripples fade in over the first 3 seconds
    // Small natural ripples: a leaf, an insect or a fish touching the surface.
    naturalEveryMs: reduceMotion ? [2500, 5000] : [350, 900],
    trashCount: isSmallScreen ? 14 : 26,
    // Trash gathers in an oval in the middle of the lake (fractions of the width/height).
    trashZone: { x: window.innerWidth >= 1024 ? 0.62 : 0.5, y: 0.55, rx: 0.24, ry: 0.3 },
    botSpeed: reduceMotion ? 0.5 : 0.85, // pixels per frame
    fishCount: isSmallScreen ? 3 : 5,
  };

  /* ---------- Water colours (top of the lake -> bottom) ---------- */
  // (the original Lake Sentry blues: #1E5C94 -> #164A7C -> #0B1330)
  const WATER_TOP = [30, 92, 148];
  const WATER_MID = [18, 66, 112];
  const WATER_BOTTOM = [11, 19, 48];

  // How big the mini Lake Sentry robot is drawn (1 = the original small size).
  // It is drawn much bigger than any piece of trash, and its basket holds
  // at most BOT_CAPACITY pieces before the next one can be picked up.
  const BOT_SCALE = isSmallScreen ? 1.7 : 2.4;
  const BOT_CAPACITY = 2;

  /* ---------- State ---------- */
  let W = 0, H = 0, dpr = 1;          // canvas size in CSS pixels + pixel ratio
  let cell = 4, cols = 0, rows = 0;   // wave grid: size of a cell and grid dimensions
  let cur, prev;                      // Float32Array height grids (current / previous)
  let off, offCtx, img;               // small off-screen canvas the water is painted into
  let rowBase;                        // pre-computed base colour for every grid row
  let trash = [];
  let bot = null;
  let collected = 0, collectedKg = 0;
  let running = true;
  let fish = [], lilies = [], reeds = [], weeds = [];
  let pointer = null;                 // where the cursor is over the lake (or null)
  let visible = true;
  let rafId = null;
  let lastTime = 0, accumulator = 0, nextRainAt = 0, clock = 0;

  /* =============================================================
     1. Setting up the grid whenever the hero changes size
     ============================================================= */
  function resize() {
    W = hero.clientWidth;
    H = hero.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    // Pick a cell size so the grid has roughly 90,000 cells — enough
    // detail to look smooth, small enough to run fast on laptops/phones.
    cell = Math.max(3, Math.ceil(Math.sqrt((W * H) / 90000)));
    cols = Math.ceil(W / cell) + 2; // +2 = a border cell on each side
    rows = Math.ceil(H / cell) + 2;
    cur = new Float32Array(cols * rows);
    prev = new Float32Array(cols * rows);

    off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    offCtx = off.getContext('2d');
    img = offCtx.createImageData(cols, rows);
    // Alpha channel never changes, so set it once to fully opaque.
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;

    // Blend top -> middle -> bottom colours for each row.
    rowBase = new Float32Array(rows * 3);
    for (let y = 0; y < rows; y++) {
      const t = y / (rows - 1);
      const a = t < 0.5 ? WATER_TOP : WATER_MID;
      const b = t < 0.5 ? WATER_MID : WATER_BOTTOM;
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      for (let c = 0; c < 3; c++) rowBase[y * 3 + c] = a[c] + (b[c] - a[c]) * k;
    }

    // Keep trash inside the new bounds.
    trash.forEach(function (p) {
      p.x = Math.min(p.x, W + 40);
      p.y = Math.min(p.y, H - 20);
    });
    if (bot) {
      bot.x = Math.min(bot.x, W - 40);
      bot.y = Math.min(bot.y, H - 40);
    }
  }

  /* =============================================================
     2. Making ripples
     ============================================================= */
  // Push the water down in a small circle around (x, y) (CSS pixels).
  function disturb(x, y, radiusCells, amount) {
    const gx = Math.floor(x / cell) + 1;
    const gy = Math.floor(y / cell) + 1;
    const r = Math.ceil(radiusCells);
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const d = Math.sqrt(i * i + j * j);
        if (d > radiusCells) continue;
        const cx = gx + i, cy = gy + j;
        if (cx < 1 || cy < 1 || cx >= cols - 1 || cy >= rows - 1) continue;
        // Smooth "bowl" shape so ripples look round rather than blocky.
        cur[cy * cols + cx] -= amount * (0.5 + 0.5 * Math.cos((d / radiusCells) * Math.PI));
      }
    }
  }

  // Advance the wave simulation by one step (the wave-equation rule).
  function stepWater() {
    const d = SETTINGS.damping;
    for (let y = 1; y < rows - 1; y++) {
      let i = y * cols + 1;
      for (let x = 1; x < cols - 1; x++, i++) {
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - cols] + cur[i + cols]) * 0.5 - prev[i]) * d;
      }
    }
    // Swap: the grid we just wrote becomes "current".
    const tmp = cur; cur = prev; prev = tmp;
  }

  // Height and slope of the water at a CSS-pixel position (used by trash & the bot).
  function sampleWater(x, y) {
    const gx = Math.min(cols - 2, Math.max(1, Math.floor(x / cell) + 1));
    const gy = Math.min(rows - 2, Math.max(1, Math.floor(y / cell) + 1));
    const i = gy * cols + gx;
    return {
      h: cur[i],
      sx: cur[i + 1] - cur[i - 1],
      sy: cur[i + cols] - cur[i - cols],
    };
  }

  /* =============================================================
     3. Drawing the water
     ============================================================= */
  function drawWater(time) {
    const data = img.data;
    const shade = SETTINGS.shade;
    const t1 = time * 0.00045, t2 = time * 0.0003;
    for (let y = 1; y < rows - 1; y++) {
      const br = rowBase[y * 3], bg = rowBase[y * 3 + 1], bb = rowBase[y * 3 + 2];
      // A slow, gentle shimmer so the lake never looks totally flat.
      const wobble = Math.sin(y * 0.045 + t2) * 2.2;
      let i = y * cols + 1;
      let p = i * 4;
      for (let x = 1; x < cols - 1; x++, i++, p += 4) {
        const dx = cur[i - 1] - cur[i + 1];
        const dy = cur[i - cols] - cur[i + cols];
        const ambient = Math.sin(x * 0.07 + t1 + wobble) * 3.2;
        let light = (dx * 0.5 + dy * 0.85) * shade + ambient;
        // Bright "sparkle" on the steepest slopes facing the light.
        if (light > 26) light += (light - 26) * 1.6;
        data[p] = br + light * 0.9;
        data[p + 1] = bg + light;
        data[p + 2] = bb + light * 1.08;
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Stretch the small water image to fill the canvas (skipping the border cells).
    ctx.drawImage(off, 1, 1, cols - 2, rows - 2, 0, 0, (cols - 2) * cell * dpr, (rows - 2) * cell * dpr);
  }

  /* =============================================================
     4. Floating trash
     Each piece is drawn with simple canvas shapes, centred on (0,0)
     and pointing right, then rotated into place.
     ============================================================= */
  // Typical weight of one piece (kg) for the "kg collected" counter.
  const WEIGHT_KG = { bottle: 0.04, glass: 0.35, can: 0.015, bag: 0.008, wrapper: 0.005, cup: 0.01, container: 0.07 };
  const TRASH_TYPES = ['bottle', 'bottle', 'bag', 'can', 'wrapper', 'cup', 'glass', 'container'];
  const LABEL_COLOURS = ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA'];
  const WRAPPER_COLOURS = ['#F9A825', '#EF6C00', '#7B1FA2', '#C62828', '#00897B'];

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const DRAW = {
    // Plastic (PET) bottle lying on its side
    bottle: function (s, p) {
      roundRect(-s * 0.5, -s * 0.17, s * 0.78, s * 0.34, s * 0.1);
      ctx.fillStyle = 'rgba(205, 236, 248, 0.88)';
      ctx.fill();
      ctx.fillStyle = p.colour; // label
      ctx.fillRect(-s * 0.25, -s * 0.17, s * 0.3, s * 0.34);
      ctx.fillStyle = 'rgba(205, 236, 248, 0.88)'; // neck
      ctx.fillRect(s * 0.26, -s * 0.09, s * 0.14, s * 0.18);
      ctx.fillStyle = p.capColour; // cap
      ctx.fillRect(s * 0.39, -s * 0.1, s * 0.11, s * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; // shine
      ctx.fillRect(-s * 0.44, -s * 0.12, s * 0.62, s * 0.05);
    },
    // Glass bottle — green, with a longer neck
    glass: function (s) {
      roundRect(-s * 0.5, -s * 0.16, s * 0.64, s * 0.32, s * 0.12);
      ctx.fillStyle = 'rgba(60, 140, 84, 0.92)';
      ctx.fill();
      ctx.fillRect(s * 0.12, -s * 0.07, s * 0.34, s * 0.14);
      ctx.fillStyle = '#C9A227';
      ctx.fillRect(s * 0.44, -s * 0.08, s * 0.06, s * 0.16);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(-s * 0.44, -s * 0.11, s * 0.5, s * 0.04);
    },
    // Aluminium drink can
    can: function (s, p) {
      roundRect(-s * 0.3, -s * 0.16, s * 0.6, s * 0.32, s * 0.06);
      ctx.fillStyle = p.colour;
      ctx.fill();
      ctx.fillStyle = '#CFD8DC';
      ctx.fillRect(-s * 0.3, -s * 0.16, s * 0.06, s * 0.32);
      ctx.fillRect(s * 0.24, -s * 0.16, s * 0.06, s * 0.32);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-s * 0.22, -s * 0.11, s * 0.44, s * 0.04);
    },
    // Crumpled plastic bag (semi-transparent white)
    bag: function (s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.42, -s * 0.05);
      ctx.bezierCurveTo(-s * 0.4, -s * 0.36, -s * 0.05, -s * 0.28, 0, -s * 0.22);
      ctx.bezierCurveTo(s * 0.18, -s * 0.4, s * 0.46, -s * 0.2, s * 0.4, s * 0.04);
      ctx.bezierCurveTo(s * 0.46, s * 0.3, s * 0.1, s * 0.34, -s * 0.02, s * 0.24);
      ctx.bezierCurveTo(-s * 0.2, s * 0.38, -s * 0.46, s * 0.24, -s * 0.42, -s * 0.05);
      ctx.fillStyle = 'rgba(240, 244, 248, 0.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // handles
      ctx.beginPath();
      ctx.arc(s * 0.45, -s * 0.1, s * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    },
    // Chip / snack wrapper with crinkled ends
    wrapper: function (s, p) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, -s * 0.18);
      ctx.lineTo(-s * 0.28, -s * 0.12);
      ctx.lineTo(s * 0.28, -s * 0.14);
      ctx.lineTo(s * 0.36, -s * 0.2);
      ctx.lineTo(s * 0.32, 0);
      ctx.lineTo(s * 0.37, s * 0.18);
      ctx.lineTo(s * 0.27, s * 0.13);
      ctx.lineTo(-s * 0.29, s * 0.15);
      ctx.lineTo(-s * 0.37, s * 0.2);
      ctx.lineTo(-s * 0.33, 0);
      ctx.closePath();
      ctx.fillStyle = p.colour;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(-s * 0.12, -s * 0.06, s * 0.24, s * 0.1);
    },
    // Disposable cup floating on its side
    cup: function (s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.12);
      ctx.lineTo(s * 0.26, -s * 0.2);
      ctx.lineTo(s * 0.26, s * 0.2);
      ctx.lineTo(-s * 0.3, s * 0.12);
      ctx.closePath();
      ctx.fillStyle = 'rgba(250, 250, 250, 0.92)';
      ctx.fill();
      ctx.fillStyle = '#D84315';
      ctx.fillRect(-s * 0.05, -s * 0.165, s * 0.08, s * 0.33);
      ctx.beginPath();
      ctx.ellipse(s * 0.26, 0, s * 0.05, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 210, 215, 0.95)';
      ctx.fill();
    },
    // Takeaway food container (foil tray)
    container: function (s) {
      roundRect(-s * 0.3, -s * 0.22, s * 0.6, s * 0.44, s * 0.05);
      ctx.fillStyle = 'rgba(210, 216, 222, 0.92)';
      ctx.fill();
      roundRect(-s * 0.22, -s * 0.15, s * 0.44, s * 0.3, s * 0.04);
      ctx.strokeStyle = 'rgba(140, 150, 160, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    },
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // Create one piece of trash. `fromEdge` = float in from the left edge.
  // A random spot inside the middle "trash zone" (more pieces near its centre).
  function spotInZone() {
    const z = SETTINGS.trashZone;
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()); // spreads pieces evenly over the oval
    return { x: W * (z.x + Math.cos(a) * z.rx * r), y: H * (z.y + Math.sin(a) * z.ry * r) };
  }

  function makeTrash(fromEdge) {
    const type = pick(TRASH_TYPES);
    // New pieces either start in the middle, or float in from the left or
    // right edge (they then drift toward the middle on their own).
    const fromLeft = Math.random() < 0.5;
    const start = fromEdge ? { x: fromLeft ? -50 : W + 50, y: rand(H * 0.3, H * 0.8) } : spotInZone();
    return {
      type: type,
      x: start.x,
      y: start.y,
      vx: fromEdge ? (fromLeft ? 0.3 : -0.3) : rand(-0.08, 0.08),
      vy: rand(-0.05, 0.05),
      angle: rand(0, Math.PI * 2),
      spin: rand(-0.004, 0.004),
      size: rand(36, 56) * (isSmallScreen ? 0.8 : 1),
      colour: type === 'wrapper' ? pick(WRAPPER_COLOURS) : pick(LABEL_COLOURS),
      capColour: pick(['#1565C0', '#C62828', '#2E7D32', '#F9A825']),
      phase: rand(0, Math.PI * 2),
    };
  }

  // The lake "current": a slow, gentle swirl that changes over time.
  function current(time) {
    return {
      x: Math.sin(time * 0.00008) * 0.06,
      y: Math.sin(time * 0.00011 + 1.3) * 0.04,
    };
  }

  function updateTrash(p, time, dt) {
    const w = sampleWater(p.x, p.y);
    const c = current(time);
    // Ripples push trash "downhill" — away from wave crests.
    p.vx += -w.sx * 0.012 * dt + (c.x - p.vx) * 0.004 * dt;
    p.vy += -w.sy * 0.012 * dt + (c.y - p.vy) * 0.004 * dt;
    // Water drag slows everything down again.
    p.vx *= Math.pow(0.985, dt);
    p.vy *= Math.pow(0.985, dt);
    // Keep the trash in the middle of the lake: once a piece drifts
    // outside the middle oval, it's gently pulled back toward the centre.
    const z = SETTINGS.trashZone;
    const dx = (p.x - W * z.x) / (W * z.rx);
    const dy = (p.y - H * z.y) / (H * z.ry);
    const outside = Math.sqrt(dx * dx + dy * dy) - 1;
    if (outside > 0) {
      p.vx -= dx * outside * 0.0035 * dt;
      p.vy -= dy * outside * 0.0035 * dt;
    }
    const bd = bankDist(p.x, p.y);
    if (bd > -30) { const na = bankNormalAngle(); p.vx += Math.cos(na) * 0.01 * dt; p.vy += Math.sin(na) * 0.01 * dt; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Waves also make pieces twist a little.
    p.spin += (w.sx * 0.00015 - w.sy * 0.0001) * dt;
    p.spin *= Math.pow(0.99, dt);
    p.angle += p.spin * dt;

    // Pushed right off the edge by a big splash? Put it back in the middle.
    if (p.x > W + 80 || p.x < -80) { const s = spotInZone(); p.x = s.x; p.y = s.y; }
    if (p.y < H * 0.06) p.vy += 0.02 * dt;
    if (p.y > H - 10) p.vy -= 0.02 * dt;
  }

  function drawTrash(p, time) {
    const w = sampleWater(p.x, p.y);
    // Bobbing: pieces rise and fall slightly with the waves.
    const bob = Math.sin(time * 0.0016 + p.phase) * 1.4 - w.h * 0.35;
    const scale = 1 - w.h * 0.004;
    ctx.save();
    ctx.translate(p.x * dpr, (p.y + bob) * dpr);
    ctx.rotate(p.angle);
    ctx.scale(dpr * scale, dpr * scale);
    // Soft shadow on the water under each piece.
    ctx.fillStyle = 'rgba(0, 18, 26, 0.28)';
    ctx.beginPath();
    ctx.ellipse(3, 5, p.size * 0.46, p.size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    DRAW[p.type](p.size, p);
    ctx.restore();
  }

  /* =============================================================
     5. Mini Lake Sentry robot (top-down view)
     Steers towards the nearest piece of trash and "collects" it.
     ============================================================= */
  function makeBot() {
    return {
      x: W * 0.62, y: H * 0.72, angle: Math.PI, turn: 0, speed: 0.3, paddle: 0,
      target: null, targetSince: 0, mode: 'seek', wakeTimer: 0,
      cargo: [], unload: 0, skip: [],
    };
  }

  /* ---------- Lake bank (bottom-right corner, barely visible) ---------- */
  // A shoreline cutting the corner. bankDist(x, y) is positive inside the
  // bank, negative out on the water (in pixels, measured from the shoreline).
  function bankSize() {
    return isSmallScreen ? { w: W * 0.34, h: H * 0.22 } : { w: W * 0.2, h: H * 0.34 };
  }
  function bankDist(x, y) {
    const b = bankSize();
    return (b.h * (x - (W - b.w)) + b.w * (y - H)) / Math.hypot(b.h, b.w);
  }
  function bankNormalAngle() { // direction pointing away from the bank
    const b = bankSize();
    return Math.atan2(-b.w, -b.h);
  }

  function angleDiff(to, from) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function updateBot(time, dt) {
    const S = BOT_SCALE;
    const cos = Math.cos(bot.angle), sin = Math.sin(bot.angle);

    // Pieces on the conveyor ride to their slot, then are tipped into the
    // onboard storage one at a time (so the robot never has to go back).
    bot.unload += dt;
    if (bot.cargo.length && bot.unload > 170) { bot.cargo.shift(); bot.unload = 0; }
    if (!bot.cargo.length) bot.unload = 0;
    bot.cargo.forEach(function (it, i) {
      const tx = -15 + i * 14;
      it.cx += (tx - it.cx) * Math.min(1, 0.07 * dt);
      it.cy += (0 - it.cy) * Math.min(1, 0.07 * dt);
      it.sz += (13 - it.sz) * Math.min(1, 0.05 * dt);
    });
    bot.skip = bot.skip.filter(function (e) { return e.until > time; });

    // ---- anything inside the front conveyor gets pulled aboard ----
    for (let k = trash.length - 1; k >= 0 && bot.cargo.length < BOT_CAPACITY; k--) {
      const p = trash[k];
      const dx = p.x - bot.x, dy = p.y - bot.y;
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      if (lx > 8 * S && lx < 34 * S && Math.abs(ly) < 13 * S) {
        trash.splice(k, 1);
        bot.cargo.push({ p: p, cx: Math.max(10, Math.min(30, lx / S)), cy: Math.max(-10, Math.min(10, ly / S)), sz: p.size / S });
        p.angle = rand(-0.6, 0.6);
        bot.unload = 0;
        collected += 1;
        collectedKg += WEIGHT_KG[p.type] || 0.03;
        if (counterEl) counterEl.textContent = String(collected);
        if (kgEl) kgEl.textContent = collectedKg.toFixed(2);
        disturb(p.x, p.y, 2.5, 5);
        setTimeout(function () { trash.push(makeTrash(true)); }, rand(2500, 6000));
      }
    }

    const full = bot.cargo.length >= BOT_CAPACITY;

    // ---- choose a target (and keep it, so the robot doesn't dither) ----
    const valid = function (p) {
      if (p.x < 30 || p.x > W - 30 || p.y < 30 || p.y > H - 20) return false;
      if (bankDist(p.x, p.y) > -24) return false;
      return !bot.skip.some(function (e) { return e.p === p; });
    };
    if (full || (bot.target && (trash.indexOf(bot.target) < 0 || !valid(bot.target)))) bot.target = null;
    if (!full && !bot.target) {
      let bestCost = Infinity;
      trash.forEach(function (p) {
        if (!valid(p)) return;
        const dx = p.x - bot.x, dy = p.y - bot.y;
        const lx = dx * cos + dy * sin;
        const dist = Math.hypot(dx, dy);
        // prefer pieces ahead of the conveyor, penalise ones behind us
        const cost = dist + Math.abs(angleDiff(Math.atan2(dy, dx), bot.angle)) * 18 * S - (lx > 0 ? 0 : -10 * S);
        if (cost < bestCost) { bestCost = cost; bot.target = p; bot.targetSince = time; }
      });
    }
    // Stuck on one piece for too long? Give up on it for a while.
    if (bot.target && time - bot.targetSince > 16000) {
      bot.skip.push({ p: bot.target, until: time + 9000 });
      bot.target = null;
    }

    // ---- steering ----
    let wanted = bot.angle;
    let speedGoal = SETTINGS.botSpeed;
    const t = bot.target;
    if (t) {
      const dx = t.x - bot.x, dy = t.y - bot.y;
      const lx = dx * cos + dy * sin;          // distance ahead of the robot
      const ly = -dx * sin + dy * cos;         // distance to its side
      const dist = Math.hypot(dx, dy);
      const diff = angleDiff(Math.atan2(dy, dx), bot.angle);

      if (bot.mode === 'clear') {
        // Too close or on the wrong side to turn round: drive straight
        // away to open up room, then line up again for a clean approach.
        speedGoal = SETTINGS.botSpeed * 0.8;
        wanted = bot.angle;
        if (dist > 34 * S) bot.mode = 'seek';
      } else {
        wanted = Math.atan2(dy, dx);
        // Inside the turning circle (beside/behind and near)? Clear first.
        if (lx < 12 * S && dist < 26 * S) bot.mode = 'clear';
        // Come in slow and straight so the conveyor scoops it up.
        const aligned = Math.abs(diff) < 0.5;
        speedGoal = SETTINGS.botSpeed * (aligned ? (dist < 55 * S ? 0.55 : 1) : 0.45);
      }
    } else {
      // Nothing to chase (or the basket is full): cruise in gentle curves.
      bot.mode = 'seek';
      wanted = bot.angle + Math.sin(time * 0.0011) * 0.4;
      speedGoal = SETTINGS.botSpeed * 0.65;
    }

    // Keep off the lake edges and the bank.
    const m = 55 * S;
    if (bot.x < m || bot.x > W - m || bot.y < m * 1.1 || bot.y > H - m * 0.8) {
      wanted = Math.atan2(H * 0.55 - bot.y, W * 0.55 - bot.x);
      if (bot.mode === 'clear') bot.mode = 'seek';
    }
    if (bankDist(bot.x, bot.y) > -40 * S) {
      wanted = bankNormalAngle();
      speedGoal = SETTINGS.botSpeed * 0.7;
    }

    // Smooth motion: turn rate and speed ease toward their goals.
    const maxTurn = 0.028;
    const turnGoal = Math.max(-maxTurn, Math.min(maxTurn, angleDiff(wanted, bot.angle) * 0.12));
    bot.turn += (turnGoal - bot.turn) * Math.min(1, 0.08 * dt);
    bot.angle += bot.turn * dt;
    bot.speed += (speedGoal - bot.speed) * Math.min(1, 0.04 * dt);
    bot.x += Math.cos(bot.angle) * bot.speed * dt;
    bot.y += Math.sin(bot.angle) * bot.speed * dt;
    bot.x = Math.max(30 * S, Math.min(W - 30 * S, bot.x));
    bot.y = Math.max(40 * S, Math.min(H - 30 * S, bot.y));
    bot.paddle += 0.12 * dt * (bot.speed / SETTINGS.botSpeed);

    // Leave a gentle wake behind the robot.
    bot.wakeTimer += dt;
    if (bot.wakeTimer > 6) {
      bot.wakeTimer = 0;
      disturb(bot.x - Math.cos(bot.angle) * 26 * S, bot.y - Math.sin(bot.angle) * 26 * S, 1.6, 2);
    }
  }

  function drawBot() {
    ctx.save();
    ctx.translate(bot.x * dpr, bot.y * dpr);
    ctx.rotate(bot.angle);
    ctx.scale(dpr * BOT_SCALE, dpr * BOT_SCALE);
    // shadow
    ctx.fillStyle = 'rgba(0, 18, 26, 0.35)';
    ctx.fillRect(-24, -15, 52, 34);
    // thermocol floats (white) on both sides
    ctx.fillStyle = '#F4F6F8';
    ctx.fillRect(-26, -19, 40, 7);
    ctx.fillRect(-26, 12, 40, 7);
    // CPVC frame + storage basket
    ctx.strokeStyle = '#EDE3C8';
    ctx.lineWidth = 3;
    ctx.strokeRect(-24, -13, 36, 26);
    ctx.fillStyle = 'rgba(120, 150, 160, 0.55)';
    ctx.fillRect(-22, -11, 32, 22);
    // slanted mesh conveyor at the front (stripes scroll when moving)
    ctx.fillStyle = '#D9D2B8';
    ctx.fillRect(12, -12, 16, 24);
    ctx.strokeStyle = 'rgba(90, 90, 70, 0.6)';
    ctx.lineWidth = 1;
    const shift = (bot.paddle * 4) % 4;
    for (let x = 12 + shift; x < 28; x += 4) {
      ctx.beginPath(); ctx.moveTo(x, -12); ctx.lineTo(x, 12); ctx.stroke();
    }
    // pieces riding on the conveyor / in the basket (two slots)
    bot.cargo.forEach(function (it) {
      ctx.save();
      ctx.translate(it.cx, it.cy);
      ctx.rotate(it.p.angle);
      DRAW[it.p.type](it.sz, it.p);
      ctx.restore();
    });
    // paddle wheels at the back — spinning
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth = 2.5;
    [-22, 22].forEach(function (side) {
      for (let k = 0; k < 4; k++) {
        const a = bot.paddle + (k * Math.PI) / 2;
        const len = Math.cos(a) * 8;
        ctx.beginPath();
        ctx.moveTo(-18 - len, side);
        ctx.lineTo(-18 + len, side);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  /* ---------- Bank drawing ---------- */
  let bankDecor = null, bankFor = '';
  function buildBankDecor() {
    const b = bankSize();
    bankFor = W + 'x' + H;
    const pieces = [];
    const n = isSmallScreen ? 12 : 22;
    let guard = 0;
    while (pieces.length < n && guard++ < 400) {
      const x = rand(W - b.w, W), y = rand(H - b.h, H);
      if (bankDist(x, y) < 14) continue;
      pieces.push({
        type: pick(TRASH_TYPES), x: x, y: y, angle: rand(0, Math.PI * 2),
        size: rand(20, 34) * (isSmallScreen ? 0.8 : 1),
        colour: pick(WRAPPER_COLOURS.concat(LABEL_COLOURS)), capColour: pick(['#1565C0', '#C62828', '#2E7D32', '#F9A825']),
      });
    }
    // a wobbly shoreline
    const edge = [];
    for (let i = 0; i <= 12; i++) edge.push(rand(-6, 6));
    bankDecor = { pieces: pieces, edge: edge };
  }

  function drawBank() {
    if (bankFor !== W + 'x' + H) buildBankDecor();
    const b = bankSize();
    const nrm = Math.hypot(b.h, b.w);
    const nx = b.h / nrm, ny = b.w / nrm; // points into the bank
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.moveTo(W - b.w, H);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, w = bankDecor.edge[i];
      ctx.lineTo(W - b.w + b.w * t + nx * w * (i % 12 ? 1 : 0), H - b.h * t + ny * w * (i % 12 ? 1 : 0));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    // faint mud + grass, so it stays a quiet background detail
    ctx.fillStyle = 'rgba(78, 62, 40, 0.42)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 170, 110, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.clip();
    ctx.fillStyle = 'rgba(70, 100, 55, 0.18)';
    ctx.fillRect(W - b.w, H - b.h, b.w, b.h);
    ctx.restore();
    bankDecor.pieces.forEach(function (p) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.translate(p.x * dpr, p.y * dpr);
      ctx.rotate(p.angle);
      ctx.scale(dpr, dpr);
      DRAW[p.type](p.size, p);
      ctx.restore();
    });
  }

  /* =============================================================
     5b. Fish, lily pads and reeds — extra lake life
     ============================================================= */
  function makeFish() {
    return {
      x: rand(0, W), y: rand(H * 0.2, H * 0.95),
      angle: rand(0, Math.PI * 2), speed: rand(0.4, 0.8),
      size: rand(22, 36), phase: rand(0, 10), turn: 0,
    };
  }

  function updateFish(f, dt) {
    let wanted = f.angle + f.turn;
    let speed = f.speed;
    // Scared of the cursor: swim quickly away from it.
    if (pointer) {
      const d = Math.hypot(f.x - pointer.x, f.y - pointer.y);
      if (d < 140) {
        wanted = Math.atan2(f.y - pointer.y, f.x - pointer.x);
        speed = f.speed * 2.5;
        if (Math.random() < 0.02) disturb(f.x, f.y, 1.3, 2.5); // a tiny swirl
      }
    }
    // Stay inside the lake: turn back toward the middle near the edges.
    if (f.x < 40 || f.x > W - 40 || f.y < H * 0.12 || f.y > H - 30) {
      wanted = Math.atan2(H * 0.55 - f.y, W / 2 - f.x);
    }
    // Wander: a slowly changing turn.
    f.turn += rand(-0.01, 0.01) * dt;
    f.turn = Math.max(-0.02, Math.min(0.02, f.turn));
    let diff = wanted - f.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    f.angle += Math.max(-0.08, Math.min(0.08, diff)) * dt;
    f.x += Math.cos(f.angle) * speed * dt;
    f.y += Math.sin(f.angle) * speed * dt;
    f.phase += 0.12 * speed * dt;
  }

  function drawFish(f) {
    ctx.save();
    ctx.translate(f.x * dpr, f.y * dpr);
    ctx.rotate(f.angle);
    ctx.scale(dpr, dpr);
    const s = f.size;
    const tail = Math.sin(f.phase) * s * 0.18; // tail wiggle
    ctx.fillStyle = 'rgba(4, 10, 28, 0.32)';   // dark shadow under the water
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, 0);
    ctx.lineTo(-s * 0.78, -s * 0.2 + tail);
    ctx.lineTo(-s * 0.78, s * 0.2 + tail);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function makeLily(i) {
    // Lily pads sit near the left and right edges of the lake.
    const left = i % 2 === 0;
    return {
      x: left ? rand(20, W * 0.14) : rand(W * 0.86, W - 20),
      y: rand(H * 0.25, H * 0.9),
      r: rand(16, 28), angle: rand(0, Math.PI * 2),
      flower: Math.random() < 0.45, phase: rand(0, 10),
    };
  }

  function drawLily(l, time) {
    const w = sampleWater(l.x, l.y);
    const bob = Math.sin(time * 0.001 + l.phase) * 1.5 - w.h * 0.3;
    ctx.save();
    ctx.translate(l.x * dpr, (l.y + bob) * dpr);
    ctx.rotate(l.angle + Math.sin(time * 0.0004 + l.phase) * 0.1);
    ctx.scale(dpr, dpr);
    // pad with its classic notch
    ctx.fillStyle = 'rgba(46, 125, 80, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, l.r, 0.35, Math.PI * 2 - 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 200, 140, 0.5)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const a = 0.8 + k * 1.1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * l.r * 0.85, Math.sin(a) * l.r * 0.85); ctx.stroke();
    }
    if (l.flower) {
      ctx.fillStyle = '#F7B7D2';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 5 - 4, Math.sin(a) * 5 - 4, 5, 2.6, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#FFC163';
      ctx.beginPath(); ctx.arc(-4, -4, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Floating weed patches (like water hyacinth) dotted about the lake.
  function makeWeeds() {
    const list = [];
    const n = isSmallScreen ? 5 : 10;
    for (let i = 0; i < n; i++) {
      list.push({
        x: rand(W * 0.04, W * 0.96), y: rand(H * 0.18, H * 0.94),
        r: rand(14, 30), phase: rand(0, 10), angle: rand(0, Math.PI * 2),
        leaves: 5 + Math.floor(rand(0, 4)), bloom: Math.random() < 0.3,
      });
    }
    return list;
  }

  function drawWeed(wd, time) {
    const w = sampleWater(wd.x, wd.y);
    const bob = Math.sin(time * 0.0009 + wd.phase) * 1.2 - w.h * 0.3;
    ctx.save();
    ctx.translate(wd.x * dpr, (wd.y + bob) * dpr);
    ctx.rotate(wd.angle + Math.sin(time * 0.0005 + wd.phase) * 0.12);
    ctx.scale(dpr, dpr);
    for (let k = 0; k < wd.leaves; k++) {
      const a = (k / wd.leaves) * Math.PI * 2;
      const len = wd.r * (0.7 + 0.3 * ((k * 7) % 3) / 2);
      ctx.fillStyle = k % 2 ? 'rgba(52, 140, 78, 0.9)' : 'rgba(78, 168, 92, 0.9)';
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5, len * 0.5, len * 0.26, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(30, 100, 60, 0.95)';
    ctx.beginPath(); ctx.arc(0, 0, wd.r * 0.22, 0, Math.PI * 2); ctx.fill();
    if (wd.bloom) {
      ctx.fillStyle = '#C9A7F0';
      ctx.beginPath(); ctx.arc(0, 0, wd.r * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function makeReeds() {
    const list = [];
    const clusters = isSmallScreen ? 5 : 10;
    for (let i = 0; i < clusters; i++) {
      const left = i % 2 === 0;
      list.push({
        x: left ? rand(0, W * 0.12) : rand(W * 0.88, W),
        blades: 3 + Math.floor(rand(0, 3)),
        h: rand(50, 95), sway: rand(0.5, 1), phase: rand(0, 10),
      });
    }
    return list;
  }

  function drawReeds(time) {
    ctx.lineCap = 'round';
    reeds.forEach(function (c) {
      for (let b = 0; b < c.blades; b++) {
        const bx = (c.x + (b - c.blades / 2) * 8) * dpr;
        const bh = c.h * (0.7 + (b % 3) * 0.15) * dpr;
        const sway = Math.sin(time * 0.0009 * c.sway + c.phase + b) * 10 * dpr;
        ctx.beginPath();
        ctx.moveTo(bx, H * dpr);
        ctx.quadraticCurveTo(bx + sway * 0.5, H * dpr - bh * 0.55, bx + sway, H * dpr - bh);
        ctx.strokeStyle = 'rgba(60, 160, 100, 0.55)';
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();
        // cattail tip
        if (b % 2 === 0) {
          ctx.fillStyle = 'rgba(120, 80, 40, 0.85)';
          ctx.beginPath();
          ctx.ellipse(bx + sway, H * dpr - bh, 3 * dpr, 8 * dpr, sway * 0.01, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  /* =============================================================
     6. Main loop
     ============================================================= */
  function frame(now) {
    rafId = null;
    if (!running || !visible) return;
    if (!lastTime) lastTime = now;
    let elapsed = Math.min(now - lastTime, 100); // cap after tab switches
    lastTime = now;
    clock += elapsed;

    // Run the wave simulation at a steady ~60 steps per second,
    // no matter how fast the screen refreshes.
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= 16.67 && steps < 3) {
      stepWater();
      accumulator -= 16.67;
      steps++;
    }
    const dt = elapsed / 16.67; // 1.0 = one 60fps frame

    // Small natural ripples here and there. Now and then one is
    // followed by a second, fainter one nearby (like a skating insect).
    if (clock > nextRainAt) {
      const x = rand(0, W), y = rand(H * 0.1, H);
      disturb(x, y, 1.3, rand(2.5, 6));
      if (Math.random() < 0.3) {
        setTimeout(function () { disturb(x + rand(-25, 25), y + rand(-15, 15), 1.1, rand(1.5, 3)); }, rand(150, 400));
      }
      nextRainAt = clock + rand(SETTINGS.naturalEveryMs[0], SETTINGS.naturalEveryMs[1]);
    }

    fish.forEach(function (f) { updateFish(f, dt); });
    trash.forEach(function (p) { updateTrash(p, clock, dt); });
    updateBot(clock, dt);

    drawScene();

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (rafId === null && running && visible) {
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  // Draw everything, back to front: water, fish (under the surface),
  // lily pads, trash, the robot and finally the reeds at the edges.
  function drawScene() {
    drawWater(clock);
    fish.forEach(drawFish);
    weeds.forEach(function (wd) { drawWeed(wd, clock); });
    lilies.forEach(function (l) { drawLily(l, clock); });
    drawBank();
    trash.forEach(function (p) { drawTrash(p, clock); });
    drawBot();
    drawReeds(clock);
  }
  // Used when the animation is paused.
  function drawStill() { drawScene(); }

  /* =============================================================
     7. Cursor, touch and button input
     ============================================================= */
  let last = null;
  hero.addEventListener('pointermove', function (e) {
    if (!running) return;
    const rect = hero.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointer = { x: x, y: y };
    if (last) {
      // Fill in the gap between this point and the last one so fast
      // cursor movements still leave a continuous trail of ripples.
      const dist = Math.hypot(x - last.x, y - last.y);
      const n = Math.min(24, Math.ceil(dist / (cell * 2)));
      // Faster movement = slightly bigger ripples, but capped so it stays mild.
      // For the first few seconds after the page opens, ripples fade in.
      const calm = Math.min(1, 0.25 + clock / SETTINGS.calmStartMs);
      const strength = SETTINGS.cursorStrength * calm * Math.min(1.4, 0.7 + dist / 40);
      for (let k = 1; k <= n; k++) {
        disturb(last.x + ((x - last.x) * k) / n, last.y + ((y - last.y) * k) / n, 2.2, strength / Math.sqrt(n));
      }
    }
    last = { x: x, y: y };
  });
  hero.addEventListener('pointerleave', function () { last = null; pointer = null; });
  hero.addEventListener('pointerdown', function (e) {
    if (!running) return;
    // Don't splash when the visitor is clicking a link or button.
    if (e.target.closest('a, button')) return;
    const rect = hero.getBoundingClientRect();
    disturb(e.clientX - rect.left, e.clientY - rect.top, 3.5, SETTINGS.splashStrength);
  });

  function setRunning(on) {
    running = on;
    if (pauseBtn) {
      pauseBtn.querySelector('[data-label]').textContent = on ? 'Pause animation' : 'Play animation';
      pauseBtn.querySelector('[data-icon-pause]').classList.toggle('hidden', !on);
      pauseBtn.querySelector('[data-icon-play]').classList.toggle('hidden', on);
    }
    if (on) start(); else drawStill();
  }
  if (pauseBtn) pauseBtn.addEventListener('click', function () { setRunning(!running); });

  // Stop animating while the hero is scrolled out of view (saves battery).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }).observe(hero);
  }

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (!running) drawStill();
    }, 150);
  });

  /* =============================================================
     8. Go!
     ============================================================= */
  resize();
  for (let i = 0; i < SETTINGS.trashCount; i++) trash.push(makeTrash(false));
  bot = makeBot();
  for (let i = 0; i < SETTINGS.fishCount; i++) fish.push(makeFish());
  for (let i = 0; i < (isSmallScreen ? 2 : 5); i++) lilies.push(makeLily(i));
  reeds = makeReeds();
  weeds = makeWeeds();

  // Pre-run a few small ripples so the still picture isn't a flat lake.
  for (let i = 0; i < 10; i++) disturb(rand(0, W), rand(0, H), 1.4, rand(3, 6));
  for (let i = 0; i < 40; i++) stepWater();

  setRunning(true);
})();
