/* =====================================================================
   Admin login (loaded on every page)
   ---------------------------------------------------------------------
   - The lock button in the top-left of the header (#admin-btn) opens a
     login box. After a correct password you're taken to admin.html.
   - Once logged in, the button changes to "Admin panel".
   - Being logged in lasts until the browser tab is closed.

   Changing the password:
     Log in, open Admin panel → Settings, type a new password, and it
     gives you a new PASSWORD_HASH line to paste below.

   IMPORTANT: without a server, this check runs in the visitor's own
   browser. It keeps the review screens out of casual visitors' way,
   but it is not real security. Real protection needs an online login
   service (e.g. Firebase or Supabase), which can replace login() below.
   ===================================================================== */
(function () {
  'use strict';

  // SHA-256 "fingerprint" of the admin password (the password itself is
  // never written in the code). Default password: LakeSentry@2026
  const PASSWORD_HASH = 'c13d92050b725acfc43b2b6d28b003f6941620f2f6a444d20defd3b85323d720';
  const SESSION_KEY = 'lakeSentry.admin';

  /* ---------- SHA-256 ---------- */
  // Uses the browser's built-in crypto when it can, otherwise a small
  // plain-JavaScript version (e.g. when the file is opened from disk).
  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    if (window.crypto && crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      } catch (e) { /* fall through to the plain version */ }
    }
    return sha256Plain(bytes);
  }

  function sha256Plain(bytes) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const len = bytes.length;
    const total = Math.ceil((len + 9) / 64) * 64;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[len] = 0x80;
    const bits = len * 8;
    m[total - 4] = (bits >>> 24) & 255; m[total - 3] = (bits >>> 16) & 255;
    m[total - 2] = (bits >>> 8) & 255; m[total - 1] = bits & 255;
    const w = new Array(64);
    const rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return (x >>> 0).toString(16).padStart(8, '0'); }).join('');
  }

  /* ---------- Login state ---------- */
  function isLoggedIn() {
    try { return sessionStorage.getItem(SESSION_KEY) === 'yes'; } catch (e) { return false; }
  }
  async function login(password) {
    const ok = (await sha256(password)) === PASSWORD_HASH;
    if (ok) {
      try { sessionStorage.setItem(SESSION_KEY, 'yes'); } catch (e) { /* ignore */ }
      updateButton();
      document.dispatchEvent(new CustomEvent('lakesentry:admin-changed'));
    }
    return ok;
  }
  function logout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    updateButton();
    document.dispatchEvent(new CustomEvent('lakesentry:admin-changed'));
  }

  window.LakeSentryAdmin = { isLoggedIn: isLoggedIn, login: login, logout: logout, sha256: sha256 };

  /* ---------- Header button ---------- */
  const btn = document.getElementById('admin-btn');
  function updateButton() {
    if (!btn) return;
    const on = isLoggedIn();
    btn.querySelector('[data-admin-label]').textContent = on ? 'Admin panel' : 'Admin';
    btn.classList.toggle('!border-mint', on);
    btn.classList.toggle('!text-mint', on);
    if (on) btn.removeAttribute('aria-haspopup'); else btn.setAttribute('aria-haspopup', 'dialog');
  }

  /* ---------- Login dialog ----------
     A native <dialog>: it traps keyboard focus inside while open, and
     Escape closes it. Built with DOM calls and added to every page. */
  let dialog = null;
  function buildDialog() {
    dialog = document.createElement('dialog');
    dialog.id = 'admin-dialog';
    dialog.setAttribute('aria-labelledby', 'admin-dialog-title');
    dialog.className = 'w-[min(92vw,26rem)] rounded-2xl border border-linehi bg-panel2 p-0 text-txt-2 shadow-2xl backdrop:bg-ink/80 backdrop:backdrop-blur-sm';
    dialog.innerHTML =
      '<form method="dialog" class="p-6 sm:p-8" novalidate>' +
      '  <div class="flex items-start justify-between gap-4">' +
      '    <div>' +
      '      <p class="font-mono text-xs uppercase tracking-wider text-aqua">Lake Sentry team</p>' +
      '      <h2 id="admin-dialog-title" class="mt-1 font-display text-2xl font-bold text-txt-1">Admin login</h2>' +
      '    </div>' +
      '    <button type="button" data-close class="rounded-md border border-line px-2.5 py-1 font-mono text-xs hover:border-aqua hover:text-aqua">Close<span aria-hidden="true"> ✕</span></button>' +
      '  </div>' +
      '  <p class="mt-3 text-sm">Log in to review and approve initiatives and lake stories.</p>' +
      '  <label for="admin-password" class="mt-5 block font-semibold text-txt-1">Password</label>' +
      '  <div class="mt-1 flex gap-2">' +
      '    <input id="admin-password" type="password" autocomplete="current-password" aria-describedby="admin-login-error" class="min-w-0 flex-1 rounded-md border border-txt-3/80 bg-deep px-3 py-2.5 text-txt-1 aria-[invalid=true]:border-2 aria-[invalid=true]:border-coral" />' +
      '    <button type="button" data-show aria-pressed="false" class="rounded-md border border-linehi px-3 text-sm font-semibold text-txt-1 hover:border-aqua">Show</button>' +
      '  </div>' +
      '  <p id="admin-login-error" role="alert" class="mt-2 min-h-[1.25rem] text-sm font-medium text-coral"></p>' +
      '  <button type="submit" class="mt-3 w-full rounded-md bg-aqua px-5 py-3 font-semibold text-onaccent transition hover:-translate-y-0.5">Log in</button>' +
      '</form>';
    document.body.appendChild(dialog);

    const form = dialog.querySelector('form');
    const input = dialog.querySelector('#admin-password');
    const error = dialog.querySelector('#admin-login-error');
    const show = dialog.querySelector('[data-show]');

    show.addEventListener('click', function () {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      show.textContent = visible ? 'Hide' : 'Show';
      show.setAttribute('aria-pressed', String(visible));
      input.focus();
    });
    dialog.querySelector('[data-close]').addEventListener('click', function () { dialog.close(); });
    // Clicking the dark area outside the box closes it too.
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', function () { if (btn) btn.focus(); });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!input.value) {
        error.textContent = 'Enter the admin password.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      if (await login(input.value)) {
        window.location.href = 'admin.html';
      } else {
        error.textContent = 'That password isn’t right. Please try again.';
        input.setAttribute('aria-invalid', 'true');
        input.select();
      }
    });
  }

  if (btn) {
    btn.addEventListener('click', function () {
      if (isLoggedIn()) { window.location.href = 'admin.html'; return; }
      if (!dialog) buildDialog();
      dialog.querySelector('#admin-password').value = '';
      dialog.querySelector('#admin-login-error').textContent = '';
      dialog.querySelector('#admin-password').removeAttribute('aria-invalid');
      dialog.showModal();
      dialog.querySelector('#admin-password').focus();
    });
    updateButton();
  }
})();
