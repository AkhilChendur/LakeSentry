/* =====================================================================
   Home page — interactive lake surface
   ---------------------------------------------------------------------
   What you see:
     1. A water surface drawn on a <canvas>. Moving the cursor (or a
        finger) across it creates ripples; clicking/tapping makes a
        bigger splash. A few "raindrops" keep it gently moving.
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
       moves, but more calmly (no raindrops, slower robot).
   ===================================================================== */
(function () {
  'use strict';

  const hero = document.getElementById('hero');
  const canvas = document.getElementById('lake-canvas');
  if (!hero || !canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const pauseBtn = document.getElementById('lake-pause');
  const counterEl = document.getElementById('lake-counter');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmallScreen = window.matchMedia('(max-width: 640px)').matches;

  /* ---------- Tunable settings — play with these! ---------- */
  const SETTINGS = {
    damping: 0.974,            // 0.95 = ripples fade fast, 0.99 = ripples last ages
    shade: 5.5,                // how strongly slopes are lit (bigger = more contrast)
    cursorStrength: 7,         // ripple size from moving the cursor
    splashStrength: 60,        // ripple size from a click / tap
    rainEveryMs: reduceMotion ? [5000, 9000] : [500, 1400], // gap between ambient raindrops
    trashCount: isSmallScreen ? 9 : 16,
    botSpeed: reduceMotion ? 0.5 : 0.85, // pixels per frame
    fishCount: isSmallScreen ? 3 : 5,
  };

  /* ---------- Water colours (top of the lake -> bottom) ---------- */
  // (the original Lake Sentry blues: #1E5C94 -> #164A7C -> #0B1330)
  const WATER_TOP = [30, 92, 148];
  const WATER_MID = [18, 66, 112];
  const WATER_BOTTOM = [11, 19, 48];

  /* ---------- State ---------- */
  let W = 0, H = 0, dpr = 1;          // canvas size in CSS pixels + pixel ratio
  let cell = 4, cols = 0, rows = 0;   // wave grid: size of a cell and grid dimensions
  let cur, prev;                      // Float32Array height grids (current / previous)
  let off, offCtx, img;               // small off-screen canvas the water is painted into
  let rowBase;                        // pre-computed base colour for every grid row
  let trash = [];
  let bot = null;
  let collected = 0;
  let running = true;
  let fish = [], lilies = [], reeds = [];
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
  function makeTrash(fromEdge) {
    const type = pick(TRASH_TYPES);
    return {
      type: type,
      x: fromEdge ? -50 : rand(0, W),
      y: rand(H * 0.12, H * 0.94),
      vx: rand(0.05, 0.2),
      vy: rand(-0.05, 0.05),
      angle: rand(0, Math.PI * 2),
      spin: rand(-0.004, 0.004),
      size: rand(36, 56) * (isSmallScreen ? 0.8 : 1),
      colour: type === 'wrapper' ? pick(WRAPPER_COLOURS) : pick(LABEL_COLOURS),
      capColour: pick(['#1565C0', '#C62828', '#2E7D32', '#F9A825']),
      phase: rand(0, Math.PI * 2),
    };
  }

  // The lake "current" — a slow drift to the right that changes over time.
  function current(time) {
    return {
      x: 0.12 + Math.sin(time * 0.00008) * 0.06,
      y: Math.sin(time * 0.00011 + 1.3) * 0.05,
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
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Waves also make pieces twist a little.
    p.spin += (w.sx * 0.00015 - w.sy * 0.0001) * dt;
    p.spin *= Math.pow(0.99, dt);
    p.angle += p.spin * dt;

    // Floated off the edge? Wrap around to the other side.
    if (p.x > W + 60) { p.x = -55; p.y = rand(H * 0.12, H * 0.94); }
    if (p.x < -70) p.x = W + 50;
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
    return { x: W * 0.78, y: H * 0.7, angle: Math.PI, paddle: 0, target: null, wakeTimer: 0 };
  }

  function updateBot(time, dt) {
    // Find the nearest piece of trash that is fully on screen.
    let best = null, bestD = Infinity;
    trash.forEach(function (p) {
      if (p.x < 20 || p.x > W - 20) return;
      const d = Math.hypot(p.x - bot.x, p.y - bot.y);
      if (d < bestD) { bestD = d; best = p; }
    });
    bot.target = best;

    let speed = SETTINGS.botSpeed * 0.4;
    if (best) {
      // Turn gradually towards the target (like steering with two paddle wheels).
      const wanted = Math.atan2(best.y - bot.y, best.x - bot.x);
      let diff = wanted - bot.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.angle += Math.max(-0.03, Math.min(0.03, diff)) * dt;
      speed = SETTINGS.botSpeed * (Math.abs(diff) > 1.2 ? 0.35 : 1);

      // Close enough to the front conveyor? Collect it!
      const noseX = bot.x + Math.cos(bot.angle) * 26;
      const noseY = bot.y + Math.sin(bot.angle) * 26;
      if (Math.hypot(best.x - noseX, best.y - noseY) < 22) {
        trash.splice(trash.indexOf(best), 1);
        collected += 1;
        if (counterEl) counterEl.textContent = String(collected);
        disturb(best.x, best.y, 3, 18); // a little splash
        // A new piece drifts in from the edge a few seconds later —
        // just like in real life, the trash keeps coming. That's why
        // Lake Sentry pairs the robot with an awareness campaign!
        setTimeout(function () { trash.push(makeTrash(true)); }, rand(2500, 6000));
      }
    }

    bot.x += Math.cos(bot.angle) * speed * dt;
    bot.y += Math.sin(bot.angle) * speed * dt;
    bot.x = Math.max(30, Math.min(W - 30, bot.x));
    bot.y = Math.max(40, Math.min(H - 30, bot.y));
    bot.paddle += 0.12 * dt * (speed / SETTINGS.botSpeed);

    // Leave a gentle wake behind the robot.
    bot.wakeTimer += dt;
    if (bot.wakeTimer > 5) {
      bot.wakeTimer = 0;
      disturb(bot.x - Math.cos(bot.angle) * 26, bot.y - Math.sin(bot.angle) * 26, 2, 5);
    }
  }

  function drawBot() {
    ctx.save();
    ctx.translate(bot.x * dpr, bot.y * dpr);
    ctx.rotate(bot.angle);
    ctx.scale(dpr, dpr);
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
        speed = f.speed * 4;
        if (Math.random() < 0.04) disturb(f.x, f.y, 1.5, 6); // a little splash
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

  function makeReeds() {
    const list = [];
    const clusters = isSmallScreen ? 3 : 6;
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

    // Ambient raindrops
    if (clock > nextRainAt) {
      disturb(rand(0, W), rand(0, H), 1.6, rand(10, 22));
      nextRainAt = clock + rand(SETTINGS.rainEveryMs[0], SETTINGS.rainEveryMs[1]);
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
    lilies.forEach(function (l) { drawLily(l, clock); });
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
      const strength = SETTINGS.cursorStrength * Math.min(2.2, 0.6 + dist / 25);
      for (let k = 1; k <= n; k++) {
        disturb(last.x + ((x - last.x) * k) / n, last.y + ((y - last.y) * k) / n, 2.2, strength / Math.sqrt(n));
      }
    }
    last = { x: x, y: y };
    pointer = { x: x, y: y };
  });
  hero.addEventListener('pointerleave', function () { last = null; pointer = null; });
  hero.addEventListener('pointerdown', function (e) {
    if (!running) return;
    // Don't splash when the visitor is clicking a link or button.
    if (e.target.closest('a, button')) return;
    const rect = hero.getBoundingClientRect();
    disturb(e.clientX - rect.left, e.clientY - rect.top, 4.5, SETTINGS.splashStrength);
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

  // Pre-run a few raindrops so the still picture isn't a flat lake.
  for (let i = 0; i < 6; i++) disturb(rand(0, W), rand(0, H), 2.5, 30);
  for (let i = 0; i < 40; i++) stepWater();

  setRunning(true);
})();
