/* =====================================================================
   Immersive lake (experience.html) — admin-only preview
   ---------------------------------------------------------------------
   One fixed canvas; scrolling drives the story:
     surface (calm) → surface choked with trash → dive → torch-lit
     seabed of rubbish → Lake Sentry rises and clears the water.
   Everything is drawn procedurally, no images or libraries.
   ===================================================================== */
(function () {
  'use strict';
  const admin = window.LakeSentryAdmin;
  if (!admin || !admin.isLoggedIn()) { document.getElementById('gate').classList.add('show'); return; }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('gl');
  const ctx = canvas.getContext('2d');
  const scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
  const meter = document.querySelector('#meter i');
  const hint = document.getElementById('hint');
  let W = 0, H = 0, dpr = 1;

  const rand = function (a, b) { return a + Math.random() * (b - a); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const smooth = function (a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const COL = ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#F9A825', '#CFD8DC'];

  /* ---------- Trash pieces (shared shapes) ---------- */
  function makePiece(i) {
    return {
      kind: i % 5, c: COL[Math.floor(Math.random() * COL.length)], s: rand(0.7, 1.5),
      a: rand(0, Math.PI * 2), spin: rand(-0.4, 0.4), ph: rand(0, 9),
      x: rand(-0.1, 1.1), y: rand(-1, 1), z: rand(0.35, 1),
    };
  }
  function drawPiece(k, c, size) {
    ctx.fillStyle = c; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
    if (k === 0) { // bottle
      ctx.beginPath(); ctx.roundRect(-size * 0.5, -size * 0.18, size, size * 0.36, size * 0.12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#EEE'; ctx.fillRect(size * 0.5, -size * 0.08, size * 0.14, size * 0.16);
    } else if (k === 1) { // bag
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, 0); ctx.quadraticCurveTo(-size * 0.2, -size * 0.55, size * 0.15, -size * 0.3);
      ctx.quadraticCurveTo(size * 0.6, -size * 0.1, size * 0.3, size * 0.35); ctx.quadraticCurveTo(-size * 0.1, size * 0.5, -size * 0.5, 0);
      ctx.globalAlpha *= 0.8; ctx.fill(); ctx.stroke(); ctx.globalAlpha /= 0.8;
    } else if (k === 2) { // can
      ctx.beginPath(); ctx.roundRect(-size * 0.3, -size * 0.2, size * 0.6, size * 0.4, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#B0BEC5'; ctx.fillRect(-size * 0.3, -size * 0.2, size * 0.08, size * 0.4);
    } else if (k === 3) { // cup
      ctx.beginPath(); ctx.moveTo(-size * 0.3, -size * 0.25); ctx.lineTo(size * 0.3, -size * 0.25); ctx.lineTo(size * 0.2, size * 0.25); ctx.lineTo(-size * 0.2, size * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else { // wrapper
      ctx.beginPath(); ctx.moveTo(-size * 0.5, -size * 0.12); ctx.lineTo(-size * 0.3, 0); ctx.lineTo(-size * 0.5, size * 0.12);
      ctx.lineTo(size * 0.5, size * 0.12); ctx.lineTo(size * 0.3, 0); ctx.lineTo(size * 0.5, -size * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  const floaters = []; for (let i = 0; i < 110; i++) floaters.push(makePiece(i));
  const sunk = []; for (let i = 0; i < 90; i++) { const p = makePiece(i); p.y = rand(0.1, 1); sunk.push(p); }
  const snow = []; for (let i = 0; i < 140; i++) snow.push({ x: Math.random(), y: Math.random(), z: rand(0.2, 1), ph: rand(0, 9) });
  const fishes = []; for (let i = 0; i < 7; i++) fishes.push({ x: Math.random(), y: rand(0.2, 0.8), v: rand(0.02, 0.05), s: rand(18, 34) });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  window.addEventListener('resize', function () { resize(); draw(); });
  resize();

  /* ---------- Input ---------- */
  let target = 0, p = 0;
  const mouse = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 };
  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    target = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }
  window.addEventListener('scroll', function () { readScroll(); if (reduce) { p = target; draw(); } }, { passive: true });
  window.addEventListener('pointermove', function (e) { mouse.x = e.clientX / W; mouse.y = e.clientY / H; if (reduce) draw(); }, { passive: true });
  readScroll();

  /* ---------- Drawing ---------- */
  function waveY(x, t, amp) { return Math.sin(x * 0.012 + t * 0.0012) * amp + Math.sin(x * 0.027 - t * 0.0018) * amp * 0.5; }

  function draw(t) {
    t = t || 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dive = smooth(0.36, 0.56, p) * (1 - smooth(0.8, 0.92, p));   // 0 = at the surface, 1 = deep
    const clean = smooth(0.8, 0.97, p);                                 // the robot has cleared the water
    const pollute = smooth(0.04, 0.34, p);                              // how much trash is floating
    const surfaceY = H * 0.5 + (mouse.sy - 0.5) * 10 - dive * H * 1.1;
    const px = (mouse.sx - 0.5);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, surfaceY);
    sky.addColorStop(0, '#05081a'); sky.addColorStop(0.6, '#2a3a7a'); sky.addColorStop(1, lerp(0, 1, pollute) > 0.5 ? '#B5694A' : '#E59A6B');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, Math.max(0, surfaceY) + 2);
    // sun glow on the horizon
    if (surfaceY > 0) {
      const g = ctx.createRadialGradient(W * (0.5 - px * 0.1), surfaceY, 0, W * (0.5 - px * 0.1), surfaceY, W * 0.5);
      g.addColorStop(0, 'rgba(255,200,130,' + (0.55 - pollute * 0.25) + ')'); g.addColorStop(1, 'rgba(255,200,130,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, surfaceY + 4);
    }

    // water body: greener/browner when polluted, clearer after cleaning
    const wTop = [lerp(lerp(30, 70, pollute), 30, clean), lerp(lerp(92, 100, pollute), 130, clean), lerp(lerp(148, 70, pollute), 170, clean)];
    const water = ctx.createLinearGradient(0, surfaceY, 0, surfaceY + H * 1.4);
    water.addColorStop(0, 'rgb(' + wTop.map(Math.round).join(',') + ')');
    water.addColorStop(0.5, 'rgb(10,28,50)'); water.addColorStop(1, 'rgb(2,5,12)');
    ctx.fillStyle = water;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) ctx.lineTo(x, surfaceY + waveY(x, t, 5 + (1 - dive) * 3));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // shimmer line
    ctx.strokeStyle = 'rgba(255,220,170,.35)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= W; x += 12) { const y = surfaceY + waveY(x, t, 5 + (1 - dive) * 3); if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();

    // light rays through the water (fade with depth, back after cleaning)
    const rays = (1 - dive) * 0.5 + clean * 0.3;
    if (rays > 0.02 && surfaceY < H) {
      for (let i = 0; i < 7; i++) {
        const rx = W * (i / 6) + Math.sin(t * 0.0004 + i) * 40 - px * 60;
        const g = ctx.createLinearGradient(rx, surfaceY, rx + 80, surfaceY + H * 0.7);
        g.addColorStop(0, 'rgba(255,230,190,' + 0.16 * rays + ')'); g.addColorStop(1, 'rgba(255,230,190,0)');
        ctx.fillStyle = g; ctx.beginPath();
        ctx.moveTo(rx - 20, surfaceY); ctx.lineTo(rx + 40, surfaceY); ctx.lineTo(rx + 200, surfaceY + H * 0.7); ctx.lineTo(rx + 60, surfaceY + H * 0.7); ctx.closePath(); ctx.fill();
      }
    }

    // floating trash (a growing carpet on the surface)
    const count = Math.round(floaters.length * pollute * (1 - clean));
    for (let i = 0; i < count; i++) {
      const f = floaters[i];
      const x = ((f.x + t * 0.000004 * (1 + f.z)) % 1.2) * W * 1.1 - W * 0.05 - px * 40 * f.z;
      const y = surfaceY + 6 + (f.y * 0.5 + 0.5) * 60 * f.z + waveY(x, t, 4);
      if (y > H + 40) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(f.a + Math.sin(t * 0.001 + f.ph) * 0.2); ctx.scale(1, 0.55 + 0.3 * f.z);
      ctx.globalAlpha = 0.95; drawPiece(f.kind, f.c, 34 * f.s * (0.6 + f.z * 0.6)); ctx.restore();
    }

    // underwater: drifting rubbish, fish, marine snow
    if (dive > 0.02 || clean > 0) {
      const camY = dive * H * 1.6;
      sunk.forEach(function (s, i) {
        if (i > sunk.length * (1 - clean)) return;
        const sx = s.x * W * 1.1 - px * 70 * s.z + Math.sin(t * 0.0006 + s.ph) * 16;
        const sy = surfaceY + 40 + s.y * H * 2.2 * (0.5 + s.z * 0.5) + Math.cos(t * 0.0005 + s.ph) * 10;
        if (sy < -60 || sy > H + 60) return;
        const fog = clamp(1 - (sy - surfaceY) / (H * 1.6), 0.18, 1);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.a + t * 0.0001 * s.spin * 10); ctx.globalAlpha = fog * 0.9;
        drawPiece(s.kind, s.c, 40 * s.s * (0.5 + s.z * 0.7)); ctx.restore();
      });
      fishes.forEach(function (f) {
        const fx = ((f.x + t * 0.00001 * f.v * 100) % 1.3) * W - 60;
        const fy = surfaceY + H * (0.25 + f.y * 0.5) + Math.sin(t * 0.002 + f.s) * 12;
        if (fy < -20 || fy > H + 20) return;
        ctx.save(); ctx.translate(fx, fy); ctx.globalAlpha = 0.5 * (1 - clean * 0.3);
        ctx.fillStyle = clean > 0.4 ? '#FFB74D' : '#37474F';
        ctx.beginPath(); ctx.ellipse(0, 0, f.s, f.s * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-f.s, 0); ctx.lineTo(-f.s * 1.5, -f.s * 0.4); ctx.lineTo(-f.s * 1.5, f.s * 0.4); ctx.closePath(); ctx.fill(); ctx.restore();
      });
      ctx.fillStyle = '#CFE3FF';
      snow.forEach(function (s) {
        const x = ((s.x + Math.sin(t * 0.0003 + s.ph) * 0.02) * W) - px * 50 * s.z;
        const y = (((s.y + t * 0.00004 * s.z) % 1) * H);
        ctx.globalAlpha = 0.35 * s.z * (dive + 0.15); ctx.beginPath(); ctx.arc(x, y, 1 + s.z * 1.6, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // the Lake Sentry robot arrives at the surface and sweeps the trash away
    const arrive = smooth(0.76, 0.9, p);
    if (arrive > 0 && surfaceY > -40) {
      const rx = lerp(W * 1.2, W * 0.62, arrive) - px * 30, ry = surfaceY + 10 + waveY(rx, t, 5);
      const s = Math.min(W, 900) / 900;
      ctx.save(); ctx.translate(rx, ry); ctx.scale(s, s);
      ctx.fillStyle = '#F4F6F8'; ctx.fillRect(-120, -4, 240, 16);                    // floats
      ctx.strokeStyle = '#EDE3C8'; ctx.lineWidth = 6; ctx.strokeRect(-100, -62, 190, 62);  // CPVC frame
      ctx.fillStyle = 'rgba(120,150,160,.7)'; ctx.fillRect(-96, -58, 182, 54);       // basket
      ctx.fillStyle = '#D9D2B8'; ctx.beginPath(); ctx.moveTo(90, -50); ctx.lineTo(150, 6); ctx.lineTo(120, 8); ctx.lineTo(90, -6); ctx.closePath(); ctx.fill(); // conveyor
      ctx.strokeStyle = '#37474F'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(-70, 4, 22, 0, Math.PI * 2); ctx.stroke();           // paddle
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = t * 0.004 + k * Math.PI / 2; ctx.moveTo(-70, 4); ctx.lineTo(-70 + Math.cos(a) * 22, 4 + Math.sin(a) * 22); } ctx.stroke();
      ctx.fillStyle = '#7FB2FF'; ctx.beginPath(); ctx.arc(0, -72, 6, 0, Math.PI * 2); ctx.fill();                                 // beacon
      ctx.restore();
    }

    // darkness + torch: deep water is nearly black, the cursor is a light
    const dark = dive * 0.9 * (1 - clean);
    if (dark > 0.02) {
      const mx = mouse.sx * W, my = mouse.sy * H, r = Math.max(W, H) * 0.28;
      const g = ctx.createRadialGradient(mx, my, r * 0.05, mx, my, r);
      g.addColorStop(0, 'rgba(2,4,10,' + dark * 0.05 + ')'); g.addColorStop(0.55, 'rgba(2,4,10,' + dark * 0.6 + ')'); g.addColorStop(1, 'rgba(2,4,10,' + dark + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // soft vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  /* ---------- Story text + loop ---------- */
  function updateText() {
    scenes.forEach(function (el) {
      const a = Number(el.dataset.from), b = Number(el.dataset.to);
      const o = smooth(a - 0.02, a + 0.03, p) * (1 - smooth(b - 0.03, b + 0.01, p));
      el.style.opacity = String(o);
      el.style.transform = 'translateY(' + ((1 - o) * 24) + 'px)';
      el.classList.toggle('on', o > 0.5);
      el.setAttribute('aria-hidden', o > 0.5 ? 'false' : 'true');
    });
    meter.style.height = (p * 100) + '%';
    hint.style.opacity = p > 0.03 ? '0' : '1';
  }

  function loop(t) {
    p += (target - p) * 0.07;
    mouse.sx += (mouse.x - mouse.sx) * 0.08; mouse.sy += (mouse.y - mouse.sy) * 0.08;
    draw(t); updateText();
    requestAnimationFrame(loop);
  }
  if (reduce) { p = target; draw(0); updateText(); window.addEventListener('scroll', updateText, { passive: true }); }
  else requestAnimationFrame(loop);
})();
