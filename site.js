/* =====================================================================
   Shared JavaScript for every page
   ---------------------------------------------------------------------
   1. Mobile navigation menu
   2. Footer year
   3. Scroll progress bar
   4. Reveal-on-scroll, animated number counters and survey bars
   5. Animated waves between sections   (<div data-wave="#0B1330">)
   6. Rising bubbles                    (<div data-bubbles="12">)
   7. Ripple rings where you click
   Everything decorative switches off if the visitor's device asks
   for reduced motion.
   ===================================================================== */
(function () {
  'use strict';

  document.documentElement.classList.remove('no-js');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Mobile menu ---------- */
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');
  if (toggle && menu) {
    const setOpen = function (open) {
      // aria-expanded tells screen readers whether the menu is open.
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('[data-label]').textContent = open ? 'Close menu' : 'Open menu';
      menu.classList.toggle('hidden', !open);
      menu.classList.toggle('flex', open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    // Escape closes the menu and returns focus to the button.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    // Reset the menu if the window grows to desktop size.
    const desktop = window.matchMedia('(min-width: 768px)');
    const onChange = function () {
      if (desktop.matches) {
        toggle.setAttribute('aria-expanded', 'false');
        menu.classList.add('hidden');
        menu.classList.remove('flex');
      }
    };
    // (older Safari only supports addListener)
    if (desktop.addEventListener) desktop.addEventListener('change', onChange);
    else if (desktop.addListener) desktop.addListener(onChange);
  }

  /* ---------- 2. Footer year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- 3. Scroll progress bar ---------- */
  const progress = document.getElementById('scroll-progress');
  if (progress) {
    const update = function () {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ---------- 4. Reveal on scroll + counters + bars ---------- */
  // Count a number up from 0, e.g. <span data-count="87.5" data-suffix="%">87.5%</span>
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = (el.dataset.count.split('.')[1] || '').length;
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const start = performance.now();
    const duration = 1600;
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function activate(el) {
    el.classList.add('is-visible');
    if (el.dataset.count && !reduceMotion) countUp(el);
    if (el.dataset.bar) el.style.width = el.dataset.bar + '%';
    el.querySelectorAll('[data-count]').forEach(function (c) { if (!reduceMotion) countUp(c); });
    el.querySelectorAll('[data-bar]').forEach(function (b) { b.style.width = b.dataset.bar + '%'; });
  }

  const watched = document.querySelectorAll('.reveal, [data-count], [data-bar]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          activate(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    watched.forEach(function (el) { io.observe(el); });

    // Backup: if the visitor jumps down quickly (or follows a #link), some
    // elements can be skipped over without ever "intersecting". Reveal
    // anything that is already above the bottom of the screen.
    let ticking = false;
    const catchUp = function () {
      ticking = false;
      watched.forEach(function (el) {
        if (!el.classList.contains('is-visible') && el.getBoundingClientRect().top < window.innerHeight) {
          activate(el);
          io.unobserve(el);
        }
      });
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; setTimeout(catchUp, 200); }
    }, { passive: true });
    window.addEventListener('load', catchUp);
  } else {
    watched.forEach(function (el) {
      el.classList.add('is-visible');
      if (el.dataset.bar) el.style.width = el.dataset.bar + '%';
    });
  }

  /* ---------- 5. Animated wave dividers ---------- */
  // A smooth repeating wave, 2880 units wide (two copies of the same
  // 1440-wide wave), so sliding it left by half loops seamlessly.
  function wavePath(amp, offset) {
    const y = 40 + offset;
    // First curve sets the shape; each "T" continues it smoothly,
    // alternating crest and trough every 360 units.
    let d = 'M0 ' + y + ' Q180 ' + (y - amp) + ' 360 ' + y;
    for (let x = 720; x <= 2880; x += 360) d += ' T' + x + ' ' + y;
    return d + ' V80 H0 Z';
  }
  document.querySelectorAll('[data-wave]').forEach(function (host) {
    const colour = host.dataset.wave;
    const div = document.createElement('div');
    div.className = 'wave-divider';
    div.setAttribute('aria-hidden', 'true');
    div.innerHTML =
      '<svg class="wave-back" viewBox="0 0 2880 80" preserveAspectRatio="none"><path fill="' + colour + '" d="' + wavePath(18, 0) + '"/></svg>' +
      '<svg class="wave-front" viewBox="0 0 2880 80" preserveAspectRatio="none"><path fill="' + colour + '" d="' + wavePath(12, 14) + '"/></svg>';
    host.appendChild(div);
  });

  /* ---------- 6. Rising bubbles ---------- */
  if (!reduceMotion) {
    document.querySelectorAll('[data-bubbles]').forEach(function (host) {
      const n = parseInt(host.dataset.bubbles, 10) || 10;
      for (let i = 0; i < n; i++) {
        const b = document.createElement('span');
        b.className = 'bubble';
        b.setAttribute('aria-hidden', 'true');
        const size = 5 + Math.random() * 14;
        b.style.width = b.style.height = size + 'px';
        b.style.left = Math.random() * 100 + '%';
        b.style.animationDuration = 9 + Math.random() * 12 + 's';
        b.style.animationDelay = -Math.random() * 20 + 's';
        host.appendChild(b);
      }
    });
  }

  /* ---------- 7. Ripple rings where you click ---------- */
  if (!reduceMotion) {
    document.addEventListener('pointerdown', function (e) {
      // The home-page lake and the simulator make their own ripples.
      if (e.target.closest('#hero, #sim-stage, input, textarea, select')) return;
      [false, true].forEach(function (second) {
        const r = document.createElement('span');
        r.className = 'click-ripple' + (second ? ' second' : '');
        r.style.left = e.clientX + 'px';
        r.style.top = e.clientY + 'px';
        r.setAttribute('aria-hidden', 'true');
        document.body.appendChild(r);
        setTimeout(function () { r.remove(); }, 1200);
      });
    });
  }
})();
