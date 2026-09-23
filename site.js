/* =====================================================================
   Shared JavaScript for every page
   ---------------------------------------------------------------------
   1. Mobile navigation menu (the "hamburger" button on small screens)
   2. Automatically fills in the current year in the footer
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- 1. Mobile menu ---------- */
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');

  if (toggle && menu) {
    function setOpen(open) {
      // aria-expanded tells screen readers whether the menu is open.
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('[data-label]').textContent = open ? 'Close menu' : 'Open menu';
      menu.classList.toggle('hidden', !open);
      menu.classList.toggle('flex', open);
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Escape closes the menu and puts focus back on the button.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    // If the window grows to desktop size, reset the menu state.
    window.matchMedia('(min-width: 768px)').addEventListener('change', function (mq) {
      if (mq.matches) {
        toggle.setAttribute('aria-expanded', 'false');
        menu.classList.add('hidden');
        menu.classList.remove('flex');
      }
    });
  }

  /* ---------- 2. Footer year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
