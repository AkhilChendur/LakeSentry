/* =====================================================================
   App page — Tool 2: Lake Sentry V1 simulator
   ---------------------------------------------------------------------
   A small top-down game that walks through a real V1 clean-up run:

     1. AIM    — steer the robot toward floating trash
     2. SCOOP  — drive into trash so the front conveyor lifts it aboard
     3. RETURN — drive back to the lake bank when storage/battery is low
     4. RECORD — at the bank the load is weighed and the trip is logged

   Things you can change (just like the real engineering journey):
     - Conveyor rod: "Original" (smooth rod: items often slip off, which
       was the real V1 problem) or "Modified" (friction points added).
     - V2 ideas: a solar panel (slowly recharges the battery) and a
       waste-detection sensor (points to the nearest collectable trash).

   Controls: Arrow keys or W A S D while the game area is focused, or
   the on-screen buttons. P pauses.

   Scale used for the numbers: 10 canvas pixels = 1 metre.
   ===================================================================== */
(function () {
  'use strict';

  const canvas = document.getElementById('sim-canvas');
  const stage = document.getElementById('sim-stage');
  if (!canvas || !stage || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  /* ---------- Page elements ---------- */
  const $ = function (id) { return document.getElementById(id); };
  const startBtn = $('sim-start');
  const resetBtn = $('sim-reset');
  const overlay = $('sim-overlay');
  const liveEl = $('sim-live');
  const ui = {
    storageBar: $('sim-storage-bar'), storageText: $('sim-storage-text'),
    batteryBar: $('sim-battery-bar'), batteryText: $('sim-battery-text'),
    tripPieces: $('sim-trip-pieces'), totalPieces: $('sim-total-pieces'),
    totalWeight: $('sim-total-weight'), slips: $('sim-slips'),
    sensor: $('sim-sensor'), sensorRow: $('sim-sensor-row'),
    logBody: $('sim-log-body'), logEmpty: $('sim-log-empty'),
    phases: document.querySelectorAll('#sim-phases [data-phase]'),
  };

  /* ---------- World size & layout ---------- */
  const W = 960, H = 600;             // logical size of the lake (pixels)
  const BANK_Y = 540;                 // where the water ends and the bank begins
  const DOCK = { x: 40, y: 450, w: 200, h: 90 }; // unloading zone next to the bank
  const PX_PER_M = 10;

  /* ---------- Trash types: weight (g) and how much storage space they use ---------- */
  const TYPES = {
    bottle:    { label: 'PET bottle',      grams: 25,   space: 9 },
    bag:       { label: 'Plastic bag',     grams: 6,    space: 4 },
    wrapper:   { label: 'Food wrapper',    grams: 4,    space: 3 },
    container: { label: 'Food container',  grams: 18,   space: 8 },
    glass:     { label: 'Glass bottle',    grams: 350,  space: 12 },
    crate:     { label: 'Broken crate',    grams: 2500, space: 0, tooBig: true },
  };
  const SPAWN_POOL = ['bottle', 'bottle', 'bottle', 'bag', 'bag', 'wrapper', 'wrapper', 'container', 'glass', 'crate'];
  const MAX_TRASH = 16;
  const CAPACITY = 100; // storage space units

  /* ---------- Game state ---------- */
  let bot, trash, storage, battery, trips, totals, slips, tripStart, recordFlashUntil;
  let running = false, started = false, rafId = null, lastTime = 0, clock = 0;
  let nextSpawnAt = 0, conveyorScroll = 0, uiTimer = 0, lastSensorText = '';
  const keys = { fwd: false, back: false, left: false, right: false };
  const cooldowns = {}; // stops the same message being announced over and over

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function settings() {
    return {
      modifiedRod: $('sim-rod-modified').checked,
      solar: $('sim-solar').checked,
      sensor: $('sim-sensor-toggle').checked,
    };
  }

  /* =============================================================
     Setup / reset
     ============================================================= */
  function makeTrash(type, fromEdge) {
    let x, y;
    let tries = 0;
    do {
      x = fromEdge ? (Math.random() < 0.5 ? 20 : W - 20) : rand(60, W - 60);
      y = rand(50, BANK_Y - 60);
      tries++;
      // Keep new trash away from the dock and from the robot.
    } while (tries < 30 && ((x > DOCK.x - 30 && x < DOCK.x + DOCK.w + 30 && y > DOCK.y - 60) ||
      (bot && Math.hypot(x - bot.x, y - bot.y) < 110)));
    return {
      type: type, x: x, y: y,
      vx: rand(-0.12, 0.12), vy: rand(-0.08, 0.08),
      angle: rand(0, Math.PI * 2), spin: rand(-0.01, 0.01),
      lifting: false, lift: 0, liftLy: 0, slipChecked: false,
      colour: pick(['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA']),
    };
  }

  function reset() {
    bot = { x: DOCK.x + DOCK.w / 2, y: DOCK.y + 20, angle: -Math.PI / 2, vel: 0, turnVel: 0, paddle: 0 };
    trash = [];
    for (let i = 0; i < 13; i++) trash.push(makeTrash(pick(SPAWN_POOL.filter(function (t) { return t !== 'crate'; })), false));
    trash.push(makeTrash('crate', false));
    storage = [];
    battery = 100;
    trips = [];
    totals = { pieces: 0, grams: 0 };
    slips = 0;
    tripStart = 0;
    recordFlashUntil = 0;
    clock = 0;
    nextSpawnAt = 7000;
    ui.logBody.textContent = '';
    ui.logEmpty.hidden = false;
    updateUI(true);
    draw();
  }

  /* =============================================================
     Messages for screen readers (and everyone — shown under the game)
     ============================================================= */
  function say(msg, key, cooldownMs) {
    if (key) {
      if (cooldowns[key] && clock < cooldowns[key]) return;
      cooldowns[key] = clock + (cooldownMs || 4000);
    }
    liveEl.textContent = msg;
  }

  /* =============================================================
     Physics & game rules (called every frame)
     ============================================================= */
  function storageUsed() {
    return storage.reduce(function (sum, t) { return sum + TYPES[t].space; }, 0);
  }

  function update(dt) {
    const s = settings();
    const fill = storageUsed() / CAPACITY;
    const hasPower = battery > 0;

    // --- Driving: two propellers let V1 go forward, reverse and turn ---
    const thrust = hasPower ? (keys.fwd ? 1 : 0) - (keys.back ? 0.6 : 0) : 0;
    const turn = hasPower ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0;
    const heavy = 1 - fill * 0.35; // a full basket makes the robot slower
    bot.vel += thrust * 0.07 * heavy * dt;
    bot.vel *= Math.pow(0.95, dt);
    bot.vel = Math.max(-1.4, Math.min(2.8, bot.vel));
    bot.turnVel += turn * 0.0045 * dt;
    bot.turnVel *= Math.pow(0.82, dt);
    bot.angle += bot.turnVel * dt;
    bot.x += Math.cos(bot.angle) * bot.vel * dt;
    bot.y += Math.sin(bot.angle) * bot.vel * dt;
    // Bump off the shoreline.
    if (bot.x < 36 || bot.x > W - 36) { bot.x = Math.max(36, Math.min(W - 36, bot.x)); bot.vel *= -0.3; }
    if (bot.y < 36 || bot.y > BANK_Y - 22) { bot.y = Math.max(36, Math.min(BANK_Y - 22, bot.y)); bot.vel *= -0.3; }
    bot.paddle += (bot.vel * 0.08 + Math.abs(bot.turnVel) * 4) * dt;
    if (Math.abs(bot.vel) > 0.3) conveyorScroll += dt;

    // --- Battery: drains while motors run; V2 solar trickle-charges it ---
    const drain = 0.0015 + Math.abs(thrust) * 0.014 + Math.abs(turn) * 0.004;
    battery -= drain * dt;
    if (s.solar) battery += 0.006 * dt;
    battery = Math.max(0, Math.min(100, battery));
    if (battery <= 0) say('Battery empty. V1 needs manual charging at the bank. Use “Tow back to bank”, or try the V2 solar idea.', 'battery', 8000);
    else if (battery < 20) say('Battery low: head back to the bank.', 'battery-low', 15000);

    // Start the trip timer the first time the robot leaves the dock.
    if (!tripStart && !inDock()) tripStart = clock;

    // --- Trash drifting on the water ---
    const cos = Math.cos(bot.angle), sin = Math.sin(bot.angle);
    trash.forEach(function (t) {
      if (t.lifting) return;
      t.vx += rand(-0.004, 0.004) * dt;
      t.vy += rand(-0.004, 0.004) * dt;
      t.vx = Math.max(-0.25, Math.min(0.25, t.vx));
      t.vy = Math.max(-0.2, Math.min(0.2, t.vy));
      t.x += t.vx * dt; t.y += t.vy * dt;
      t.angle += t.spin * dt;
      if (t.x < 20 || t.x > W - 20) t.vx *= -1;
      if (t.y < 20 || t.y > BANK_Y - 25) t.vy *= -1;
      t.x = Math.max(20, Math.min(W - 20, t.x));
      t.y = Math.max(20, Math.min(BANK_Y - 25, t.y));

      // Position of the trash relative to the robot ("local" coordinates:
      // lx = how far in front, ly = how far to the side).
      const dx = t.x - bot.x, dy = t.y - bot.y;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;

      // Is it touching the conveyor at the front?
      if (lx > 22 && lx < 46 && Math.abs(ly) < 20) {
        const info = TYPES[t.type];
        const pushAway = function () {
          t.x = bot.x + cos * 50 - sin * ly;
          t.y = bot.y + sin * 50 + cos * ly;
          t.vx = cos * 0.8; t.vy = sin * 0.8;
        };
        if (info.tooBig) {
          pushAway();
          say(info.label + ' is too large for V1’s conveyor, which handles light and medium loads only. Large debris is a challenge for V2.', 'toobig', 6000);
        } else if (storageUsed() + info.space > CAPACITY) {
          pushAway();
          say('Storage is full. Return to the bank to unload.', 'full', 5000);
        } else if (bot.vel > 0.35) {
          // Driving forward into it: the mesh conveyor picks it up.
          t.lifting = true; t.lift = 0; t.liftLy = ly; t.slipChecked = false;
        } else {
          pushAway();
          say('Drive forward into the trash so the conveyor can scoop it up.', 'forward', 7000);
        }
      }
    });

    // --- Items riding up the conveyor ---
    for (let i = trash.length - 1; i >= 0; i--) {
      const t = trash[i];
      if (!t.lifting) continue;
      t.lift += 0.022 * dt;
      // Halfway up, a smooth (original) rod may let the item slip back down.
      if (!t.slipChecked && t.lift > 0.5) {
        t.slipChecked = true;
        if (!s.modifiedRod && Math.random() < 0.5) {
          t.lifting = false;
          t.x = bot.x + cos * 52; t.y = bot.y + sin * 52;
          t.vx = cos * 0.6; t.vy = sin * 0.6;
          slips++;
          say(TYPES[t.type].label + ' slipped off the smooth conveyor rod and fell back into the lake.', 'slip', 2500);
          continue;
        }
      }
      if (t.lift >= 1) {
        trash.splice(i, 1);
        storage.push(t.type);
        const pct = Math.round((storageUsed() / CAPACITY) * 100);
        say('Collected: ' + TYPES[t.type].label + ' (' + TYPES[t.type].grams + ' g). Storage ' + pct + '% full.');
      }
    }

    // --- Unloading at the bank (the "Record" step) ---
    if (inDock() && storage.length && Math.abs(bot.vel) < 1.6) recordTrip();
    if (inDock() && battery < 100) battery = Math.min(100, battery + 0.8 * dt); // charging at the bank

    // --- New trash keeps arriving: the reason prevention matters too ---
    if (clock > nextSpawnAt) {
      if (trash.length < MAX_TRASH) trash.push(makeTrash(pick(SPAWN_POOL), true));
      nextSpawnAt = clock + rand(6000, 11000);
    }
  }

  function inDock() {
    return bot.x > DOCK.x && bot.x < DOCK.x + DOCK.w && bot.y > DOCK.y;
  }

  function recordTrip() {
    const grams = storage.reduce(function (sum, t) { return sum + TYPES[t].grams; }, 0);
    const counts = {};
    storage.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    const seconds = tripStart ? Math.round((clock - tripStart) / 1000) : 0;
    const trip = { n: trips.length + 1, pieces: storage.length, grams: grams, seconds: seconds, counts: counts };
    trips.push(trip);
    totals.pieces += trip.pieces;
    totals.grams += grams;
    storage = [];
    tripStart = 0;
    recordFlashUntil = clock + 2600;
    addLogRow(trip);
    const msg = 'Trip ' + trip.n + ' recorded: ' + trip.pieces + ' pieces, ' + formatWeight(grams) + ', in ' + seconds + ' seconds.';
    say(msg);
    return msg;
  }

  function formatWeight(g) {
    return g >= 1000 ? (g / 1000).toFixed(2) + ' kg' : g + ' g';
  }

  /* =============================================================
     Sensor (V2 idea): find the nearest collectable trash
     ============================================================= */
  function nearestTrash() {
    let best = null, bestD = Infinity;
    trash.forEach(function (t) {
      if (t.lifting || TYPES[t.type].tooBig) return;
      const d = Math.hypot(t.x - bot.x, t.y - bot.y);
      if (d < bestD) { bestD = d; best = t; }
    });
    return best ? { t: best, d: bestD } : null;
  }

  function directionWords(t) {
    let a = Math.atan2(t.y - bot.y, t.x - bot.x) - bot.angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    if (Math.abs(deg) < 20) return 'straight ahead';
    if (Math.abs(deg) > 150) return 'behind you';
    const side = deg > 0 ? 'right' : 'left';
    return Math.abs(deg) < 70 ? 'ahead to the ' + side : 'to your ' + side;
  }

  /* =============================================================
     Drawing
     ============================================================= */
  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Water
    const g = ctx.createLinearGradient(0, 0, 0, BANK_Y);
    g.addColorStop(0, '#1F6F86');
    g.addColorStop(1, '#0C4150');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, BANK_Y);
    // Gentle wave lines
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    for (let y = 30; y < BANK_Y; y += 36) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = y + Math.sin(x * 0.03 + clock * 0.0012 + y) * 3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // Bank (land) with grass
    ctx.fillStyle = '#D9C79A';
    ctx.fillRect(0, BANK_Y, W, H - BANK_Y);
    ctx.fillStyle = '#6FA85A';
    ctx.fillRect(0, BANK_Y, W, 8);
    ctx.fillStyle = '#3F2E14';
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    ctx.fillText('LAKE BANK', W - 130, H - 22);

    // Dock / unloading zone
    ctx.fillStyle = 'rgba(253, 224, 71, 0.18)';
    ctx.fillRect(DOCK.x, DOCK.y, DOCK.w, DOCK.h);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 2;
    ctx.strokeRect(DOCK.x, DOCK.y, DOCK.w, DOCK.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#8B5E34'; // wooden pier
    ctx.fillRect(DOCK.x + DOCK.w + 6, DOCK.y + 30, 18, 70);
    // Label sits just above the zone so the robot never covers it.
    ctx.fillStyle = '#FDE047';
    ctx.font = '700 14px Inter, system-ui, sans-serif';
    ctx.fillText('UNLOAD & RECORD HERE', DOCK.x, DOCK.y - 10);

    // Reeds in the top corners
    ctx.strokeStyle = '#4E8B3A';
    ctx.lineWidth = 3;
    [[18, 30], [30, 16], [W - 22, 24], [W - 36, 12]].forEach(function (r, i) {
      ctx.beginPath();
      ctx.moveTo(r[0], r[1] + 30);
      ctx.quadraticCurveTo(r[0] + Math.sin(clock * 0.001 + i) * 4, r[1] + 12, r[0] + 3, r[1]);
      ctx.stroke();
    });

    // Sensor guide line (V2)
    const s = settings();
    if (s.sensor) {
      const n = nearestTrash();
      if (n) {
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.lineTo(n.t.x, n.t.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(n.t.x, n.t.y, 22 + Math.sin(clock * 0.006) * 3, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Trash
    trash.forEach(function (t) {
      if (t.lifting) {
        // Ride up the conveyor, shrinking as it moves "up" the ramp.
        const cos = Math.cos(bot.angle), sin = Math.sin(bot.angle);
        const lx = 40 - t.lift * 30, ly = t.liftLy * (1 - t.lift);
        drawTrash(t, bot.x + lx * cos - ly * sin, bot.y + lx * sin + ly * cos, 1 - t.lift * 0.35);
      } else {
        drawTrash(t, t.x, t.y, 1);
      }
    });

    drawBot(s);
  }

  function drawTrash(t, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.angle);
    ctx.scale(scale * 1.35, scale * 1.35); // drawn a bit larger than life so it's easy to see
    ctx.fillStyle = 'rgba(0, 20, 30, 0.3)';
    ctx.beginPath(); ctx.ellipse(3, 4, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
    switch (t.type) {
      case 'bottle':
        ctx.fillStyle = 'rgba(210, 238, 250, 0.95)'; ctx.fillRect(-13, -5, 20, 10);
        ctx.fillStyle = t.colour; ctx.fillRect(-6, -5, 8, 10);
        ctx.fillStyle = 'rgba(210, 238, 250, 0.95)'; ctx.fillRect(7, -3, 4, 6);
        ctx.fillStyle = '#1565C0'; ctx.fillRect(11, -3, 3, 6);
        break;
      case 'bag':
        ctx.fillStyle = 'rgba(245, 247, 250, 0.85)';
        ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(12, -4, 3, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'wrapper':
        ctx.fillStyle = t.colour;
        ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(10, -5); ctx.lineTo(12, 0); ctx.lineTo(10, 6); ctx.lineTo(-10, 5); ctx.lineTo(-12, 0); ctx.closePath(); ctx.fill();
        break;
      case 'container':
        ctx.fillStyle = '#D6DCE2'; ctx.fillRect(-10, -7, 20, 14);
        ctx.strokeStyle = '#8A949E'; ctx.lineWidth = 1; ctx.strokeRect(-7, -4, 14, 8);
        break;
      case 'glass':
        ctx.fillStyle = 'rgba(60, 140, 84, 0.95)'; ctx.fillRect(-13, -5, 18, 10); ctx.fillRect(5, -2.5, 8, 5);
        break;
      case 'crate':
        ctx.fillStyle = '#8B5E34'; ctx.fillRect(-24, -16, 48, 32);
        ctx.strokeStyle = '#5A3A1C'; ctx.lineWidth = 3;
        ctx.strokeRect(-24, -16, 48, 32);
        ctx.beginPath(); ctx.moveTo(-24, -5); ctx.lineTo(24, -5); ctx.moveTo(-24, 6); ctx.lineTo(24, 6); ctx.stroke();
        break;
    }
    ctx.restore();
  }

  function drawBot(s) {
    ctx.save();
    ctx.translate(bot.x, bot.y);
    ctx.rotate(bot.angle);
    ctx.scale(1.15, 1.15);
    // shadow
    ctx.fillStyle = 'rgba(0, 20, 30, 0.35)';
    ctx.fillRect(-30, -22, 70, 48);
    // thermocol floats along both sides
    ctx.fillStyle = '#F7F9FA';
    ctx.fillRect(-32, -26, 54, 10);
    ctx.fillRect(-32, 16, 54, 10);
    // CPVC frame
    ctx.strokeStyle = '#EDE3C8';
    ctx.lineWidth = 4;
    ctx.strokeRect(-30, -18, 52, 36);
    // storage basket — fills up as trash is collected
    const fill = storageUsed() / CAPACITY;
    ctx.fillStyle = 'rgba(160, 190, 200, 0.5)';
    ctx.fillRect(-27, -15, 46, 30);
    ctx.fillStyle = fill > 0.85 ? '#E2B24A' : '#86CF98';
    ctx.fillRect(-27, 15 - 30 * fill, 46, 30 * fill);
    // conveyor ramp at the front, with mesh stripes that scroll
    ctx.fillStyle = '#DCD5BC';
    ctx.fillRect(22, -18, 24, 36);
    ctx.strokeStyle = 'rgba(80, 80, 60, 0.6)';
    ctx.lineWidth = 1.5;
    const off = (conveyorScroll * 1.5) % 6;
    for (let x = 46 - off; x > 22; x -= 6) {
      ctx.beginPath(); ctx.moveTo(x, -18); ctx.lineTo(x, 18); ctx.stroke();
    }
    // paddle wheels on both sides at the back
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth = 3.5;
    [-31, 31].forEach(function (side) {
      for (let k = 0; k < 4; k++) {
        const len = Math.cos(bot.paddle + (k * Math.PI) / 2) * 11;
        ctx.beginPath(); ctx.moveTo(-22 - len, side); ctx.lineTo(-22 + len, side); ctx.stroke();
      }
    });
    // V2 extras
    if (s.solar) {
      ctx.fillStyle = '#1E3A8A';
      ctx.fillRect(-24, -10, 30, 20);
      ctx.strokeStyle = '#93C5FD'; ctx.lineWidth = 1;
      for (let x = -24; x <= 6; x += 10) { ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, 10); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(6, 0); ctx.stroke();
    }
    if (s.sensor) {
      ctx.fillStyle = '#FDE047';
      ctx.beginPath(); ctx.arc(48, 0, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* =============================================================
     Updating the text panel next to the game
     ============================================================= */
  function currentPhase() {
    if (clock < recordFlashUntil) return 'record';
    if (trash.some(function (t) { return t.lifting; })) return 'scoop';
    if (storageUsed() / CAPACITY >= 0.75 || battery < 25) return 'return';
    return 'aim';
  }

  function updateUI(force) {
    const used = Math.round((storageUsed() / CAPACITY) * 100);
    ui.storageBar.style.width = used + '%';
    ui.storageText.textContent = used + '%';
    const bat = Math.round(battery);
    ui.batteryBar.style.width = bat + '%';
    ui.batteryBar.className = 'h-full rounded-full ' + (bat < 20 ? 'bg-red-700' : 'bg-reed-500');
    ui.batteryText.textContent = bat + '%';
    ui.tripPieces.textContent = String(storage.length);
    ui.totalPieces.textContent = String(totals.pieces);
    ui.totalWeight.textContent = formatWeight(totals.grams);
    ui.slips.textContent = String(slips);

    const phase = currentPhase();
    ui.phases.forEach(function (li) {
      const on = li.dataset.phase === phase;
      if (on) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });

    const s = settings();
    ui.sensorRow.hidden = !s.sensor;
    if (s.sensor) {
      const n = nearestTrash();
      const text = n ? TYPES[n.t.type].label + ', ' + Math.round(n.d / PX_PER_M) + ' m ' + directionWords(n.t) : 'No collectable trash detected.';
      if (force || text !== lastSensorText) { ui.sensor.textContent = text; lastSensorText = text; }
    }
  }

  function addLogRow(trip) {
    ui.logEmpty.hidden = true;
    const tr = document.createElement('tr');
    tr.className = 'border-t border-lake-100';
    const breakdown = Object.keys(trip.counts).map(function (k) { return trip.counts[k] + ' × ' + TYPES[k].label; }).join(', ');
    [String(trip.n), String(trip.pieces), formatWeight(trip.grams), trip.seconds + ' s', breakdown].forEach(function (v, i) {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) cell.scope = 'row';
      cell.className = 'px-3 py-2 ' + (i === 0 ? 'font-semibold text-lake-950' : 'text-slate-700');
      cell.textContent = v;
      tr.appendChild(cell);
    });
    ui.logBody.appendChild(tr);
  }

  /* =============================================================
     Main loop
     ============================================================= */
  function frame(now) {
    rafId = null;
    if (!running) return;
    const elapsed = Math.min(now - (lastTime || now), 50);
    lastTime = now;
    clock += elapsed;
    update(elapsed / 16.67);
    draw();
    uiTimer += elapsed;
    if (uiTimer > 150) { uiTimer = 0; updateUI(); }
    rafId = requestAnimationFrame(frame);
  }

  function setRunning(on) {
    running = on;
    startBtn.textContent = on ? 'Pause' : (started ? 'Resume' : 'Start simulation');
    overlay.hidden = on;
    if (on) {
      started = true;
      lastTime = 0;
      if (rafId === null) rafId = requestAnimationFrame(frame);
    } else {
      releaseAll();
      updateUI(true);
    }
  }

  /* =============================================================
     Controls: keyboard, on-screen buttons, settings
     ============================================================= */
  const KEYMAP = {
    ArrowUp: 'fwd', w: 'fwd', W: 'fwd',
    ArrowDown: 'back', s: 'back', S: 'back',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };

  function releaseAll() { keys.fwd = keys.back = keys.left = keys.right = false; }

  // Keys only steer the robot while the game area has focus, so the
  // arrow keys still scroll the page normally everywhere else.
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); setRunning(!running); return; }
    const k = KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    if (!running) setRunning(true);
    keys[k] = true;
  });
  stage.addEventListener('keyup', function (e) {
    const k = KEYMAP[e.key];
    if (k) keys[k] = false;
  });
  stage.addEventListener('blur', releaseAll);
  // Clicking the game area focuses it so the keyboard works right away.
  stage.addEventListener('pointerdown', function () { stage.focus(); });

  // On-screen buttons: hold to drive (mouse/touch), or hold Enter/Space.
  document.querySelectorAll('[data-drive]').forEach(function (btn) {
    const k = btn.dataset.drive;
    const press = function (e) {
      e.preventDefault();
      if (!running) setRunning(true);
      keys[k] = true;
    };
    const release = function () { keys[k] = false; };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') press(e); });
    btn.addEventListener('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') release(); });
    btn.addEventListener('blur', release);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  startBtn.addEventListener('click', function () {
    setRunning(!running);
    if (running) {
      stage.focus();
      say('Simulation started. Use the arrow keys to drive, or the on-screen controls.');
    }
  });
  overlay.querySelector('button').addEventListener('click', function () {
    setRunning(true);
    stage.focus();
    say('Simulation started. Use the arrow keys to drive, or the on-screen controls.');
  });

  resetBtn.addEventListener('click', function () {
    setRunning(false);
    started = false;
    startBtn.textContent = 'Start simulation';
    reset();
    say('Simulation reset.');
  });

  $('sim-tow').addEventListener('click', function () {
    bot.x = DOCK.x + DOCK.w / 2; bot.y = DOCK.y + 30; bot.vel = 0; bot.angle = -Math.PI / 2;
    battery = 100;
    const tripMsg = storage.length ? ' ' + recordTrip() : '';
    say('Robot towed back to the bank and the battery was recharged.' + tripMsg);
    updateUI(true);
    draw();
  });

  // Announce settings changes so their effect is clear.
  $('sim-rod-original').addEventListener('change', function () { say('Original smooth rod selected: expect some items to slip off the conveyor.'); });
  $('sim-rod-modified').addEventListener('change', function () { say('Modified rod with friction points selected: items should stay on the conveyor.'); });
  $('sim-solar').addEventListener('change', function (e) { say(e.target.checked ? 'Solar panel on: the battery slowly recharges while the robot works.' : 'Solar panel off.'); if (!running) draw(); });
  $('sim-sensor-toggle').addEventListener('change', function (e) { say(e.target.checked ? 'Waste-detection sensor on: it points to the nearest collectable trash.' : 'Sensor off.'); updateUI(true); if (!running) draw(); });

  // Pause automatically if the visitor switches tabs.
  document.addEventListener('visibilitychange', function () { if (document.hidden && running) setRunning(false); });

  reset();
  setRunning(false);
})();
