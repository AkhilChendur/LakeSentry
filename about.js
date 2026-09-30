/* =====================================================================
   About page — interactive Lake Sentry V1 diagram
   ---------------------------------------------------------------------
   The five buttons (Frame, Buoyancy, Propulsion, Conveyor, Storage)
   highlight that part of the SVG diagram and explain how it works.
   Clicking a part of the diagram does the same thing. The buttons are
   the keyboard- and screen-reader-friendly way in; the diagram clicks
   are a mouse/touch shortcut.
   ===================================================================== */
(function () {
  'use strict';

  const diagram = document.getElementById('v1-diagram');
  const info = document.getElementById('v1-info');
  if (!diagram || !info) return;

  // What each part is and does (from the project summary).
  const PARTS = {
    frame: {
      title: 'Floating frame',
      text: 'The main structure is built from CPVC/PVC pipes. It is the foundation that holds the propulsion, conveyor, storage and electrical systems.',
    },
    buoyancy: {
      title: 'Buoyancy system',
      text: 'Lightweight thermocol provides buoyancy. Because the build is light, the prototype stays afloat while carrying all its components and the collected waste.',
    },
    propulsion: {
      title: 'Propulsion',
      text: 'Two propellers on a PVC shaft, powered by DC motors, let the machine move forward and backward, turn, and head toward floating waste. It is currently controlled by remote.',
    },
    conveyor: {
      title: 'Conveyor belt',
      text: 'A slanted conveyor with a mesh surface catches floating waste and carries it upward into storage. Its rod was modified with extra friction points after the mesh kept slipping.',
    },
    storage: {
      title: 'Storage system',
      text: 'Collected waste drops into a large storage area. Netting around it stops debris falling back into the water while letting excess water drain out.',
    },
  };

  const buttons = document.querySelectorAll('button[data-part]');

  function select(part) {
    const p = PARTS[part];
    if (!p) return;
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.part === part)); });
    diagram.querySelectorAll('.v1-part').forEach(function (g) {
      g.classList.toggle('is-active', g.dataset.part === part);
    });
    diagram.classList.add('has-active');

    // Build the info text safely with textContent.
    info.textContent = '';
    const h = document.createElement('h4');
    h.className = 'font-display text-xl font-bold text-aqua';
    h.textContent = p.title;
    const t = document.createElement('p');
    t.className = 'mt-2';
    t.textContent = p.text;
    info.append(h, t);
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { select(b.dataset.part); });
  });
  diagram.querySelectorAll('.v1-part').forEach(function (g) {
    g.addEventListener('click', function () { select(g.dataset.part); });
  });
})();
