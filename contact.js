/* =====================================================================
   "Contact me" form (me.html)
   ---------------------------------------------------------------------
   Saves each message through store.js so it appears in the Admin panel's
   Messages tab. If CONTACT_ENDPOINT in store.js is filled in, the message
   is also sent there (e.g. Formspree) so it reaches the admins' email
   from any visitor's device.
   ===================================================================== */
(function () {
  'use strict';
  const form = document.getElementById('contact-form');
  if (!form) return;
  const store = window.LakeSentryStore;
  const errBox = document.getElementById('contact-errors');
  const status = document.getElementById('contact-status');
  const fields = ['c-name', 'c-email', 'c-message'].map(function (id) { return document.getElementById(id); });

  fields.forEach(function (f) {
    f.addEventListener('input', function () { f.removeAttribute('aria-invalid'); });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.textContent = '';
    if (document.getElementById('c-website').value) return; // spam bot
    const name = fields[0].value.trim(), email = fields[1].value.trim(), message = fields[2].value.trim();
    const problems = [];
    if (!name) problems.push([fields[0], 'Enter your name.']);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push([fields[1], 'Enter a valid email address so I can reply.']);
    if (message.length < 5) problems.push([fields[2], 'Write a short message.']);
    if (problems.length) {
      errBox.hidden = false;
      errBox.innerHTML = '';
      const p = document.createElement('p'); p.className = 'font-semibold'; p.textContent = 'Please fix the following:'; errBox.appendChild(p);
      const ul = document.createElement('ul'); ul.className = 'mt-1 list-disc pl-5';
      problems.forEach(function (x) {
        x[0].setAttribute('aria-invalid', 'true');
        const li = document.createElement('li'); li.textContent = x[1]; ul.appendChild(li);
      });
      errBox.appendChild(ul);
      errBox.focus();
      return;
    }
    errBox.hidden = true;
    const item = { id: 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1e4), name: name, email: email, message: message, sentAt: Date.now(), read: false };
    store.add('messages', item);
    if (store.contactEndpoint) {
      fetch(store.contactEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: name, email: email, message: message }),
      }).catch(function () { /* the copy saved in this browser still exists */ });
    }
    form.reset();
    status.textContent = 'Thank you, ' + name + '! Your message was sent.';
  });
})();
