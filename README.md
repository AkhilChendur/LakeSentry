# Lake Sentry website

A four-page website for **Lake Sentry**, a Hyderabad project that removes and prevents floating trash in urban lakes.

There's nothing to install. **Double-click `index.html`** to open it in your browser. You need an internet connection, because Tailwind CSS and the Google Fonts load from their CDNs.

## Pages

| File | Page | What's on it |
|---|---|---|
| `index.html` | Home | Project name, one-line description, and an interactive lake: move the cursor to make ripples, click to splash, and watch a mini Lake Sentry collect floating trash |
| `about.html` | About | What the project does, the problem, the research, V1 and V2, awareness, who it's for, the SDGs, the team and sources |
| `app.html` | Lake Explorer App | Three working tools: an interactive lake map with lake pages, a V1 robot simulator, and the Submit → Review → Approve → Publish initiative network |
| `get-involved.html` | Get involved | Survey QR code, survey highlights, ways to take action, and partner information |

## Folder layout

```
lake-sentry/
├── index.html, about.html, app.html, get-involved.html
└── assets/
    ├── css/site.css             focus rings, skip link, reduced-motion rules
    ├── js/tailwind-config.js    colour palette + fonts (edit here to re-theme the site)
    ├── js/site.js               mobile menu + footer year (used on every page)
    ├── js/lake-hero.js          Home page ripple/trash animation
    ├── js/lakes-data.js         ALL lake information (edit this to add lakes, research and photos)
    ├── js/lake-map.js           App page, tool 1: the lake map
    ├── js/bot-sim.js            App page, tool 2: the V1 simulator
    ├── js/initiatives.js        App page, tool 3: the initiative network
    └── images/                  photos, survey QR code, placeholder.svg
```

## Adding your own photos

Every spot waiting for a photo uses `assets/images/placeholder.svg` and has a comment such as `<!-- IMAGE PLACEHOLDER -->` above it. To add a photo:

1. Put your photo in `assets/images/` (for example `field-visit-1.jpg`).
2. Change the `<img src="...">` to point at it.
3. Rewrite the `alt="..."` text so it describes what the photo shows.

Lake photos are set in `assets/js/lakes-data.js` through each lake's `photo` and `photoAlt` fields.

## Things marked TODO

Search the files for `TODO` to find what still needs your input:

- the direct survey link (`get-involved.html`)
- Instagram / LinkedIn links (the footer on each page)
- a partner contact email (`get-involved.html`)
- field notes and research for each lake (`assets/js/lakes-data.js`)

## Accessibility (WCAG 2.1 AA)

- Colour contrast is checked: body text is 7:1 or better, and all text is at least 4.5:1.
- A visible focus ring appears on every link, button and form field, and a "Skip to main content" link is included.
- Everything works with the keyboard, including the lake map (Tab + Enter) and the simulator (arrow keys).
- Every image has alt text. Decorative graphics are hidden from screen readers.
- The home animation has a Pause button and stays still if your device asks for reduced motion.
- Form errors are listed in a summary and linked to their fields. Status messages are announced to screen readers.

The pages were checked with the axe accessibility checker, which found no WCAG 2.1 A/AA violations.

## Note on the demo data

The initiative network saves submissions in your browser's `localStorage`, so it runs without a server. Anything you submit stays on your own computer. Use **Reset demo data** on the App page to start again.
