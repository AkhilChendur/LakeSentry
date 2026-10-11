/* =====================================================================
   Lake Dive (dive.html) — explore a polluted city lake in 3D
   ---------------------------------------------------------------------
   PROTOTYPE. The lake is computer-generated. It imitates conditions
   reported at urban lakes in and around Hyderabad (water hyacinth,
   sewage inflows, floating and sunken waste, dumping, encroachment).
   It is NOT a model of any real lake. See the disclaimer on the page.

   How it works
     - Scrolling moves the camera along a guided route through chapters
       (the text sections in dive.html, each with sourced facts).
     - Dragging (or the arrow keys) lets you look around from wherever
       you are. Scroll again and the view eases back onto the route.
     - Hotspots in the scene can be clicked for short explanations.

   Built with three.js (three.min.js, bundled in this folder, MIT licence).
   Everything is generated in code. No image or model files are needed.

   Sections
     1. Helpers (noise, colours, lake shape, where the pollution is)
     2. Renderer, camera, post-processing
     3. Sky, water, terrain, shore, city
     4. Trash
     5. Plants, fish, particles, light shafts
     6. The Lake Sentry robot
     7. Pollution set pieces (hyacinth, sewage channel, foam, dead fish,
        dumping, encroaching buildings, mosquitoes)
     8. The guided route (chapters, look-around, hotspots, gauges)
     9. Main loop
   ===================================================================== */
(function () {
  'use strict';

  const stage = document.getElementById('dive-stage');
  const fallback = document.getElementById('dive-fallback');
  if (!stage) return;
  function noGL() { fallback.hidden = false; const l = document.getElementById('dive-loader'); if (l) l.hidden = true; document.body.classList.add('dive-nogl'); }
  if (!window.THREE) { noGL(); return; }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700 || /Mobi|Android/i.test(navigator.userAgent);
  const Q = isSmall ? 0.6 : 1; // quality: fewer objects on phones

  /* =============================================================
     1. Helpers
     ============================================================= */
  const TAU = Math.PI * 2;
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const smooth = function (a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let seed = 1337;
  const rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rand = function (a, b) { return a + rnd() * (b - a); };
  const pick = function (list) { return list[Math.floor(rnd() * list.length)]; };
  const col = function (hex) { return new THREE.Color(hex).convertSRGBToLinear(); };

  function hash2(i, j) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    const fx = x - i, fz = z - j;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, z) {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { s += amp * noise(x * f, z * f); f *= 2.03; amp *= 0.5; }
    return s; // ~0..1
  }

  /* ---------- The lake shape and ground height (metres) ---------- */
  const LAKE_RX = 120, LAKE_RZ = 92;
  function shore(x, z) { // < 1 inside the lake, > 1 on land
    const a = Math.atan2(z, x);
    const wob = 1 + 0.12 * Math.sin(3 * a + 1.3) + 0.07 * Math.sin(5 * a + 0.4) + 0.04 * Math.sin(9 * a + 2.1);
    return Math.hypot(x / LAKE_RX, z / LAKE_RZ) / wob;
  }
  // Where the sewage channel enters the lake (on the shore, angle INF.a)
  const INF = (function () {
    const a = 2.35; let k = 0.6;
    while (shore(Math.cos(a) * LAKE_RX * k, Math.sin(a) * LAKE_RZ * k) < 1 && k < 2) k += 0.004;
    const x = Math.cos(a) * LAKE_RX * k, z = Math.sin(a) * LAKE_RZ * k, L = Math.hypot(x, z);
    return { a: a, k: k, x: x, z: z, nx: x / L, nz: z / L };
  })();
  // Rubbish dumped on the bank (angle 0.75), just behind the beach
  const DUMP = (function () {
    const a = 0.75; let k = 0.6;
    while (shore(Math.cos(a) * LAKE_RX * k, Math.sin(a) * LAKE_RZ * k) < 1 && k < 2) k += 0.004;
    const x = Math.cos(a) * LAKE_RX * k, z = Math.sin(a) * LAKE_RZ * k, L = Math.hypot(x, z);
    return { a: a, x: x + x / L * 9, z: z + z / L * 9 };
  })();
  function dumpAt(x, z) { const u = (x - DUMP.x) / 11, v = (z - DUMP.z) / 9; return smooth(1.0, 0.35, u * u + v * v + (noise(x * 0.3, z * 0.3) - 0.5) * 0.4); }
  // (the lake-bed chapter's spot is set after lakePt below)
  // A point in the lake: angle a, fraction k of the way to the shore, height y
  function lakePt(a, k, y) {
    let edge = 0.5;
    while (shore(Math.cos(a) * LAKE_RX * edge, Math.sin(a) * LAKE_RZ * edge) < 1 && edge < 2) edge += 0.004;
    return new THREE.Vector3(Math.cos(a) * LAKE_RX * edge * k, y, Math.sin(a) * LAKE_RZ * edge * k);
  }
  const BEDP = lakePt(4.75, 0.45, 0);
  /* ---------- Where the pollution is (0..1), used by shaders and placement ----------
     hyacinth: a thick carpet that grows out from the sewage inlet (nutrients)
     plume:    murky sewage spreading from the inlet
     scum:     green algal film along the edges */
  const PATCH2 = { a: 4.1, k: 0.8 };
  function hyacinthAt(x, z) {
    const cx = INF.x * 0.62, cz = INF.z * 0.62;
    const d = Math.hypot(x - cx, z - cz) + (noise(x * 0.045 + 3, z * 0.045) - 0.5) * 34;
    const p2x = Math.cos(PATCH2.a) * LAKE_RX * PATCH2.k, p2z = Math.sin(PATCH2.a) * LAKE_RZ * PATCH2.k;
    const d2 = Math.hypot(x - p2x, z - p2z) + (noise(x * 0.07, z * 0.07 + 9) - 0.5) * 18;
    const m = Math.max(smooth(56, 32, d), smooth(20, 9, d2));
    const open = smooth(9, 24, Math.hypot(x - INF.x, z - INF.z));
    return shore(x, z) > 0.99 ? 0 : m * open;
  }
  function plumeAt(x, z) { return smooth(48, 4, Math.hypot(x - INF.x, z - INF.z) + (noise(x * 0.06, z * 0.06) - 0.5) * 16); }
  function scumAt(x, z) { const s = shore(x, z); return Math.max(smooth(0.8, 0.97, s) * smooth(0.4, 0.65, noise(x * 0.04 + 7, z * 0.04)), plumeAt(x, z) * 0.25); }

  function groundH(x, z) {
    const s = shore(x, z);
    const n = fbm(x * 0.035 + 10, z * 0.035 - 4);
    if (s < 1) {
      // lake bed: deepest in the middle, shelving up to the shore
      const lagoon = smooth(26, 6, Math.hypot(x - INF.x, z - INF.z));
      return lerp(0.7, -11, smooth(0.97, 0.35, s)) + (n - 0.5) * 2.2 * smooth(0.95, 0.6, s) - lagoon * 2.2;
    }
    const land = smooth(1.0, 1.25, s) * 3 + smooth(1.2, 3.2, s) * (10 + n * 26) + (n - 0.5) * 3 * smooth(1.05, 1.4, s);
    let h = 0.7 + land + dumpAt(x, z) * (2.4 + noise(x * 0.5, z * 0.5) * 1.2);
    // the sewage channel (nala) cut through the bank
    const along = (x - INF.x) * INF.nx + (z - INF.z) * INF.nz, across = Math.abs((x - INF.x) * INF.nz - (z - INF.z) * INF.nx);
    if (along > -4 && along < 60 && across < 6) h = lerp(h, Math.min(h, 0.15 + Math.max(0, along) * 0.03), smooth(6, 2.6, across));
    return h;
  }

  // The terrain mesh is a grid, so between grid points its height differs a
  // little from groundH(). Objects resting on the ground use this instead.
  const T_SIZE = 1500, T_SEGS = isSmall ? 220 : 300, T_STEP = T_SIZE / T_SEGS;
  function meshH(x, z) {
    const gx = (x + T_SIZE / 2) / T_STEP, gz = (z + T_SIZE / 2) / T_STEP;
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const X = function (k) { return k * T_STEP - T_SIZE / 2; };
    const h00 = groundH(X(i), X(j)), h10 = groundH(X(i + 1), X(j)), h01 = groundH(X(i), X(j + 1)), h11 = groundH(X(i + 1), X(j + 1));
    return Math.max(lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz), groundH(x, z));
  }

  /* ---------- Waves (the same maths runs on the GPU in the water shader) ---------- */
  const WAVES = [[0.96, 0.28, 0.07, 9.0], [-0.37, 0.93, 0.05, 5.3], [0.71, -0.70, 0.03, 3.1], [-0.92, -0.39, 0.018, 1.9]];
  function waveH(x, z, t) {
    let h = 0;
    for (let i = 0; i < WAVES.length; i++) {
      const w = WAVES[i], k = TAU / w[3], om = Math.sqrt(9.8 * k) * 0.55;
      h += w[2] * Math.sin(k * (w[0] * x + w[1] * z) - om * t + i * 1.7);
    }
    return h;
  }
  function waveN(x, z, t, out) { // surface normal
    let dx = 0, dz = 0;
    for (let i = 0; i < WAVES.length; i++) {
      const w = WAVES[i], k = TAU / w[3], om = Math.sqrt(9.8 * k) * 0.55;
      const c = w[2] * k * Math.cos(k * (w[0] * x + w[1] * z) - om * t + i * 1.7);
      dx += c * w[0]; dz += c * w[1];
    }
    return out.set(-dx, 1, -dz).normalize();
  }

  /* =============================================================
     2. Renderer, camera, post-processing
     ============================================================= */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 needed');
  } catch (e) { noGL(); return; }
  const DPR = Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 1.75);
  renderer.setPixelRatio(DPR);
  renderer.outputEncoding = THREE.LinearEncoding; // the post pass does tone mapping + gamma
  renderer.toneMapping = THREE.NoToneMapping;
  stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'dive-canvas';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 2600);
  camera.position.set(-160, 70, 190);

  const SUN_DIR = new THREE.Vector3(-0.62, 0.16, -0.77).normalize();
  const FOG_ABOVE = col('#b9989c'), FOG_BELOW = col('#24533f');
  const fogU = { uFogColor: { value: FOG_ABOVE.clone() }, uFogDensity: { value: 0.0021 } };
  scene.fog = new THREE.FogExp2(FOG_ABOVE.clone(), 0.0021);
  const timeU = { value: 0 };
  // Pollution map as a texture (R = hyacinth, G = algal scum, B = sewage plume)
  // covering x, z from -180 to 180 m, so the shaders match the placed objects.
  const maskTex = (function () {
    const N = 256, data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 360 - 180, z = (j + 0.5) / N * 360 - 180, o = (j * N + i) * 4;
      const edge = (i === 0 || j === 0 || i === N - 1 || j === N - 1) ? 0 : 1;
      data[o] = 255 * hyacinthAt(x, z) * edge; data[o + 1] = 255 * scumAt(x, z) * edge; data[o + 2] = 255 * plumeAt(x, z) * edge; data[o + 3] = 255 * dumpAt(x, z) * edge;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    return tex;
  })();
  const underU = { value: 0 };

  const hemi = new THREE.HemisphereLight(col('#9fb6ff'), col('#5a4630'), 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(col('#ffc890'), 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun);

  // Render the scene into an HDR target, then a full-screen pass adds the
  // film look: tone mapping, slight colour fringing, vignette, grain, and
  // a wobble + green-blue absorption when the camera is underwater.
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: isSmall ? 0 : 4 });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postU = {
    tScene: { value: rt.texture }, uTime: timeU, uUnder: underU, uSplash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) }, uExposure: { value: 1.05 }, uMotion: { value: reduceMotion ? 0 : 1 },
  };
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: postU, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tScene; uniform float uTime, uUnder, uSplash, uExposure, uMotion; uniform vec2 uRes; varying vec2 vUv;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }',
      'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
      'void main(){',
      '  vec2 uv = vUv;',
      '  float w = (uUnder*0.0028 + uSplash*0.012) * uMotion;',
      '  uv += vec2(sin(uv.y*24.0 + uTime*1.9), cos(uv.x*19.0 + uTime*1.6)) * w;',
      '  vec2 dir = uv - 0.5; float d = length(dir);',
      '  float ca = (0.0018 + 0.004*uUnder) * d;',
      '  vec3 c = vec3(texture2D(tScene, uv + dir*ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv - dir*ca).b);',
      '  c *= uExposure;',
      '  c = mix(c, c * vec3(0.55, 0.92, 0.82), uUnder * 0.55);',
      '  c += uSplash * vec3(0.18, 0.24, 0.26);',
      '  c = aces(c);',
      '  c = pow(c, vec3(1.0/2.2));',
      '  c *= mix(1.0, smoothstep(0.95, 0.22, d), 0.5 + 0.3*uUnder);',
      '  c += (hash(uv*uRes + fract(uTime)*91.0) - 0.5) * 0.045;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
  })));

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 68 : 55;
    camera.updateProjectionMatrix();
    rt.setSize(Math.floor(w * DPR), Math.floor(h * DPR));
    postU.uRes.value.set(w * DPR, h * DPR);
  }
  window.addEventListener('resize', resize);

  /* ---------- Shared GLSL ---------- */
  const GLSL_COMMON = [
    'uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime; uniform float uUnder; uniform vec3 uSunDir; uniform sampler2D uMask;',
    'vec4 maskAt(vec2 xz){ vec2 uv = (xz + 180.0) / 360.0; if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0); return texture2D(uMask, uv); }',
    'vec3 applyFog(vec3 c, float dist){ float f = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist); return mix(c, uFogColor, clamp(f,0.0,1.0)); }',
    'vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }',
    'vec3 skyColor(vec3 d){',
    '  float y = d.y;',
    '  vec3 zen = srgb(vec3(0.07,0.10,0.24)); vec3 mid = srgb(vec3(0.36,0.38,0.58)); vec3 hor = srgb(vec3(0.98,0.66,0.46));',
    '  vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, y)); c = mix(c, zen, smoothstep(0.22, 0.85, y));',
    '  c = mix(c, srgb(vec3(0.55,0.42,0.40)), smoothstep(0.0, -0.2, y));',
    '  float s = max(dot(d, uSunDir), 0.0);',
    '  c += srgb(vec3(1.0,0.62,0.34)) * pow(s, 6.0) * 0.55 + vec3(1.0,0.75,0.45) * pow(s, 90.0) * 1.6 + vec3(1.0,0.9,0.7) * smoothstep(0.9993, 0.9997, s) * 30.0;',
    '  return c;',
    '}',
    'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);',
    '  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }',
  ].join('\n');
  function sharedU(extra) {
    return Object.assign({
      uFogColor: fogU.uFogColor, uFogDensity: fogU.uFogDensity, uTime: timeU, uUnder: underU,
      uSunDir: { value: SUN_DIR }, uMask: { value: maskTex },
    }, extra || {});
  }

  /* =============================================================
     3. Sky, water, terrain, shore, city
     ============================================================= */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), new THREE.ShaderMaterial({
    uniforms: sharedU(), side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: GLSL_COMMON + '\nvarying vec3 vDir; void main(){ vec3 c = skyColor(normalize(vDir)); c = mix(c, uFogColor, uUnder); gl_FragColor = vec4(c,1.0); }',
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  // Water: a flat plane whose surface detail is computed per pixel from
  // the same waves the robot floats on, plus fine scrolling ripples.
  const waveGLSL = WAVES.map(function (w, i) {
    const k = TAU / w[3], om = Math.sqrt(9.8 * k) * 0.55;
    return '{ float ph = ' + k.toFixed(5) + '*(' + w[0].toFixed(3) + '*p.x + ' + w[1].toFixed(3) + '*p.y) - ' + om.toFixed(5) + '*uTime + ' + (i * 1.7).toFixed(2) + ';' +
      ' float c = ' + (w[2] * k).toFixed(5) + '*cos(ph); g += vec2(' + w[0].toFixed(3) + ',' + w[1].toFixed(3) + ')*c; }';
  }).join('\n');
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: sharedU(), side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: GLSL_COMMON + [
      '',
      'varying vec3 vWorld;',
      'vec2 waveGrad(vec2 p){ vec2 g = vec2(0.0);', waveGLSL, 'return g; }',
      'vec2 rippleGrad(vec2 p){',
      '  float e = 0.06; vec2 a = p*1.7 + vec2(uTime*0.35, uTime*0.21); vec2 b = p*3.9 - vec2(uTime*0.27, -uTime*0.4);',
      '  float n0 = vnoise(a) + 0.5*vnoise(b);',
      '  float nx = vnoise(a+vec2(e*1.7,0.0)) + 0.5*vnoise(b+vec2(e*3.9,0.0));',
      '  float nz = vnoise(a+vec2(0.0,e*1.7)) + 0.5*vnoise(b+vec2(0.0,e*3.9));',
      '  return vec2(nx-n0, nz-n0)/e * 0.045; }',
      'void main(){',
      '  vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam/dist;',
      '  float fade = smoothstep(260.0, 20.0, dist);',
      '  vec2 g = waveGrad(vWorld.xz) * mix(0.35, 1.0, fade) + rippleGrad(vWorld.xz) * fade;',
      '  vec4 mk = maskAt(vWorld.xz); g *= 1.0 - mk.r * 0.9;',
      '  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));',
      '  vec3 deep = srgb(vec3(0.06,0.16,0.13)); vec3 murk = srgb(vec3(0.16,0.26,0.17));',
      '  vec3 c;',
      '  if (gl_FrontFacing) {',
      '    float fres = 0.02 + 0.98*pow(1.0 - max(dot(N, V), 0.0), 5.0);',
      '    vec3 R = reflect(-V, N); R.y = abs(R.y);',
      '    vec3 refl = skyColor(R);',
      '    float scat = pow(max(dot(V, -uSunDir), 0.0), 3.0) * 0.25;',
      '    vec3 body = mix(deep, murk, 0.4 + 0.6*clamp(g.x*4.0+0.5, 0.0, 1.0)*0.3) + murk*scat;',
      '    body = mix(body, srgb(vec3(0.085,0.09,0.065)), mk.b * 0.7);',
      '    float sc = mk.g * smoothstep(0.35, 0.75, vnoise(vWorld.xz*0.35) + vnoise(vWorld.xz*1.7)*0.4);',
      '    body = mix(body, srgb(vec3(0.26,0.37,0.12)), sc * 0.85);',
      '    c = mix(body, refl, fres * (1.0 - sc * 0.75));',
      '    float fz = smoothstep(0.7, 0.98, mk.b) * smoothstep(0.5, 0.78, vnoise(vWorld.xz*2.6 + vec2(uTime*0.05, 0.0)) * 0.7 + vnoise(vWorld.xz*9.0) * 0.3) * 0.5;',
      '    float bub = smoothstep(0.6, 0.9, vnoise(vWorld.xz*18.0));',
      '    c = mix(c, srgb(vec3(0.86,0.83,0.74)) * (0.55 + 0.45*max(uSunDir.y*3.0, 0.3)), fz * (0.75 + bub * 0.25));',
      '    float sp = max(dot(R, uSunDir), 0.0);',
      '    c += vec3(1.0,0.78,0.5) * (pow(sp, 900.0)*40.0 + pow(sp, 90.0)*0.6);',
      '    c = applyFog(c, dist);',
      '  } else {',
      '    vec3 I = normalize(vWorld - cameraPosition);',
      '    vec3 T = refract(I, -N, 1.33);',
      '    if (dot(T,T) < 0.001) { c = srgb(vec3(0.07,0.17,0.14)) * 1.1; }',
      '    else { c = skyColor(normalize(T)) * 0.75 + vec3(1.0,0.8,0.55) * pow(max(dot(normalize(T), uSunDir), 0.0), 60.0) * 3.0; }',
      '    c *= 1.0 - mk.r * 0.93; c = mix(c, c * vec3(0.7, 0.62, 0.4), mk.b);',
      '    c = applyFog(c, dist);',
      '  }',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
  }));
  scene.add(water);

  // Terrain: lake bed, beach and the hills around it.
  function buildTerrain() {
    const size = T_SIZE, segs = T_SEGS;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      // Warp the grid so detail is concentrated around the lake.
      pos.setY(i, groundH(x, z));
    }
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: sharedU(),
      vertexShader: 'varying vec3 vWorld; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; vN = normal; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: GLSL_COMMON + [
        '',
        'varying vec3 vWorld; varying vec3 vN;',
        // Tileable water caustics (after Dave Hoskins)
        'float caustic(vec2 uv){ vec2 p = mod(uv*6.2831, 6.2831) - 250.0; vec2 i = p; float c = 1.0; float inten = 0.005; float t = uTime*0.35 + 23.0;',
        '  for (int n = 0; n < 4; n++) { float tt = t * (1.0 - (3.5 / float(n+1))); i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));',
        '    c += 1.0/length(vec2(p.x / (sin(i.x+tt)/inten), p.y / (cos(i.y+tt)/inten))); }',
        '  c /= 4.0; c = 1.17 - pow(c, 1.4); return pow(abs(c), 8.0); }',
        'void main(){',
        '  vec3 N = normalize(vN); float h = vWorld.y; vec4 mk = maskAt(vWorld.xz);',
        '  float n1 = vnoise(vWorld.xz*0.15); float n2 = vnoise(vWorld.xz*1.3); float n3 = vnoise(vWorld.xz*7.0);',
        '  vec3 mud = mix(srgb(vec3(0.30,0.28,0.20)), srgb(vec3(0.44,0.40,0.29)), n1*0.7+n2*0.3);',
        '  vec3 wetSand = srgb(vec3(0.46,0.40,0.29)); vec3 sand = mix(srgb(vec3(0.80,0.71,0.53)), srgb(vec3(0.70,0.60,0.43)), n2*0.6+n3*0.4);',
        '  vec3 grass = mix(srgb(vec3(0.30,0.36,0.17)), srgb(vec3(0.52,0.50,0.28)), n1*0.8+n3*0.2);',
        '  vec3 rock = mix(srgb(vec3(0.42,0.40,0.37)), srgb(vec3(0.58,0.55,0.51)), n2);',
        '  mud = mix(mud, srgb(vec3(0.07,0.065,0.05)), mk.b * 0.85);',
        '  vec3 c = mud;',
        '  c = mix(c, wetSand, smoothstep(-0.9, 0.1, h + (n2-0.5)*0.6));',
        '  c = mix(c, sand, smoothstep(0.35, 0.9, h + (n3-0.5)*0.3));',
        '  c = mix(c, grass, smoothstep(1.8, 3.2, h + (n1-0.5)*2.0));',
        '  c = mix(c, rock, smoothstep(0.72, 0.55, N.y) * step(1.0, h));',
        '  vec3 debris = mix(srgb(vec3(0.42,0.38,0.33)), srgb(vec3(0.30,0.25,0.20)), n3) * (0.8 + 0.4*vnoise(vWorld.xz*3.0));',
        '  c = mix(c, debris, smoothstep(0.1, 0.5, mk.a));',
        '  c *= 0.85 + n3*0.3;',
        '  float diff = max(dot(N, uSunDir), 0.0);',
        '  vec3 light = vec3(1.0,0.78,0.56)*2.1*diff + mix(srgb(vec3(0.33,0.27,0.22)), srgb(vec3(0.52,0.58,0.78)), N.y*0.5+0.5)*0.75;',
        '  float depth = max(-h, 0.0);',
        '  if (h < 0.05) {',
        '    float k = caustic(vWorld.xz*0.11) ;',
        '    light *= (exp(-depth*0.075) * vec3(0.6, 0.92, 0.82) + 0.1) * (1.0 - mk.r * 0.85);',
        '    light += vec3(0.9,1.0,0.8) * k * 1.4 * exp(-depth*0.1) * (1.0 - mk.r) * (1.0 - mk.b * 0.7);',
        '  }',
        '  c *= light;',
        '  gl_FragColor = vec4(applyFog(c, length(cameraPosition - vWorld)), 1.0);',
        '}',
      ].join('\n'),
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
  }

  // Shared standard materials (they use scene.fog automatically)
  const M = {
    std: function (hex, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: col(hex), roughness: 0.8 }, o || {})); },
  };

  function scatter(count, test, tries) {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < (tries || count * 40)) {
      const x = rand(-700, 700), z = rand(-700, 700);
      const r = test(x, z);
      if (r) out.push(r);
    }
    return out;
  }

  const dummy = new THREE.Object3D();
  function buildShore() {
    // Granite boulders: a Hyderabad signature
    const rockGeo = new THREE.IcosahedronGeometry(1, 3);
    const rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const v = new THREE.Vector3(rp.getX(i), rp.getY(i), rp.getZ(i));
      v.multiplyScalar(0.78 + noise(v.x * 1.6 + 5, v.z * 1.6 + v.y * 1.3) * 0.38 + noise(v.x * 5, v.z * 5 + v.y * 4) * 0.08);
      rp.setXYZ(i, v.x, v.y * 0.75, v.z);
    }
    rockGeo.computeVertexNormals();
    const rocks = scatter(Math.round(70 * Q), function (x, z) {
      const s = shore(x, z);
      if (s < 1.06 || s > 2.4) return null;
      return { x: x, z: z, s: rand(1.2, s < 1.3 ? 3.2 : 6) };
    });
    const rockMesh = new THREE.InstancedMesh(rockGeo, M.std('#ffffff', { roughness: 0.92 }), rocks.length);
    rocks.forEach(function (r, i) {
      rockMesh.setColorAt(i, col(pick(['#8f897f', '#7d776e', '#9a9286', '#857a6c', '#6f6b66'])));
      dummy.position.set(r.x, groundH(r.x, r.z) + r.s * 0.12, r.z);
      dummy.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
      dummy.scale.set(r.s * rand(0.9, 1.4), r.s, r.s * rand(0.9, 1.3));
      dummy.updateMatrix(); rockMesh.setMatrixAt(i, dummy.matrix);
    });
    scene.add(rockMesh);

    // Trees
    const trees = scatter(Math.round(320 * Q), function (x, z) {
      const s = shore(x, z), h = groundH(x, z);
      if (s < 1.22 || s > 4.5 || h < 2.5) return null;
      if (noise(x * 0.02, z * 0.02) < 0.38) return null; // clumps
      return { x: x, z: z, h: h, s: rand(2.5, 6.5) };
    });
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 1, 5), M.std('#4a3b2c'), trees.length);
    const crownGeo = new THREE.IcosahedronGeometry(1, 2);
    const cp = crownGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const v = new THREE.Vector3(cp.getX(i), cp.getY(i), cp.getZ(i));
      v.multiplyScalar(0.82 + noise(v.x * 3 + 2, v.z * 3 + v.y * 2) * 0.36);
      cp.setXYZ(i, v.x, v.y, v.z);
    }
    crownGeo.computeVertexNormals();
    const crownMat = M.std('#ffffff', { roughness: 0.95 });
    const crowns = [0, 1, 2].map(function () { return new THREE.InstancedMesh(crownGeo, crownMat, trees.length); });
    const greens = ['#3a4f26', '#44592b', '#4f6230', '#33461f', '#5a6634', '#4a5a2c'];
    trees.forEach(function (t, i) {
      dummy.rotation.set(0, rand(0, TAU), 0);
      dummy.position.set(t.x, t.h + t.s * 0.3, t.z); dummy.scale.set(t.s * 0.35, t.s * 0.6, t.s * 0.35);
      dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
      const g = col(pick(greens));
      crowns.forEach(function (cm, k) {
        const ox = k === 0 ? 0 : rand(-0.35, 0.35) * t.s, oz = k === 0 ? 0 : rand(-0.35, 0.35) * t.s;
        const sc = t.s * (k === 0 ? rand(0.5, 0.7) : rand(0.3, 0.45));
        dummy.position.set(t.x + ox, t.h + t.s * (k === 0 ? 0.85 : rand(0.6, 0.95)), t.z + oz);
        dummy.scale.set(sc, sc * rand(0.7, 0.9), sc);
        dummy.updateMatrix(); cm.setMatrixAt(i, dummy.matrix);
        cm.setColorAt(i, g.clone().multiplyScalar(rand(0.85, 1.15)));
      });
    });
    scene.add(trunk);
    crowns.forEach(function (cm) { scene.add(cm); });

    // Distant city at dusk, with lit windows
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
      if (Math.random() < 0.35) { g.fillStyle = pick(['#ffd28a', '#ffe9c0', '#fff3d6', '#9fd3ff']); g.fillRect(x, y, 4, 4); }
    }
    const winTex = new THREE.CanvasTexture(c);
    winTex.encoding = THREE.sRGBEncoding;
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.repeat.set(2, 4);
    const blocks = [];
    for (let i = 0; i < Math.round(170 * Q); i++) {
      const a = rand(-2.2, -0.9), r = rand(760, 1050);
      blocks.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: rand(10, 26), d: rand(10, 26), h: rand(14, 70) * (r < 650 ? 1 : 1.4) });
    }
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({
      color: col('#3a3446'), roughness: 0.95, emissive: col('#ffffff'), emissiveMap: winTex, emissiveIntensity: 1.4,
    }), blocks.length);
    blocks.forEach(function (b, i) {
      const base = groundH(b.x, b.z);
      dummy.position.set(b.x, base + b.h / 2 - 2, b.z); dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix(); city.setMatrixAt(i, dummy.matrix);
    });
    scene.add(city);
  }

  /* =============================================================
     4. Trash
     Each kind is drawn with one InstancedMesh per part (body, cap…),
     so hundreds of pieces cost only a handful of draw calls.
     ============================================================= */
  function crumple(geo, amount, freq) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x + (noise(y * freq + 3, z * freq) - 0.5) * amount, y + (noise(x * freq, z * freq + 7) - 0.5) * amount, z + (noise(x * freq + 11, y * freq) - 0.5) * amount);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const bottleProfile = [[0, -0.125], [0.034, -0.123], [0.037, -0.11], [0.037, 0.04], [0.03, 0.07], [0.016, 0.095], [0.014, 0.11], [0, 0.11]]
    .map(function (p) { return new THREE.Vector2(p[0], p[1]); });

  const KINDS = {
    bottle: { label: 'PET bottle', kg: 0.025, float: 0.02, lie: true, parts: [
      { geo: crumple(new THREE.LatheGeometry(bottleProfile, 12), 0.008, 30), mat: new THREE.MeshStandardMaterial({ color: col('#d6ecf0'), roughness: 0.12, transparent: true, opacity: 0.62, depthWrite: false }) },
      { geo: new THREE.CylinderGeometry(0.0385, 0.0385, 0.06, 12, 1, true), mat: M.std('#ffffff', { roughness: 0.5, side: THREE.DoubleSide }), tint: ['#d32f2f', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#ef6c00'] },
      { geo: new THREE.CylinderGeometry(0.016, 0.016, 0.022, 10).translate(0, 0.121, 0), mat: M.std('#ffffff', { roughness: 0.6 }), tint: ['#1565c0', '#c62828', '#2e7d32', '#ffffff', '#f9a825'] },
    ] },
    can: { label: 'Drink can', kg: 0.015, float: 0.015, lie: true, parts: [
      { geo: crumple(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14), 0.012, 25), mat: M.std('#ffffff', { metalness: 0.85, roughness: 0.3 }), tint: ['#c62828', '#b0bec5', '#1e88e5', '#2e7d32', '#212121', '#ffb300'] },
    ] },
    cup: { label: 'Foam cup', kg: 0.006, float: 0.03, lie: true, parts: [
      { geo: crumple(new THREE.CylinderGeometry(0.045, 0.031, 0.095, 14, 1, true), 0.01, 20), mat: M.std('#f4f1ea', { roughness: 1, side: THREE.DoubleSide }) },
    ] },
    bag: { label: 'Plastic bag', kg: 0.008, float: 0.0, lie: false, parts: [
      { geo: crumple(new THREE.PlaneGeometry(0.42, 0.5, 8, 8).rotateX(-Math.PI / 2), 0.16, 4.5), mat: new THREE.MeshStandardMaterial({ color: col('#ffffff'), roughness: 0.55, side: THREE.DoubleSide, transparent: true, opacity: 0.82, depthWrite: false }), tint: ['#f5f5f5', '#e0e0e0', '#1e88e5', '#212121', '#ef9a9a', '#c5e1a5', '#fff59d'] },
    ] },
    wrapper: { label: 'Snack wrapper', kg: 0.004, float: 0.0, lie: false, parts: [
      { geo: crumple(new THREE.PlaneGeometry(0.2, 0.12, 6, 4).rotateX(-Math.PI / 2), 0.05, 18), mat: M.std('#ffffff', { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }), tint: ['#f9a825', '#ef6c00', '#7b1fa2', '#c62828', '#00897b', '#1565c0'] },
    ] },
    foam: { label: 'Thermocol block', kg: 0.05, float: 0.06, lie: false, parts: [
      { geo: crumple(new THREE.BoxGeometry(0.34, 0.14, 0.22, 4, 2, 3), 0.03, 9), mat: M.std('#f6f6f2', { roughness: 1 }) },
    ] },
    tyre: { label: 'Old tyre', kg: 7.5, float: 0, lie: false, sinkOnly: true, parts: [
      { geo: new THREE.TorusGeometry(0.3, 0.11, 10, 22).rotateX(Math.PI / 2), mat: M.std('#1d1d1d', { roughness: 0.95 }) },
    ] },
    sandal: { label: 'Sandal', kg: 0.2, float: 0.02, lie: false, parts: [
      { geo: crumple(new THREE.BoxGeometry(0.1, 0.025, 0.26, 2, 1, 4), 0.012, 12), mat: M.std('#ffffff', { roughness: 0.85 }), tint: ['#3949ab', '#e53935', '#5d4037', '#212121'] },
    ] },
  };

  const items = [];
  function addItem(kind, state, x, z, extra) {
    const it = Object.assign({
      kind: kind, state: state, x: x, z: z, y: 0, yaw: rand(0, TAU), tilt: rand(-0.5, 0.5), roll: rand(0, TAU),
      phase: rand(0, TAU), vx: 0, vz: 0, tints: [], spotted: false, t: 0,
    }, extra || {});
    KINDS[kind].parts.forEach(function (p) { it.tints.push(p.tint ? col(pick(p.tint)) : null); });
    items.push(it);
    return it;
  }

  function buildTrash() {
    const floatKinds = ['bottle', 'bottle', 'bottle', 'bag', 'wrapper', 'cup', 'cup', 'foam', 'can', 'sandal'];
    const sinkKinds = ['bottle', 'can', 'can', 'bag', 'bag', 'wrapper', 'tyre', 'sandal', 'cup'];
    // Floating trash collects in mats near the shore (wind pushes it there)
    // and in a few drifting patches out on the water.
    const patches = [];
    for (let i = 0; i < 9; i++) {
      const a = rand(0, TAU), s = i < 6 ? rand(0.78, 0.93) : rand(0.25, 0.6);
      patches.push({ x: Math.cos(a) * LAKE_RX * s, z: Math.sin(a) * LAKE_RZ * s, r: rand(4, 12) });
    }
    // two patches straight ahead of the start, so there's something to collect right away
    const bc = lakePt(-0.78, 0.35, 0);
    patches.push({ x: bc.x, z: bc.z, r: 9 }, { x: INF.x * 0.8, z: INF.z * 0.8, r: 10 });
    const nFloat = Math.round(360 * Q);
    for (let i = 0; i < nFloat; i++) {
      const p = patches[i % patches.length];
      const a = rand(0, TAU), r = Math.sqrt(rnd()) * p.r;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (groundH(x, z) > -0.25) continue;
      addItem(pick(floatKinds), 'float', x, z);
    }
    // Sunk trash on the bed, thickest along the shelves where people dump it
    const nSunk = Math.round(700 * Q);
    for (let i = 0, guard = 0; i < nSunk && guard < 9000; guard++) {
      const a = rand(0, TAU), s = Math.pow(rnd(), 0.6) * 0.95;
      const x = Math.cos(a) * LAKE_RX * s, z = Math.sin(a) * LAKE_RZ * s;
      const h = groundH(x, z);
      if (h > -0.6) continue;
      addItem(pick(sinkKinds), 'sunk', x, z, { y: meshH(x, z) + 0.05 });
      i++;
    }
    // A cluster of sunken waste where the lake-bed chapter looks
    for (let i = 0; i < Math.round(90 * Q); i++) {
      const a = rand(0, TAU), r = Math.sqrt(rnd()) * 6, x = BEDP.x + Math.cos(a) * r, z = BEDP.z + Math.sin(a) * r;
      addItem(pick(['bottle', 'bottle', 'can', 'bag', 'sandal', 'tyre', 'cup', 'wrapper']), 'sunk', x, z, { y: meshH(x, z) + 0.05 });
    }
    // Bags drifting mid-water
    for (let i = 0; i < Math.round(90 * Q); i++) {
      const a = rand(0, TAU), s = rand(0.1, 0.8);
      const x = Math.cos(a) * LAKE_RX * s, z = Math.sin(a) * LAKE_RZ * s;
      const h = groundH(x, z);
      if (h > -2) continue;
      addItem(pick(['bag', 'bag', 'wrapper']), 'suspended', x, z, { y: rand(h + 0.6, -0.8), base: 0 });
    }
    // A heap of rubbish dumped on the bank
    for (let i = 0; i < Math.round(420 * Q); i++) {
      const a = rand(0, TAU), r = Math.sqrt(rnd()) * 11;
      const x = DUMP.x + Math.cos(a) * r, z = DUMP.z + Math.sin(a) * r * 0.85;
      if (dumpAt(x, z) < 0.2) continue;
      addItem(pick(['bag', 'bag', 'bottle', 'wrapper', 'cup', 'sandal', 'can', 'foam']), 'shore', x, z, { y: meshH(x, z) + 0.06 });
    }
    // Trash washed up along the beach
    for (let i = 0, guard = 0; i < Math.round(260 * Q) && guard < 9000; guard++) {
      const a = rand(0, TAU), s = rand(0.97, 1.08);
      const x = Math.cos(a) * LAKE_RX * s * 1.05, z = Math.sin(a) * LAKE_RZ * s * 1.05;
      const h = groundH(x, z);
      if (h < 0.1 || h > 1.6) continue;
      addItem(pick(floatKinds), 'shore', x, z, { y: meshH(x, z) + 0.04 });
      i++;
    }

    Object.keys(KINDS).forEach(function (k) {
      const def = KINDS[k];
      const list = items.filter(function (it) { return it.kind === k; });
      def.list = list;
      def.meshes = def.parts.map(function (p, pi) {
        const m = new THREE.InstancedMesh(p.geo, p.mat, Math.max(1, list.length));
        m.count = list.length;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        if (p.tint) list.forEach(function (it, i) { m.setColorAt(i, it.tints[pi]); });
        scene.add(m);
        return m;
      });
    });
  }

  const tmpN = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const tmpE = new THREE.Euler();
  function itemMatrix(it, t) {
    if (it.state === 'gone') { dummy.scale.set(0, 0, 0); dummy.position.set(0, -999, 0); dummy.updateMatrix(); return dummy.matrix; }
    const def = KINDS[it.kind];
    if (it.state === 'float') {
      it.y = waveH(it.x, it.z, t) + def.float * 0.5 - 0.01;
      waveN(it.x, it.z, t, tmpN);
      tmpQ.setFromUnitVectors(UP, tmpN);
      tmpE.set(def.lie ? Math.PI / 2 : 0, it.yaw + Math.sin(t * 0.3 + it.phase) * 0.2, def.lie ? it.roll : it.tilt * 0.3, 'YXZ');
      tmpQ2.setFromEuler(tmpE);
      dummy.quaternion.copy(tmpQ).multiply(tmpQ2);
      dummy.position.set(it.x, it.y, it.z);
    } else if (it.state === 'suspended') {
      dummy.position.set(it.x + Math.sin(t * 0.2 + it.phase) * 0.4, it.y + Math.sin(t * 0.35 + it.phase) * 0.25, it.z + Math.cos(t * 0.17 + it.phase) * 0.4);
      dummy.rotation.set(Math.sin(t * 0.3 + it.phase) * 0.8, it.yaw + t * 0.05, Math.cos(t * 0.25 + it.phase) * 0.6);
    } else if (it.state === 'collect' || it.state === 'stored') {
      dummy.position.copy(it.world);
      dummy.quaternion.copy(it.worldQ);
    } else {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(def.lie ? Math.PI / 2 : it.tilt * 0.4, it.yaw, def.lie ? it.roll : it.tilt * 0.2, 'YXZ');
    }
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    return dummy.matrix;
  }
  function updateTrashMeshes(t) {
    Object.keys(KINDS).forEach(function (k) {
      const def = KINDS[k];
      def.list.forEach(function (it, i) {
        const m = itemMatrix(it, t);
        def.meshes.forEach(function (mesh) { mesh.setMatrixAt(i, m); });
      });
      def.meshes.forEach(function (mesh) { mesh.instanceMatrix.needsUpdate = true; });
    });
  }

  /* =============================================================
     5. Plants, fish, particles, light shafts
     ============================================================= */
  let weedMat, snowMat, shaftMat, foamPts, bubblePts, fishMesh, fishes = [], lilyMesh, lilies = [];
  function buildLife() {
    // Underwater weed blades that sway in the current
    const blade = new THREE.PlaneGeometry(0.07, 1, 1, 6).translate(0, 0.5, 0);
    weedMat = new THREE.ShaderMaterial({
      uniforms: sharedU(), side: THREE.DoubleSide,
      vertexShader: [
        'uniform float uTime; varying float vH; varying vec3 vWorld;',
        'void main(){',
        '  vec4 p = vec4(position, 1.0);',
        '  #ifdef USE_INSTANCING',
        '  mat4 im = instanceMatrix;',
        '  #else',
        '  mat4 im = mat4(1.0);',
        '  #endif',
        '  vec4 w = modelMatrix * im * p;',
        '  float h = position.y; vH = h;',
        '  float ph = w.x*0.4 + w.z*0.3;',
        '  w.x += sin(uTime*0.8 + ph) * h*h * 0.25; w.z += cos(uTime*0.6 + ph*1.3) * h*h * 0.18;',
        '  vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;',
        '}',
      ].join('\n'),
      fragmentShader: GLSL_COMMON + '\nvarying float vH; varying vec3 vWorld; void main(){ vec3 c = mix(srgb(vec3(0.10,0.17,0.07)), srgb(vec3(0.33,0.42,0.16)), vH) * (0.5 + 0.9*exp(vWorld.y*0.18)); gl_FragColor = vec4(applyFog(c, length(cameraPosition - vWorld)), 1.0); }',
    });
    const spots = [];
    for (let p = 0; p < 26; p++) {
      const a = rand(0, TAU), s = rand(0.45, 0.9);
      const cx = Math.cos(a) * LAKE_RX * s, cz = Math.sin(a) * LAKE_RZ * s;
      const n = Math.round(rand(80, 200) * Q);
      for (let i = 0; i < n; i++) {
        const x = cx + rand(-6, 6), z = cz + rand(-6, 6), h = groundH(x, z);
        if (h > -0.8 || h < -8) continue;
        spots.push({ x: x, z: z, h: h, s: rand(0.5, Math.min(2.2, -h - 0.3)) });
      }
    }
    spots.push.apply(spots, []);
    const weeds = new THREE.InstancedMesh(blade, weedMat, Math.max(1, spots.length));
    spots.forEach(function (s, i) {
      dummy.position.set(s.x, s.h, s.z); dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.set(rand(0.7, 1.6), s.s, 1);
      dummy.updateMatrix(); weeds.setMatrixAt(i, dummy.matrix);
    });
    weeds.frustumCulled = false;
    scene.add(weeds);

    // Water hyacinth / lily pads floating near the shore
    const padGeo = new THREE.CircleGeometry(0.22, 14, 0.35, TAU - 0.5).rotateX(-Math.PI / 2);
    for (let i = 0; i < Math.round(420 * Q); i++) {
      const a = rand(0, TAU), s = rand(0.86, 0.97);
      const x = Math.cos(a) * LAKE_RX * s, z = Math.sin(a) * LAKE_RZ * s;
      if (groundH(x, z) > -0.15) continue;
      if (noise(x * 0.08, z * 0.08) < 0.45) continue;
      lilies.push({ x: x, z: z, yaw: rand(0, TAU), s: rand(0.6, 1.5) });
    }
    lilyMesh = new THREE.InstancedMesh(padGeo, M.std('#ffffff', { roughness: 0.6, side: THREE.DoubleSide }), Math.max(1, lilies.length));
    lilies.forEach(function (l, i) { lilyMesh.setColorAt(i, col(pick(['#3f6b2a', '#4f7a31', '#5b8a3a', '#46702c']))); });
    lilyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    lilyMesh.frustumCulled = false;
    scene.add(lilyMesh);

    // Fish: small schools that cruise the deeper water
    const fishGeo = new THREE.ConeGeometry(0.06, 0.32, 6).rotateZ(-Math.PI / 2);
    fishGeo.scale(1, 0.75, 0.45);
    for (let s = 0; s < 5; s++) {
      const school = { a: rand(0, TAU), r: rand(25, 60), y: rand(-6, -2), v: rand(0.03, 0.06) * (rnd() < 0.5 ? 1 : -1) };
      for (let i = 0; i < 14; i++) fishes.push({ school: school, ox: rand(-1.5, 1.5), oy: rand(-0.6, 0.6), oz: rand(-1.5, 1.5), ph: rand(0, TAU) });
    }
    fishMesh = new THREE.InstancedMesh(fishGeo, M.std('#7c8a86', { metalness: 0.4, roughness: 0.4 }), fishes.length);
    fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fishMesh.frustumCulled = false;
    scene.add(fishMesh);

    // Marine snow: suspended particles around the camera (underwater only)
    const N = Math.round(2600 * Q), arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { arr[i * 3] = rand(0, 30); arr[i * 3 + 1] = rand(0, 30); arr[i * 3 + 2] = rand(0, 30); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    snowMat = new THREE.ShaderMaterial({
      uniforms: sharedU({ uCam: { value: new THREE.Vector3() }, uPx: { value: DPR } }), transparent: true, depthWrite: false,
      vertexShader: [
        'uniform vec3 uCam; uniform float uTime; uniform float uPx; varying float vA;',
        'void main(){',
        '  vec3 p = position + vec3(sin(uTime*0.2 + position.y)*0.3, uTime*-0.06, cos(uTime*0.15 + position.x)*0.3);',
        '  p = mod(p - uCam + 15.0, 30.0) - 15.0 + uCam;',
        '  vec4 mv = viewMatrix * vec4(p, 1.0);',
        '  vA = smoothstep(15.0, 2.0, length(mv.xyz)) * step(p.y, 0.0);',
        '  gl_PointSize = uPx * (2.2 / -mv.z) * 6.0; gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: 'uniform float uUnder; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vec3(0.75,0.85,0.7), a * vA * uUnder * 0.55); }',
    });
    const snow = new THREE.Points(sg, snowMat); snow.frustumCulled = false; scene.add(snow);

    // God rays underwater
    shaftMat = new THREE.ShaderMaterial({
      uniforms: sharedU({ uShade: { value: 0 } }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: 'uniform float uTime, uUnder, uShade; varying vec2 vUv; varying vec3 vWorld; void main(){ float e = smoothstep(0.0,0.35,vUv.x)*smoothstep(1.0,0.65,vUv.x); float f = smoothstep(0.0,1.0,vUv.y); float fl = 0.6 + 0.4*sin(uTime*0.7 + vWorld.x*0.3); gl_FragColor = vec4(vec3(0.55,0.75,0.55)*e*f*f*fl*0.09*uUnder*(1.0-uShade), 1.0); }',
    });
    const shafts = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(0.8, 2.2), 16).translate(0, -8, 0), shaftMat);
      m.position.set(rand(-14, 14), 0, rand(-14, 14));
      m.rotation.z = -0.25; m.userData.ox = m.position.x; m.userData.oz = m.position.z;
      shafts.add(m);
    }
    scene.add(shafts);
    shaftMat.userData.group = shafts;

    // Foam (wake) and bubbles: simple particle pools
    foamPts = makePool(900, '#e8efec', 0.1, false);
    bubblePts = makePool(200, '#cfeee8', 0.018, true);
  }

  function makePool(n, hex, size, bubble) {
    const pos = new Float32Array(n * 3).fill(-999), life = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('life', new THREE.BufferAttribute(life, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: sharedU({ uColor: { value: col(hex) }, uSize: { value: size * DPR * 900 } }), transparent: true, depthWrite: false,
      vertexShader: 'attribute float life; uniform float uSize; varying float vL; void main(){ vL = life; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize * (0.4 + (1.0-life)*' + (bubble ? '0.4' : '1.4') + ') / -mv.z; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; varying float vL; void main(){ vec2 d = gl_PointCoord-0.5; float r = length(d); float a = ' + (bubble ? 'smoothstep(0.5,0.35,r)*(0.4+0.6*smoothstep(0.2,0.45,r))*0.75' : 'smoothstep(0.5,0.0,r)*smoothstep(0.5,0.15,r)*0.32') + '; gl_FragColor = vec4(uColor*1.3, a*vL); }',
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
    return { pts: pts, pos: pos, life: life, vel: new Float32Array(n * 3), next: 0, n: n, bubble: bubble };
  }
  function emit(pool, x, y, z, vx, vy, vz) {
    const i = pool.next; pool.next = (pool.next + 1) % pool.n;
    pool.pos[i * 3] = x; pool.pos[i * 3 + 1] = y; pool.pos[i * 3 + 2] = z;
    pool.vel[i * 3] = vx; pool.vel[i * 3 + 1] = vy; pool.vel[i * 3 + 2] = vz;
    pool.life[i] = 1;
  }
  function stepPool(pool, dt, t) {
    for (let i = 0; i < pool.n; i++) {
      if (pool.life[i] <= 0) continue;
      pool.life[i] -= dt * (pool.bubble ? 0.35 : 0.4);
      pool.pos[i * 3] += pool.vel[i * 3] * dt;
      pool.pos[i * 3 + 2] += pool.vel[i * 3 + 2] * dt;
      if (pool.bubble) {
        pool.pos[i * 3 + 1] += pool.vel[i * 3 + 1] * dt;
        pool.pos[i * 3] += Math.sin(t * 6 + i) * 0.004;
        if (pool.pos[i * 3 + 1] > waveH(pool.pos[i * 3], pool.pos[i * 3 + 2], t) - 0.03) pool.life[i] = 0;
      } else {
        pool.pos[i * 3 + 1] = waveH(pool.pos[i * 3], pool.pos[i * 3 + 2], t) + 0.01;
        pool.vel[i * 3] *= 0.97; pool.vel[i * 3 + 2] *= 0.97;
      }
      if (pool.life[i] <= 0) pool.pos[i * 3 + 1] = -999;
    }
    pool.pts.geometry.attributes.position.needsUpdate = true;
    pool.pts.geometry.attributes.life.needsUpdate = true;
  }

  /* =============================================================
     6. The Lake Sentry robot (≈1.6 m long, front = +Z)
     ============================================================= */
  const bot = { x: 2, z: 2, y: 0, yaw: 0.3, speed: 0, vy: 0, turn: 0, paddle: 0, belt: 0, under: false, pitch: 0, roll: 0, stored: [] };
  let botGroup, beltTex, paddles = [], led;
  function buildBot() {
    botGroup = new THREE.Group();
    const foamMat = M.std('#f1f1ec', { roughness: 0.95 });
    const pipeMat = M.std('#e6dcc0', { roughness: 0.5 });
    const darkMat = M.std('#2b3236', { roughness: 0.6, metalness: 0.3 });
    // thermocol floats
    [-0.42, 0.42].forEach(function (x) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 1.5, 2, 2, 6), foamMat);
      crumple(f.geometry, 0.012, 8);
      f.position.set(x, 0.02, -0.05); botGroup.add(f);
    });
    // CPVC frame
    function pipe(a, b, r) {
      const v = new THREE.Vector3().subVectors(b, a); const len = v.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r || 0.022, r || 0.022, len, 8), pipeMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP, v.normalize());
      botGroup.add(m);
    }
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    const top = 0.42, xs = 0.42, z0 = -0.7, z1 = 0.55;
    pipe(V(-xs, top, z0), V(xs, top, z0)); pipe(V(-xs, top, z1), V(xs, top, z1));
    pipe(V(-xs, top, z0), V(-xs, top, z1)); pipe(V(xs, top, z0), V(xs, top, z1));
    [[-xs, z0], [xs, z0], [-xs, z1], [xs, z1], [-xs, -0.08], [xs, -0.08]].forEach(function (p) { pipe(V(p[0], 0.1, p[1]), V(p[0], top, p[1])); });
    // mesh storage basket
    const mc = document.createElement('canvas'); mc.width = mc.height = 64;
    const mg = mc.getContext('2d'); mg.strokeStyle = '#cfd6d8'; mg.lineWidth = 3;
    for (let i = 0; i <= 64; i += 16) { mg.beginPath(); mg.moveTo(i, 0); mg.lineTo(i, 64); mg.stroke(); mg.beginPath(); mg.moveTo(0, i); mg.lineTo(64, i); mg.stroke(); }
    const meshTex = new THREE.CanvasTexture(mc); meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping; meshTex.repeat.set(6, 3);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.75), new THREE.MeshStandardMaterial({ map: meshTex, alphaMap: meshTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: col('#c9d1d3'), roughness: 0.5, metalness: 0.5 }));
    basket.position.set(0, 0.2, -0.05); botGroup.add(basket);
    // slanted conveyor at the front (belt scrolls when running)
    const bc = document.createElement('canvas'); bc.width = 32; bc.height = 64;
    const bg = bc.getContext('2d'); bg.fillStyle = '#3c4a44'; bg.fillRect(0, 0, 32, 64);
    bg.fillStyle = '#d7d0b5'; for (let y = 0; y < 64; y += 8) bg.fillRect(0, y, 32, 3);
    beltTex = new THREE.CanvasTexture(bc); beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping; beltTex.repeat.set(3, 4);
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.95), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.7, side: THREE.DoubleSide }));
    belt.position.set(0, 0.16, 0.78); belt.rotation.x = -Math.PI / 2 + 0.55; botGroup.add(belt);
    [-0.3, 0.3].forEach(function (x) {
      pipe(V(x, -0.12, 1.18), V(x, 0.44, 0.38), 0.018);
    });
    pipe(V(-0.3, -0.12, 1.18), V(0.3, -0.12, 1.18), 0.018);
    // electronics box + motor + antenna with a blinking light
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.22), darkMat); box.position.set(0, 0.5, -0.55); botGroup.add(box);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.35, 4), darkMat); ant.position.set(0.1, 0.72, -0.6); botGroup.add(ant);
    led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: col('#000000'), emissive: col('#7fb2ff'), emissiveIntensity: 4 }));
    led.position.set(0.1, 0.9, -0.6); botGroup.add(led);
    // paddle wheels at the back
    [-0.62, 0.62].forEach(function (x) {
      const wheel = new THREE.Group(); wheel.position.set(x, 0.12, -0.62);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10).rotateZ(Math.PI / 2), darkMat); wheel.add(hub);
      for (let k = 0; k < 6; k++) {
        const pd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.012), M.std('#37474f'));
        pd.position.set(0, Math.cos(k / 6 * TAU) * 0.14, Math.sin(k / 6 * TAU) * 0.14);
        pd.rotation.x = -k / 6 * TAU; wheel.add(pd);
      }
      paddles.push(wheel); botGroup.add(wheel);
      pipe(V(x * 0.7, 0.12, -0.62), V(x, 0.12, -0.62), 0.018);
    });
    scene.add(botGroup);
  }


  /* =============================================================
     7. Pollution set pieces
     ============================================================= */
  // Merge several geometries into one (so a plant is a single instance).
  function merge(list) {
    let n = 0, idx = 0;
    list.forEach(function (g) { n += g.attributes.position.count; idx += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), ind = new Uint32Array(idx);
    let vo = 0, io = 0;
    list.forEach(function (g) {
      pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
      const c = g.attributes.position.count;
      if (g.index) { for (let i = 0; i < g.index.count; i++) ind[io + i] = g.index.array[i] + vo; io += g.index.count; }
      else { for (let i = 0; i < c; i++) ind[io + i] = vo + i; io += c; }
      vo += c;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setIndex(new THREE.BufferAttribute(ind, 1));
    return out;
  }

  let foamMesh, foams = [], deadMesh, dead = [], swarm, swarmMat;
  const SPOT = {}; // named places used by the route and the hotspots
  function buildPollution() {
    /* ---- Water hyacinth carpet ---- */
    // one rosette: glossy rounded leaves on spongy stalks
    const leaves = [];
    for (let k = 0; k < 6; k++) {
      const ang = k / 6 * TAU + (k % 2) * 0.25, lean = 0.75 + (k % 3) * 0.18, out = 0.03 + (k % 2) * 0.015;
      const leaf = new THREE.CircleGeometry(1, 14);
      const lp = leaf.attributes.position;
      for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), y = lp.getY(i); lp.setZ(i, x * x * 0.35 + y * 0.08); } // cupped
      leaf.computeVertexNormals();
      leaf.scale(0.055, 0.065, 0.06); leaf.rotateX(-lean); leaf.translate(0, 0.075, out + 0.03); leaf.rotateY(ang);
      const stalk = new THREE.SphereGeometry(1, 7, 4); stalk.scale(0.02, 0.04, 0.02); stalk.rotateX(-0.5); stalk.translate(0, 0.03, out); stalk.rotateY(ang);
      leaves.push(leaf, stalk);
    }
    const rosette = merge(leaves);
    const pts = [];
    const want = Math.round(6500 * Q);
    for (let guard = 0; pts.length < want && guard < want * 8; guard++) {
      const x = rand(-170, 170), z = rand(-170, 170);
      const m = hyacinthAt(x, z);
      if (m < 0.05 || rnd() > Math.pow(m, 0.6)) continue;
      if (groundH(x, z) > -0.2) continue;
      pts.push({ x: x, z: z, s: rand(1.8, 3.2) * (0.7 + m * 0.5) });
    }
    const hy = new THREE.InstancedMesh(rosette, M.std('#ffffff', { roughness: 0.38, metalness: 0.05, side: THREE.DoubleSide }), Math.max(1, pts.length));
    const greens = ['#3c6b2a', '#46772f', '#335f25', '#527f37', '#2d5422', '#5d7f36', '#6b6a32'];
    pts.forEach(function (p, i) {
      dummy.position.set(p.x, 0.02, p.z); dummy.rotation.set(rand(-0.08, 0.08), rand(0, TAU), rand(-0.08, 0.08)); dummy.scale.setScalar(p.s);
      dummy.updateMatrix(); hy.setMatrixAt(i, dummy.matrix); hy.setColorAt(i, col(pick(greens)).multiplyScalar(rand(0.8, 1.15)));
    });
    scene.add(hy);
    // pale lavender flower spikes on some plants
    const fl = []; for (let k = 0; k < 7; k++) { const g = new THREE.SphereGeometry(0.018, 6, 4); g.translate(Math.sin(k * 2.1) * 0.015, 0.09 + k * 0.022, Math.cos(k * 2.1) * 0.015); fl.push(g); }
    const flowerPts = pts.filter(function () { return rnd() < 0.07; });
    const flowers = new THREE.InstancedMesh(merge(fl), M.std('#c9b3ea', { roughness: 0.6, emissive: col('#2a1f3a') }), Math.max(1, flowerPts.length));
    flowerPts.forEach(function (p, i) { dummy.position.set(p.x, 0.02, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix(); flowers.setMatrixAt(i, dummy.matrix); });
    scene.add(flowers);
    // dark trailing roots underneath (seen when diving)
    const rootPts = pts.filter(function () { return rnd() < 0.3; });
    const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.003, 1, 4).translate(0, -0.5, 0), M.std('#241c20', { roughness: 1 }), Math.max(1, rootPts.length));
    rootPts.forEach(function (p, i) { dummy.position.set(p.x, 0.02, p.z); dummy.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3)); dummy.scale.set(p.s * 1.5, rand(0.3, 0.7) * p.s, p.s * 1.5); dummy.updateMatrix(); roots.setMatrixAt(i, dummy.matrix); });
    scene.add(roots);
    // a continuous green mat between the plants (dark from below)
    const matGeo = new THREE.PlaneGeometry(360, 360, 140, 140).rotateX(-Math.PI / 2);
    const mAttr = new Float32Array(matGeo.attributes.position.count);
    for (let i = 0; i < mAttr.length; i++) mAttr[i] = hyacinthAt(matGeo.attributes.position.getX(i), matGeo.attributes.position.getZ(i));
    matGeo.setAttribute('m', new THREE.BufferAttribute(mAttr, 1));
    const carpet = new THREE.Mesh(matGeo, new THREE.ShaderMaterial({
      uniforms: sharedU(), side: THREE.DoubleSide,
      vertexShader: 'attribute float m; varying float vM; varying vec3 vWorld; void main(){ vM = m; vec4 w = modelMatrix*vec4(position,1.0); w.y = 0.025; vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: GLSL_COMMON + '\nvarying float vM; varying vec3 vWorld; void main(){ float n = vnoise(vWorld.xz*2.3)*0.6 + vnoise(vWorld.xz*9.0)*0.4; if (vM + (n-0.5)*0.5 < 0.42) discard;' +
        ' vec3 c; if (gl_FrontFacing) { float dead = smoothstep(0.62, 0.8, vnoise(vWorld.xz*0.09 + 4.0)); float cell = vnoise(vWorld.xz*14.0);' +
        ' c = mix(srgb(vec3(0.12,0.22,0.08)), srgb(vec3(0.24,0.36,0.13)), n*0.7 + cell*0.3);' +
        ' c = mix(c, srgb(vec3(0.33,0.27,0.14)), dead*0.75);' +
        ' c *= 0.45 + 1.9*max(uSunDir.y, 0.0) + 0.25*cell; }' +
        ' else { c = srgb(vec3(0.03,0.04,0.03)) + vec3(0.02,0.05,0.03)*n; }' +
        ' gl_FragColor = vec4(applyFog(c, length(cameraPosition - vWorld)), 1.0); }',
    }));
    scene.add(carpet);
    SPOT.hyacinth = lakePt(INF.a, 0.7, 0.15);

    /* ---- Sewage channel (nala) entering the lake ---- */
    const len = 46, yaw = Math.atan2(INF.nx, INF.nz);
    const concrete = M.std('#6f6b63', { roughness: 0.97 });
    const nala = new THREE.Group();
    nala.position.set(INF.x, 0, INF.z); nala.rotation.y = yaw;
    for (let k = 0; k < 12; k++) {
      const z0 = -2 + k * (len / 12), zc = z0 + len / 24;
      const floor = 0.15 + Math.max(0, zc) * 0.03;
      [-2.6, 2.6].forEach(function (side) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.0, len / 12 + 0.05), concrete);
        wall.position.set(side, floor + 0.35, zc); nala.add(wall);
      });
    }
    // the flowing sewage
    const flow = new THREE.Mesh(new THREE.PlaneGeometry(4.7, len + 2, 1, 20).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: sharedU(),
      vertexShader: 'varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: GLSL_COMMON + '\nvarying vec2 vUv; varying vec3 vWorld; void main(){ vec2 p = vec2(vUv.x*3.0, vUv.y*40.0 + uTime*1.6); float n = vnoise(p) * 0.6 + vnoise(p*3.1) * 0.4;' +
        ' vec3 c = mix(srgb(vec3(0.16,0.15,0.11)), srgb(vec3(0.36,0.33,0.25)), n); c += vec3(0.5,0.45,0.35) * smoothstep(0.78, 0.95, n) * 0.6;' +
        ' c *= 0.9 + 0.5*max(uSunDir.y,0.0); gl_FragColor = vec4(applyFog(c, length(cameraPosition - vWorld)), 1.0); }',
    }));
    flow.position.set(0, 0.9, len / 2 - 3); flow.rotation.x = -0.03; nala.add(flow);
    scene.add(nala);
    SPOT.inlet = new THREE.Vector3(INF.x, 0.8, INF.z);

    /* ---- Froth near the inlet ---- */
    for (let i = 0; i < 0; i++) {
      const a = INF.a + Math.PI + rand(-1.1, 1.1), r = Math.pow(rnd(), 1.6) * 9;
      const x = INF.x + Math.cos(a) * r, z = INF.z + Math.sin(a) * r;
      if (groundH(x, z) > -0.15) continue;
      foams.push({ x: x, z: z, s: rand(0.1, 0.35), ph: rand(0, TAU) });
    }
    foamMesh = new THREE.InstancedMesh(crumple(new THREE.IcosahedronGeometry(1, 2), 0.55, 2.2), M.std('#e6e1d2', { roughness: 1 }), Math.max(1, foams.length));
    foamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(foamMesh);
    SPOT.froth = lakePt(INF.a, 0.93, 0.3);

    /* ---- Dead fish floating belly-up in the low-oxygen water ---- */
    // a fish body (lathe profile, flattened sideways) with a tail and a dorsal fin
    const prof = [[0, -0.2], [0.02, -0.19], [0.045, -0.13], [0.06, -0.04], [0.058, 0.04], [0.045, 0.11], [0.022, 0.17], [0, 0.19]].map(function (q) { return new THREE.Vector2(q[0], q[1]); });
    const fishGeo = new THREE.LatheGeometry(prof, 10); fishGeo.scale(1, 1, 0.42); fishGeo.rotateZ(-Math.PI / 2);
    const tailShape = new THREE.Shape(); tailShape.moveTo(0, 0); tailShape.lineTo(-0.1, 0.06); tailShape.lineTo(-0.085, 0); tailShape.lineTo(-0.1, -0.06); tailShape.lineTo(0, 0);
    const tail = new THREE.ShapeGeometry(tailShape); tail.translate(-0.18, 0, 0);
    const finShape = new THREE.Shape(); finShape.moveTo(-0.06, 0); finShape.lineTo(0.0, 0.045); finShape.lineTo(0.05, 0); finShape.lineTo(-0.06, 0);
    const fin = new THREE.ShapeGeometry(finShape); fin.translate(0, 0.055, 0);
    for (let i = 0; i < Math.round(46 * Q); i++) {
      const a = INF.a + Math.PI + (i < 14 ? rand(-0.35, 0.35) : rand(-0.9, 0.9)), r = i < 14 ? rand(9, 15) : rand(5, 30);
      const x = INF.x + Math.cos(a) * r, z = INF.z + Math.sin(a) * r;
      if (groundH(x, z) > -0.2) continue;
      dead.push({ x: x, z: z, yaw: rand(0, TAU), ph: rand(0, TAU), s: rand(1.3, 2.0) });
    }
    deadMesh = new THREE.InstancedMesh(merge([fishGeo, tail, fin]), M.std('#b9c0ba', { metalness: 0.45, roughness: 0.35, side: THREE.DoubleSide }), Math.max(1, dead.length));
    deadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(deadMesh);
    SPOT.fish = new THREE.Vector3(INF.x - INF.nx * 12, 0.15, INF.z - INF.nz * 12);

    /* ---- Rubble on the dump ---- */
    const bricks = [];
    for (let i = 0; i < Math.round(700 * Q); i++) {
      const a = rand(0, TAU), r = Math.sqrt(rnd()) * 11, x = DUMP.x + Math.cos(a) * r, z = DUMP.z + Math.sin(a) * r * 0.85;
      if (dumpAt(x, z) < 0.25) continue;
      bricks.push({ x: x, z: z });
    }
    const rubble = new THREE.InstancedMesh(crumple(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2), 0.15, 3), M.std('#ffffff', { roughness: 0.95 }), Math.max(1, bricks.length));
    bricks.forEach(function (b, i) {
      dummy.position.set(b.x, meshH(b.x, b.z) + 0.05, b.z); dummy.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
      const big = rnd() < 0.15; dummy.scale.set(rand(0.2, 0.45) * (big ? 2.4 : 1), rand(0.08, 0.2) * (big ? 2 : 1), rand(0.12, 0.3) * (big ? 2.4 : 1));
      dummy.updateMatrix(); rubble.setMatrixAt(i, dummy.matrix);
      rubble.setColorAt(i, col(pick(['#9a5b44', '#a86a4f', '#8f8a82', '#b0aaa0', '#6f6a64'])));
    });
    scene.add(rubble);
    SPOT.dump = new THREE.Vector3(DUMP.x, groundH(DUMP.x, DUMP.z) + 1, DUMP.z);

    /* ---- Buildings crowding the shore (encroachment) ---- */
    const bc = document.createElement('canvas'); bc.width = 128; bc.height = 128;
    const bg = bc.getContext('2d'); bg.fillStyle = '#ffffff'; bg.fillRect(0, 0, 128, 128);
    for (let y = 10; y < 128; y += 32) for (let x = 10; x < 128; x += 40) { bg.fillStyle = '#3b3f45'; bg.fillRect(x, y, 22, 16); bg.fillStyle = '#c9c4ba'; bg.fillRect(x - 3, y + 18, 28, 3); }
    const wallTex = new THREE.CanvasTexture(bc); wallTex.encoding = THREE.sRGBEncoding;
    const blocks = [];
    for (let i = 0; i < 70; i++) {
      const a = rand(-0.75, 0.05);
      let k = 0.6; while (shore(Math.cos(a) * LAKE_RX * k, Math.sin(a) * LAKE_RZ * k) < 1 && k < 2) k += 0.004;
      const out = rnd() < 0.3 ? rand(-1, 3) : rand(4, 60);
      const L = Math.hypot(Math.cos(a) * LAKE_RX, Math.sin(a) * LAKE_RZ) * k + out;
      const x = Math.cos(a) * L, z = Math.sin(a) * L * (LAKE_RZ / LAKE_RX);
      if (blocks.some(function (b) { return Math.hypot(b.x - x, b.z - z) < 12; })) continue;
      const floors = Math.floor(rand(2, 6));
      blocks.push({ x: x, z: z, w: rand(8, 15), d: rand(8, 13), h: floors * 3.1, yaw: -a + rand(-0.15, 0.15) });
    }
    const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }), Math.max(1, blocks.length));
    const tanks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12), M.std('#1b1b1b', { roughness: 0.6 }), Math.max(1, blocks.length * 2));
    blocks.forEach(function (b, i) {
      const base = Math.max(groundH(b.x, b.z), 0.4);
      dummy.position.set(b.x, base + b.h / 2 - 0.5, b.z); dummy.rotation.set(0, b.yaw, 0); dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix(); houses.setMatrixAt(i, dummy.matrix);
      houses.setColorAt(i, col(pick(['#e3d6c4', '#d9cbb3', '#cfc2ae', '#e8dccb', '#c6cdd0', '#e0c9c0', '#d4d0a8'])));
      for (let k = 0; k < 2; k++) {
        dummy.position.set(b.x + rand(-b.w, b.w) * 0.3, base + b.h - 0.5 + 0.6, b.z + rand(-b.d, b.d) * 0.3); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
        dummy.updateMatrix(); tanks.setMatrixAt(i * 2 + k, dummy.matrix);
      }
    });
    scene.add(houses, tanks);
    const nearest = blocks.slice().sort(function (p, q) { return shore(p.x, p.z) - shore(q.x, q.z); })[0];
    SPOT.buildings = nearest ? new THREE.Vector3(nearest.x, Math.max(groundH(nearest.x, nearest.z), 0.4) + nearest.h * 0.6, nearest.z) : lakePt(-0.35, 1.1, 4);

    /* ---- Mosquitoes over the weed-choked water ---- */
    SPOT.mosquito = lakePt(INF.a - 0.15, 0.68, 1.2);
    const N = 360, arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { arr[i * 3] = rand(-1, 1); arr[i * 3 + 1] = rand(-1, 1); arr[i * 3 + 2] = rand(-1, 1); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    swarmMat = new THREE.ShaderMaterial({
      uniforms: sharedU({ uPx: { value: DPR } }), transparent: true, depthWrite: false,
      vertexShader: 'uniform float uTime, uPx; void main(){ vec3 p = position; float t = uTime*3.0 + p.x*40.0; p += vec3(sin(t), sin(t*1.3+p.y*30.0)*0.6, cos(t*0.9+p.z*20.0)) * 0.35; p *= vec3(2.2, 0.9, 2.2); vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = uPx * 22.0 / -mv.z; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'void main(){ float r = length(gl_PointCoord-0.5); gl_FragColor = vec4(0.04,0.04,0.03, smoothstep(0.5,0.2,r)*0.9); }',
    });
    swarm = new THREE.Points(sg, swarmMat); swarm.position.copy(SPOT.mosquito); swarm.frustumCulled = false; scene.add(swarm);

    SPOT.bed = BEDP.clone(); SPOT.bed.y = meshH(SPOT.bed.x, SPOT.bed.z) + 0.2;
    SPOT.under = lakePt(INF.a, 0.66, -0.35);
  }

  function updatePollution(t) {
    foams.forEach(function (f, i) {
      dummy.position.set(f.x + Math.sin(t * 0.2 + f.ph) * 0.15, 0.02 + Math.sin(t * 0.9 + f.ph) * 0.015, f.z + Math.cos(t * 0.17 + f.ph) * 0.15);
      dummy.rotation.set(0, f.ph, 0); dummy.scale.set(f.s, f.s * 0.12, f.s * 0.8);
      dummy.updateMatrix(); foamMesh.setMatrixAt(i, dummy.matrix);
    });
    foamMesh.instanceMatrix.needsUpdate = true;
    dead.forEach(function (f, i) {
      dummy.position.set(f.x, waveH(f.x, f.z, t) * 0.4 + 0.045, f.z);
      dummy.rotation.set(Math.PI / 2 + Math.sin(t * 0.7 + f.ph) * 0.1, f.yaw + Math.sin(t * 0.1 + f.ph) * 0.2, 0, 'YXZ');
      dummy.scale.setScalar(f.s); dummy.updateMatrix(); deadMesh.setMatrixAt(i, dummy.matrix);
    });
    deadMesh.instanceMatrix.needsUpdate = true;
  }

  /* =============================================================
     8. The guided route
     Each chapter section in dive.html has data-chapter="id". Scrolling
     through a section holds the camera at that chapter for the first
     half, then glides to the next one.
     ============================================================= */
  let ROUTE = [];
  function buildRoute() {
    const bc = lakePt(-0.78, 0.35, 0);
    bot.x = bc.x; bot.z = bc.z; bot.cx = bc.x; bot.cz = bc.z;
    const V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
    // light / oxygen: illustrative levels 0..1 for the gauges
    ROUTE = {
      intro:   { pos: V(-150, 88, 165), tgt: V(0, -8, 0), light: 0.7, oxy: 0.55 },
      squeeze: { pos: lakePt(-0.35, 0.55, 7), tgt: SPOT.buildings.clone().setY(5), light: 0.7, oxy: 0.55 },
      carpet:  { pos: lakePt(INF.a, 0.36, 5.5), tgt: lakePt(INF.a, 0.78, 0), light: 0.3, oxy: 0.35 },
      cause:   { pos: V(INF.x - INF.nx * 13 + INF.nz * 4, 4.5, INF.z - INF.nz * 13 - INF.nx * 4), tgt: V(INF.x + INF.nx * 10, 0.6, INF.z + INF.nz * 10), light: 0.3, oxy: 0.2 },
      oxygen:  { pos: V(SPOT.fish.x - INF.nx * 4 - INF.nz * 2, 1.1, SPOT.fish.z - INF.nz * 4 + INF.nx * 2), tgt: SPOT.fish.clone().setY(0), light: 0.3, oxy: 0.06 },
      dark:    { pos: lakePt(INF.a, 0.58, -2.3), tgt: lakePt(INF.a, 0.8, -0.3), light: 0.04, oxy: 0.05 },
      bed:     { pos: SPOT.bed.clone().add(V(-2.2, 1.6, 2.2)), tgt: SPOT.bed.clone().add(V(1, -0.2, -1)), light: 0.08, oxy: 0.05 },
      banks:   { pos: V(DUMP.x - Math.cos(DUMP.a) * 24, 3.6, DUMP.z - Math.sin(DUMP.a) * 24), tgt: SPOT.dump.clone(), light: 0.65, oxy: 0.5 },
      health:  { pos: lakePt(INF.a - 0.3, 0.5, 1.6), tgt: SPOT.mosquito.clone(), light: 0.25, oxy: 0.2 },
      change:  { pos: V(bc.x - 6.5, 2.8, bc.z + 6.5), tgt: V(bc.x, 0.1, bc.z), light: 0.85, oxy: 0.8 },
    };
    SPOT.robot = V(bc.x, 0.9, bc.z);
  }

  const sections = Array.prototype.slice.call(document.querySelectorAll('[data-chapter]'));
  let chapterPos = [], chapterTgt = [], chapterIds = [], posCurve, tgtCurve;
  function prepareCurves() {
    chapterIds = sections.map(function (s) { return s.dataset.chapter; }).filter(function (id) { return ROUTE[id]; });
    chapterPos = chapterIds.map(function (id) { return ROUTE[id].pos; });
    chapterTgt = chapterIds.map(function (id) { return ROUTE[id].tgt; });
    posCurve = new THREE.CatmullRomCurve3(chapterPos, false, 'centripetal');
    tgtCurve = new THREE.CatmullRomCurve3(chapterTgt, false, 'centripetal');
  }

  // Where are we along the route? (chapter index + fraction)
  let cTarget = 0, cNow = 0;
  function readScroll() {
    const mid = window.scrollY + window.innerHeight * 0.4;
    let c = 0;
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i], top = s.offsetTop, h = s.offsetHeight;
      if (mid >= top) {
        const f = clamp((mid - top) / h, 0, 1);
        c = i + (i < sections.length - 1 ? smooth(0.5, 1.0, f) : 0);
        // fade each card in and out as its section passes
        const card = s.querySelector('.dive-card');
        if (card) {
          const o = (i === 0 ? 1 : smooth(0.02, 0.14, f)) * (i === sections.length - 1 ? 1 : 1 - smooth(0.62, 0.86, f));
          card.style.opacity = String(o);
          card.style.transform = 'translateY(' + ((1 - o) * 24) + 'px)';
          card.classList.toggle('is-active', o > 0.3);
        }
      }
    }
    cTarget = clamp(c, 0, chapterIds.length - 1);
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', readScroll);

  // Look around: drag (or arrow keys); scrolling eases the view back.
  const look = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 };
  let drag = null;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch' }; if (!drag.touch) cv.setPointerCapture(e.pointerId); stage.classList.add('is-looking'); });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || drag.id !== e.pointerId) return;
    look.tYaw = clamp(look.tYaw - (e.clientX - drag.x) * 0.004, -2.2, 2.2);
    if (!drag.touch) look.tPitch = clamp(look.tPitch - (e.clientY - drag.y) * 0.003, -0.7, 0.7);
    drag.x = e.clientX; drag.y = e.clientY;
    if (hint) hint.classList.add('is-done');
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { cv.addEventListener(ev, function () { drag = null; stage.classList.remove('is-looking'); }); });
  window.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
    if (e.key === 'ArrowLeft') { look.tYaw = clamp(look.tYaw + 0.25, -2.2, 2.2); e.preventDefault(); }
    if (e.key === 'ArrowRight') { look.tYaw = clamp(look.tYaw - 0.25, -2.2, 2.2); e.preventDefault(); }
  });
  const hint = document.getElementById('dive-hint');

  /* ---------- Hotspots ---------- */
  const hotEls = Array.prototype.slice.call(document.querySelectorAll('[data-hot]'));
  hotEls.forEach(function (el) {
    const btn = el.querySelector('button'), pop = el.querySelector('.dive-pop');
    btn.addEventListener('click', function () {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      hotEls.forEach(function (o) { o.querySelector('button').setAttribute('aria-expanded', 'false'); o.querySelector('.dive-pop').hidden = true; });
      btn.setAttribute('aria-expanded', String(open)); pop.hidden = !open;
    });
  });
  const proj = new THREE.Vector3();
  function updateHotspots(active) {
    const w = stage.clientWidth, h = stage.clientHeight;
    hotEls.forEach(function (el) {
      const p = SPOT[el.dataset.hot];
      const on = p && el.dataset.in.split(' ').indexOf(active) >= 0;
      if (!on) { el.classList.remove('on'); return; }
      proj.copy(p).project(camera);
      const vis = proj.z < 1 && Math.abs(proj.x) < 0.92 && Math.abs(proj.y) < 0.9;
      el.classList.toggle('on', vis);
      if (vis) el.style.transform = 'translate(' + ((proj.x * 0.5 + 0.5) * w) + 'px,' + ((-proj.y * 0.5 + 0.5) * h) + 'px)';
    });
  }

  /* ---------- Gauges + chapter readout ---------- */
  const G = {
    light: document.getElementById('g-light'), oxy: document.getElementById('g-oxy'),
    lightT: document.getElementById('g-light-t'), oxyT: document.getElementById('g-oxy-t'),
    num: document.getElementById('hud-chapter'), depth: document.getElementById('hud-depth'),
    dots: Array.prototype.slice.call(document.querySelectorAll('[data-goto]')), got: document.getElementById('dive-got'),
  };
  function word(v) { return v > 0.66 ? 'Good' : v > 0.4 ? 'Fair' : v > 0.15 ? 'Low' : 'Very low'; }
  let lastActive = '';
  function updateHud(active, under) {
    const i0 = Math.floor(cNow), i1 = Math.min(i0 + 1, chapterIds.length - 1), f = cNow - i0;
    const a = ROUTE[chapterIds[i0]], b = ROUTE[chapterIds[i1]];
    const light = lerp(a.light, b.light, f), oxy = lerp(a.oxy, b.oxy, f);
    G.light.style.transform = 'scaleX(' + light.toFixed(3) + ')'; G.oxy.style.transform = 'scaleX(' + oxy.toFixed(3) + ')';
    G.lightT.textContent = word(light); G.oxyT.textContent = word(oxy);
    const d = waveH(camera.position.x, camera.position.z, t) - camera.position.y;
    G.depth.textContent = under ? ('-' + d.toFixed(1) + ' m') : ('+' + (-d).toFixed(1) + ' m');
    if (active !== lastActive) {
      lastActive = active;
      const idx = chapterIds.indexOf(active);
      G.num.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(chapterIds.length).padStart(2, '0');
      G.dots.forEach(function (dot) { const on = dot.dataset.goto === active; dot.classList.toggle('is-on', on); if (on) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current'); });
    }
  }
  G.dots.forEach(function (dot) {
    dot.dataset.label = dot.textContent;
    dot.addEventListener('click', function () {
      const s = document.querySelector('[data-chapter="' + dot.dataset.goto + '"]');
      if (s) window.scrollTo({ top: s.offsetTop - window.innerHeight * 0.1, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ---------- The robot at work in the last chapter ---------- */
  const botQ = new THREE.Quaternion(), local = new THREE.Vector3();
  let collected = 0;
  function updateBot(dt) {
    bot.th = (bot.th || 0) + 0.35 * dt;
    bot.speed = 0.7;
    bot.x = bot.cx + Math.cos(bot.th) * 1.8; bot.z = bot.cz + Math.sin(bot.th) * 1.8;
    bot.yaw = Math.atan2(-Math.sin(bot.th), Math.cos(bot.th));
    bot.y = waveH(bot.x, bot.z, t);
    waveN(bot.x, bot.z, t, tmpN);
    bot.pitch = lerp(bot.pitch, -Math.atan2(tmpN.z * Math.cos(bot.yaw) + tmpN.x * Math.sin(bot.yaw), 1), 1 - Math.exp(-dt * 4));
    bot.roll = lerp(bot.roll, Math.atan2(tmpN.x * Math.cos(bot.yaw) - tmpN.z * Math.sin(bot.yaw), 1), 1 - Math.exp(-dt * 4));
    tmpE.set(bot.pitch, bot.yaw, bot.roll, 'YXZ'); botQ.setFromEuler(tmpE);
    botGroup.position.set(bot.x, bot.y - 0.06, bot.z); botGroup.quaternion.copy(botQ);
    bot.paddle += bot.speed * dt * 3;
    paddles.forEach(function (p) { p.rotation.x = bot.paddle; });
    bot.belt += dt * 0.6; beltTex.offset.y = -bot.belt;
    led.material.emissiveIntensity = (Math.sin(t * 4) > 0.6 ? 6 : 0.4);
    SPOT.robot.set(bot.x, bot.y + 0.9, bot.z);
    // conveyor pickup
    const s = Math.sin(bot.yaw), c = Math.cos(bot.yaw);
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.state === 'float') {
        const dx = it.x - bot.x, dz = it.z - bot.z;
        if (dx * dx + dz * dz < 4) {
          const fwd = dx * s + dz * c, side = dx * c - dz * s;
          if (fwd > 0.75 && fwd < 1.45 && Math.abs(side) < 0.36) {
            it.state = 'collect'; it.t = 0; it.side = side; it.world = new THREE.Vector3(); it.worldQ = new THREE.Quaternion();
            it.slot = new THREE.Vector3(rand(-0.22, 0.22), rand(0.12, 0.26), rand(-0.35, 0.25));
            collected += 1; if (G.got) G.got.textContent = String(collected);
          }
        }
      }
      if (it.state === 'collect' || it.state === 'stored') {
        if (it.state === 'collect') {
          it.t += dt * 0.8;
          const u = Math.min(it.t, 1);
          if (u < 0.75) { const v = u / 0.75; local.set(it.side * (1 - v * 0.5), lerp(-0.08, 0.45, v), lerp(1.12, 0.42, v)); }
          else { const v = (u - 0.75) / 0.25; local.set(lerp(it.side * 0.5, it.slot.x, v), lerp(0.45, it.slot.y, v) + Math.sin(v * Math.PI) * 0.08, lerp(0.42, it.slot.z, v)); }
          if (it.t >= 1) { it.state = 'stored'; bot.stored.push(it); if (bot.stored.length > 12) bot.stored.shift().state = 'gone'; }
        } else local.copy(it.slot);
        it.world.copy(local).applyQuaternion(botQ).add(botGroup.position);
        it.worldQ.copy(botQ).multiply(tmpQ.setFromEuler(tmpE.set(Math.PI / 2, it.yaw, 0)));
      }
      if (it.state === 'gone') {
        // trash keeps arriving: a piece reappears near the robot's loop later on
        it.t += dt;
        if (it.t > 30) { const a = rand(0, TAU), r = rand(3, 9); it.x = bot.cx + Math.cos(a) * r; it.z = bot.cz + Math.sin(a) * r; it.state = 'float'; it.t = 0; }
      }
    }
    // wake
    const fs = Math.sin(bot.yaw), fc = Math.cos(bot.yaw);
    if (rnd() < 0.7) { const side = rnd() < 0.5 ? -1 : 1; emit(foamPts, bot.x - fs * 0.7 + fc * side * 0.6, 0, bot.z - fc * 0.7 - fs * side * 0.6, -fs * 0.15 + fc * side * 0.1, 0, -fc * 0.15 - fs * side * 0.1); }
  }

  function updateLife(dt) {
    lilies.forEach(function (l, i) {
      dummy.position.set(l.x, waveH(l.x, l.z, t) + 0.005, l.z);
      waveN(l.x, l.z, t, tmpN); dummy.quaternion.setFromUnitVectors(UP, tmpN).multiply(tmpQ.setFromAxisAngle(UP, l.yaw));
      dummy.scale.setScalar(l.s); dummy.updateMatrix(); lilyMesh.setMatrixAt(i, dummy.matrix);
    });
    lilyMesh.instanceMatrix.needsUpdate = true;
    fishes.forEach(function (f, i) {
      const sc = f.school; const a = sc.a + t * sc.v;
      const x = Math.cos(a) * sc.r + f.ox + Math.sin(t * 0.7 + f.ph) * 0.3, z = Math.sin(a) * sc.r * 0.8 + f.oz, y = Math.max(sc.y + f.oy, groundH(x, z) + 0.4);
      dummy.position.set(x, Math.min(y, -0.6), z);
      const fvx = -Math.sin(a) * sc.v, fvz = Math.cos(a) * 0.8 * sc.v;
      dummy.rotation.set(0, Math.atan2(-fvz, fvx) + Math.sin(t * 8 + f.ph) * 0.15, 0);
      dummy.scale.setScalar(1); dummy.updateMatrix(); fishMesh.setMatrixAt(i, dummy.matrix);
    });
    fishMesh.instanceMatrix.needsUpdate = true;
    const g = shaftMat.userData.group;
    g.position.set(camera.position.x, 0, camera.position.z);
    g.children.forEach(function (m) { m.lookAt(camera.position.x, m.getWorldPosition(tmpV).y, camera.position.z); m.rotateZ(-0.2); });
    shaftMat.uniforms.uShade.value = hyacinthAt(camera.position.x, camera.position.z);
    snowMat.uniforms.uCam.value.copy(camera.position);
  }

  /* =============================================================
     9. Main loop
     ============================================================= */
  const clock = new THREE.Clock();
  let t = 0, splash = 0, wasUnder = false, raf = null;
  const tmpV = new THREE.Vector3(), camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), dir = new THREE.Vector3();

  function updateCamera(dt) {
    cNow = reduceMotion ? cTarget : lerp(cNow, cTarget, 1 - Math.exp(-dt * 2.6));
    const moving = Math.abs(cTarget - cNow) > 0.004;
    if (moving && !drag) { look.tYaw = lerp(look.tYaw, 0, 1 - Math.exp(-dt * 1.8)); look.tPitch = lerp(look.tPitch, 0, 1 - Math.exp(-dt * 1.8)); }
    look.yaw = lerp(look.yaw, look.tYaw, 1 - Math.exp(-dt * 6)); look.pitch = lerp(look.pitch, look.tPitch, 1 - Math.exp(-dt * 6));
    const u = chapterIds.length > 1 ? cNow / (chapterIds.length - 1) : 0;
    posCurve.getPoint(u, camPos); tgtCurve.getPoint(u, camTgt);
    if (!reduceMotion) { camPos.x += Math.sin(t * 0.21) * 0.25; camPos.y += Math.sin(t * 0.33) * 0.12; camPos.z += Math.cos(t * 0.17) * 0.25; }
    // stay above the ground and never sit exactly on the waterline
    camPos.y = Math.max(camPos.y, meshH(camPos.x, camPos.z) + 0.6);
    const surf = waveH(camPos.x, camPos.z, t);
    if (Math.abs(camPos.y - surf) < 0.3) camPos.y = surf + (camPos.y >= surf ? 0.3 : -0.3);
    camera.position.copy(camPos);
    dir.subVectors(camTgt, camPos).normalize();
    // Cards sit left (even chapters) or right (odd); on phones at the bottom.
    // Turn the view a little so the subject isn't hidden behind the card.
    const W = stage.clientWidth, wide = W > 760;
    const cardFrac = Math.min(0.6, (Math.min(480, W) + W * 0.04 + 30) / W);
    const halfH = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
    const amt = Math.atan(cardFrac * Math.tan(halfH));
    const sideOf = function (i) { return i % 2 === 0 ? amt : -amt; };
    const i0 = Math.floor(cNow), fr = cNow - i0;
    const shift = wide ? lerp(sideOf(i0), sideOf(Math.min(i0 + 1, chapterIds.length - 1)), fr) : 0;
    dir.applyAxisAngle(UP, look.yaw + shift);
    if (!wide) dir.y -= 0.12;
    const horiz = Math.hypot(dir.x, dir.z), pitch = clamp(Math.atan2(dir.y, horiz) + look.pitch, -1.3, 1.3);
    tmpV.set(dir.x / horiz * Math.cos(pitch), Math.sin(pitch), dir.z / horiz * Math.cos(pitch));
    camera.lookAt(tmpV.add(camPos));
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt; timeU.value = t;
    updateCamera(dt);
    const active = chapterIds[Math.round(cNow)] || 'intro';
    updateBot(dt);
    updateTrashMeshes(t);
    updatePollution(t);
    updateLife(dt);
    stepPool(foamPts, dt, t); stepPool(bubblePts, dt, t);
    swarm.visible = camera.position.distanceTo(SPOT.mosquito) < 45;

    const under = camera.position.y < waveH(camera.position.x, camera.position.z, t);
    if (under !== wasUnder) splash = 1;
    if (under && rnd() < 0.15) emit(bubblePts, camera.position.x + rand(-1.5, 1.5), camera.position.y - rand(0.5, 2), camera.position.z + rand(-1.5, 1.5), 0, rand(0.4, 0.9), 0);
    wasUnder = under;
    splash = Math.max(0, splash - dt * 2.2);
    postU.uSplash.value = splash;
    underU.value = lerp(underU.value, under ? 1 : 0, 1 - Math.exp(-dt * 20));
    const uw = underU.value, shade = hyacinthAt(camera.position.x, camera.position.z);
    fogU.uFogColor.value.copy(FOG_ABOVE).lerp(FOG_BELOW, uw);
    if (uw > 0.5) fogU.uFogColor.value.multiplyScalar(1 - shade * 0.75);
    fogU.uFogDensity.value = lerp(0.0021, 0.07 + shade * 0.05, uw);
    scene.fog.color.copy(fogU.uFogColor.value); scene.fog.density = fogU.uFogDensity.value;
    sun.intensity = lerp(2.4, 1.3 * (1 - shade * 0.8), uw); hemi.intensity = lerp(0.75, 0.75 * (1 - shade * 0.7), uw);
    sky.position.copy(camera.position);
    stage.classList.toggle('is-under', under);
    updateHotspots(active);
    updateHud(active, under);

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
    raf = requestAnimationFrame(frame);
  }

  /* ---------- Build in stages with a real progress bar ---------- */
  const bar = document.getElementById('dive-progress'), loader = document.getElementById('dive-loader');
  const steps = [buildTerrain, buildShore, buildTrash, buildLife, buildBot, buildPollution, buildRoute, prepareCurves];
  resize();
  (function nextStep(i) {
    if (i < steps.length) {
      steps[i]();
      bar.style.width = Math.round(((i + 1) / steps.length) * 100) + '%';
      requestAnimationFrame(function () { nextStep(i + 1); });
      return;
    }
    readScroll(); cNow = cTarget;
    renderer.compile(scene, camera);
    clock.getDelta();
    stage.classList.add('is-ready');
    loader.setAttribute('aria-hidden', 'true');
    raf = requestAnimationFrame(frame);
  })(0);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
    else if (!raf && stage.classList.contains('is-ready')) { clock.getDelta(); raf = requestAnimationFrame(frame); }
  });

  // For automated checks: jump to a chapter instantly
  window.__lakeDive = {
    chapters: function () { return chapterIds.slice(); },
    jump: function (id) { const i = chapterIds.indexOf(id); if (i >= 0) { cTarget = cNow = i; } },
    stats: function () { return { collected: collected, under: wasUnder }; },
    debug: function () { return { bot: [bot.x, bot.y, bot.z, bot.cx, bot.cz].map(function (v) { return +(+v).toFixed(2); }), cam: camera.position.toArray().map(function (v) { return +v.toFixed(2); }), vis: botGroup.visible, inScene: !!botGroup.parent }; },
  };
})();
