/* =====================================================================
   App page — Tool 4: Lake stories (community posts with photos)
   ---------------------------------------------------------------------
   Visitors can write a post about a lake and attach up to 3 photos.

   Like the initiative network, posts are reviewed before they appear:

       Post  ->  Review  ->  Approve / Reject  ->  Published

   How photos work:
     - The visitor picks photos from their device.
     - Each photo is shrunk in the browser (to at most 1000 px wide/tall)
       so it loads quickly and doesn't use much storage.
     - Every photo needs a short description (alt text) so people who
       use screen readers know what it shows.

   Where is the data stored?
   This site has no server yet, so posts and photos are saved in the
   visitor's own browser (localStorage). They survive a page refresh,
   but only that visitor sees them. To share posts with everyone, the
   `save()`/`load()` functions below would be swapped for calls to a
   small online database; nothing else on the page needs to change.

   Security: everything visitors type is inserted with `textContent`
   (never `innerHTML`), and photos are re-drawn through a <canvas>, so
   nobody can sneak code into the page.
   ===================================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'lakeSentry.posts.v1';
  const MAX_PHOTOS = 3;
  const MAX_SIDE = 1000;       // longest side of a resized photo, in pixels
  const JPEG_QUALITY = 0.78;
  const lakes = window.LAKE_SENTRY_LAKES || [];

  const SAMPLES = [
    {
      id: 'post-sample-1', sample: true, status: 'approved',
      author: 'Lake Sentry team', lake: 'hussain-sagar',
      title: 'Example: what a lake story looks like',
      text: 'This is a sample post. Share what you notice at a lake: floating waste, wildlife, a clean-up you joined, or an idea to keep it clean. Posts are reviewed before they appear here.',
      photos: [], likes: 3, liked: false,
      postedAt: Date.now() - 86400000 * 3, reviewedAt: Date.now() - 86400000 * 2,
    },
  ];

  /* ---------- Saving and loading ---------- */
  let items = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage blocked: start with the samples */ }
    return SAMPLES.map(function (s) { return Object.assign({}, s); });
  }
  // Returns false if the browser's storage is full (photos take space).
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (e) {
      return false;
    } finally {
      document.dispatchEvent(new CustomEvent('lakesentry:posts-changed'));
    }
  }

  // Used by lake-map.js to show a lake's posts on its lake page.
  window.LakeSentryPosts = {
    approvedFor: function (lakeId) {
      return items.filter(function (p) { return p.status === 'approved' && p.lake === lakeId; });
    },
  };

  function lakeName(id) {
    const lake = lakes.find(function (l) { return l.id === id; });
    return lake ? lake.name : 'Other lake';
  }

  /* ---------- Page elements ---------- */
  const $ = function (id) { return document.getElementById(id); };
  const form = $('post-form');
  if (!form) return;
  const fileInput = $('post-photos');
  const previews = $('post-previews');
  const errorSummary = $('post-errors');
  const successMsg = $('post-success');
  const announcer = $('post-status');
  const queueList = $('post-queue');
  const queueEmpty = $('post-queue-empty');
  const queueCount = $('post-queue-count');
  const feed = $('post-feed');
  const feedEmpty = $('post-feed-empty');
  const filterSelect = $('post-filter');

  // Fill the lake drop-downs.
  function fillLakes(select, firstLabel) {
    const first = document.createElement('option');
    first.value = ''; first.textContent = firstLabel;
    select.appendChild(first);
    lakes.forEach(function (l) {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = l.name;
      select.appendChild(o);
    });
    const other = document.createElement('option');
    other.value = 'other'; other.textContent = 'Other lake';
    select.appendChild(other);
  }
  fillLakes($('post-lake'), 'Choose a lake…');
  fillLakes(filterSelect, 'All lakes');

  /* ---------- Choosing and resizing photos ---------- */
  // Photos waiting to be posted: { dataUrl, alt }
  let pending = [];

  function resizePhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error(file.name + ' is not an image.')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; // (transparent PNGs get a white background)
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(file.name + ' could not be opened.')); };
      img.src = url;
    });
  }

  fileInput.addEventListener('change', async function () {
    const files = Array.prototype.slice.call(fileInput.files || []);
    fileInput.value = ''; // so the same file can be picked again later
    const room = MAX_PHOTOS - pending.length;
    if (files.length > room) {
      announce('You can add up to ' + MAX_PHOTOS + ' photos. Only the first ' + Math.max(room, 0) + ' were added.');
    }
    for (const file of files.slice(0, Math.max(room, 0))) {
      try {
        pending.push({ dataUrl: await resizePhoto(file), alt: '' });
      } catch (err) {
        announce(err.message);
      }
    }
    renderPreviews();
  });

  // Thumbnails of chosen photos, each with a description box and a Remove button.
  function renderPreviews() {
    previews.textContent = '';
    pending.forEach(function (ph, i) {
      const li = document.createElement('li');
      li.className = 'flex gap-3 rounded-lg border border-line bg-deep p-3';
      const img = document.createElement('img');
      img.src = ph.dataUrl;
      img.alt = ''; // the description box next to it describes the photo
      img.className = 'h-20 w-20 flex-none rounded-md object-cover';
      const box = document.createElement('div');
      box.className = 'min-w-0 flex-1';
      const id = 'post-photo-alt-' + i;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.className = 'block text-sm font-semibold text-txt-1';
      label.textContent = 'Describe photo ' + (i + 1) + ' (required)';
      const input = document.createElement('input');
      input.id = id; input.type = 'text'; input.value = ph.alt;
      input.placeholder = 'e.g. Plastic bottles caught in reeds near the shore';
      input.setAttribute('aria-describedby', id + '-error');
      input.className = 'mt-1 w-full rounded-md border border-txt-3/80 bg-ink px-3 py-2 text-sm text-txt-1 aria-[invalid=true]:border-2 aria-[invalid=true]:border-coral';
      input.addEventListener('input', function () {
        ph.alt = input.value;
        if (input.value.trim()) { input.removeAttribute('aria-invalid'); err.hidden = true; }
      });
      const err = document.createElement('p');
      err.id = id + '-error'; err.hidden = true;
      err.className = 'mt-1 text-sm font-medium text-coral';
      err.textContent = 'Describe what this photo shows.';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mt-2 text-sm font-semibold text-coral underline underline-offset-4';
      remove.textContent = 'Remove photo ' + (i + 1);
      remove.addEventListener('click', function () {
        pending.splice(i, 1);
        renderPreviews();
        announce('Photo removed.');
        fileInput.focus();
      });
      box.append(label, input, err, remove);
      li.append(img, box);
      previews.appendChild(li);
    });
    $('post-photo-count').textContent = pending.length + ' of ' + MAX_PHOTOS + ' photos added';
  }

  /* ---------- Validation + submitting ---------- */
  const RULES = {
    'post-lake': function (v) { return v ? '' : 'Choose the lake your post is about.'; },
    'post-title': function (v) { return v.length >= 3 ? '' : 'Give your post a title (at least 3 characters).'; },
    'post-text': function (v) {
      if (!v) return 'Write something about the lake.';
      return v.length >= 10 ? '' : 'Your post must be at least 10 characters (you have ' + v.length + ').';
    },
    'post-consent': function (v, el) { return el.checked ? '' : 'Confirm that you can share these photos and that they follow the guidelines.'; },
  };

  function setFieldError(id, msg) {
    const el = $(id);
    const err = $(id + '-error');
    if (msg) { el.setAttribute('aria-invalid', 'true'); err.textContent = msg; err.hidden = false; }
    else { el.removeAttribute('aria-invalid'); err.textContent = ''; err.hidden = true; }
  }
  // Clear an error as soon as the visitor fixes it.
  Object.keys(RULES).forEach(function (id) {
    $(id).addEventListener(id === 'post-consent' ? 'change' : 'input', function (e) {
      if (e.target.getAttribute('aria-invalid') === 'true') setFieldError(id, RULES[id](e.target.value.trim(), e.target));
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    successMsg.hidden = true;
    const problems = [];
    Object.keys(RULES).forEach(function (id) {
      const msg = RULES[id]($(id).value.trim(), $(id));
      setFieldError(id, msg);
      if (msg) problems.push({ id: id, msg: msg });
    });
    // Every photo needs a description.
    pending.forEach(function (ph, i) {
      const input = $('post-photo-alt-' + i);
      if (!ph.alt.trim()) {
        input.setAttribute('aria-invalid', 'true');
        $('post-photo-alt-' + i + '-error').hidden = false;
        problems.push({ id: 'post-photo-alt-' + i, msg: 'Describe photo ' + (i + 1) + '.' });
      }
    });

    if (problems.length) {
      const list = errorSummary.querySelector('ul');
      list.textContent = '';
      problems.forEach(function (p) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + p.id;
        a.className = 'text-coral underline underline-offset-4';
        a.textContent = p.msg;
        a.addEventListener('click', function (ev) { ev.preventDefault(); $(p.id).focus(); });
        li.appendChild(a);
        list.appendChild(li);
      });
      errorSummary.hidden = false;
      errorSummary.focus();
      return;
    }
    errorSummary.hidden = true;

    const post = {
      id: 'post-' + Date.now(),
      sample: false, status: 'pending',
      author: $('post-author').value.trim() || 'Anonymous',
      lake: $('post-lake').value,
      title: $('post-title').value.trim(),
      text: $('post-text').value.trim(),
      photos: pending.map(function (p) { return { src: p.dataUrl, alt: p.alt.trim() }; }),
      likes: 0, liked: false,
      postedAt: Date.now(), reviewedAt: null,
    };
    items.push(post);
    if (!save()) {
      // Not enough browser storage: undo and tell the visitor.
      items.pop();
      save();
      announce('');
      const list = errorSummary.querySelector('ul');
      list.textContent = '';
      const li = document.createElement('li');
      li.textContent = 'Your browser ran out of space to store photos. Try fewer photos, or remove some older posts.';
      list.appendChild(li);
      errorSummary.hidden = false;
      errorSummary.focus();
      return;
    }
    form.reset();
    pending = [];
    renderPreviews();
    render();
    successMsg.hidden = false;
    successMsg.focus();
  });

  /* ---------- Showing posts ---------- */
  function announce(msg) { announcer.textContent = msg; }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function postCard(p, withReview) {
    const li = document.createElement('li');
    li.className = 'glow-card overflow-hidden rounded-2xl border border-line bg-panel';

    // Photos: one big photo, or a grid if there are several.
    if (p.photos.length) {
      const gallery = document.createElement('div');
      gallery.className = 'grid gap-0.5 bg-deep ' + (p.photos.length > 1 ? 'grid-cols-2' : '');
      p.photos.forEach(function (ph, i) {
        const img = document.createElement('img');
        img.src = ph.src;
        img.alt = ph.alt;
        img.loading = 'lazy';
        img.className = 'w-full object-cover ' + (p.photos.length === 3 && i === 0 ? 'col-span-2 aspect-[2/1]' : 'aspect-[4/3]');
        gallery.appendChild(img);
      });
      li.appendChild(gallery);
    }

    const body = document.createElement('div');
    body.className = 'p-5';
    const tags = document.createElement('p');
    tags.className = 'flex flex-wrap gap-2 font-mono text-xs';
    const lake = document.createElement('span');
    lake.className = 'rounded-full border border-aqua/50 px-3 py-1 text-aqua';
    lake.textContent = '📍 ' + lakeName(p.lake);
    tags.appendChild(lake);
    if (p.status === 'approved') {
      const ok = document.createElement('span');
      ok.className = 'rounded-full border border-mint/50 px-3 py-1 text-mint';
      ok.textContent = '✓ Reviewed';
      tags.appendChild(ok);
    }
    if (p.sample) {
      const s = document.createElement('span');
      s.className = 'rounded-full border border-sun/50 px-3 py-1 text-sun';
      s.textContent = 'Sample';
      tags.appendChild(s);
    }
    const h = document.createElement('h4');
    h.className = 'mt-3 font-display text-xl font-bold text-txt-1';
    h.textContent = p.title;
    const meta = document.createElement('p');
    meta.className = 'mt-1 font-mono text-xs text-txt-3';
    meta.textContent = 'By ' + p.author + ' · ' + formatDate(p.postedAt);
    const text = document.createElement('p');
    text.className = 'mt-3 whitespace-pre-line';
    text.textContent = p.text;
    body.append(tags, h, meta, text);

    const row = document.createElement('div');
    row.className = 'mt-4 flex flex-wrap items-center gap-2';
    if (withReview) {
      row.appendChild(button('Approve', 'bg-mint text-[#00251A] hover:-translate-y-0.5', 'Approve post: ' + p.title, function () { review(p.id, 'approved'); }));
      row.appendChild(button('Reject', 'border border-coral/70 text-coral hover:bg-coral/10', 'Reject post: ' + p.title, function () { review(p.id, 'rejected'); }));
    } else {
      // A simple "helpful" button (saved in this browser).
      const like = button((p.liked ? '💙 ' : '🤍 ') + p.likes + ' found this helpful', 'border border-linehi text-txt-1 hover:border-aqua', null, function () {
        p.liked = !p.liked;
        p.likes += p.liked ? 1 : -1;
        save();
        render();
        const again = feed.querySelector('[data-like="' + p.id + '"]');
        if (again) again.focus();
      });
      like.setAttribute('aria-pressed', String(!!p.liked));
      like.dataset.like = p.id;
      row.appendChild(like);
    }
    body.appendChild(row);
    li.appendChild(body);
    return li;
  }

  function button(label, classes, ariaLabel, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rounded-md px-4 py-2 text-sm font-semibold transition ' + classes;
    b.textContent = label;
    if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
    b.addEventListener('click', onClick);
    return b;
  }

  function review(id, status) {
    const p = items.find(function (x) { return x.id === id; });
    if (!p) return;
    p.status = status;
    p.reviewedAt = Date.now();
    save();
    render();
    announce('“' + p.title + '” was ' + (status === 'approved' ? 'approved and published.' : 'rejected and will not be published.'));
    const next = queueList.querySelector('button');
    (next || $('post-queue-title')).focus();
  }

  function render() {
    const pendingPosts = items.filter(function (p) { return p.status === 'pending'; });
    queueList.textContent = '';
    pendingPosts.forEach(function (p) { queueList.appendChild(postCard(p, true)); });
    queueEmpty.hidden = pendingPosts.length > 0;
    queueCount.textContent = String(pendingPosts.length);

    const filter = filterSelect.value;
    const published = items
      .filter(function (p) { return p.status === 'approved' && (!filter || p.lake === filter); })
      .sort(function (a, b) { return b.postedAt - a.postedAt; });
    feed.textContent = '';
    published.forEach(function (p) { feed.appendChild(postCard(p, false)); });
    feedEmpty.hidden = published.length > 0;
  }

  filterSelect.addEventListener('change', render);

  // The lake page's "see posts" link filters the feed to that lake.
  document.addEventListener('lakesentry:show-posts', function (e) {
    filterSelect.value = e.detail.lake;
    $('post-lake').value = e.detail.lake;
    render();
  });

  $('post-reset').addEventListener('click', function () {
    if (!window.confirm('Delete all posts saved in this browser and restore the sample?')) return;
    items = SAMPLES.map(function (s) { return Object.assign({}, s); });
    save();
    render();
    announce('Posts reset.');
  });

  renderPreviews();
  render();
})();
