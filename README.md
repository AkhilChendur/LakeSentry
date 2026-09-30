# Lake Sentry website

A four-page website for **Lake Sentry**, a Hyderabad project that removes and prevents floating trash in urban lakes.

There's nothing to install. Double-click `index.html` to open it in a browser. You need an internet connection, because Tailwind CSS and the Google Fonts load from their CDNs.

## Uploading to GitHub (and Vercel)

**Every file sits in one folder, with no subfolders.** Drag all the files straight into the top level of your GitHub repo (**Add file → Upload files**) and commit. Files with the same name get replaced.

Vercel is connected to the repo, so it redeploys automatically after each commit. `index.html` must be at the top level of the repo, not inside a folder.

## Pages

| File | Page | What's on it |
|---|---|---|
| `index.html` | Home | An interactive lake: ripples follow your cursor, trash floats, fish swim away from you, lily pads and reeds sway, and a mini Lake Sentry robot collects trash. Plus the Prevent/Remove/Connect plan, count-up statistics and the awareness funnel |
| `about.html` | About | What it does, the problem, the research (Hussain Sagar timeline, interview notes), an interactive V1 diagram, the engineering iteration, V2, the awareness campaign, the LakeSentry.in platform, stakeholders, impact targets, risks, feasibility, SDGs, the team and sources |
| `app.html` | Lake Explorer App | Four tools in tabs: **Lake stories** (share posts and photos), **Initiatives** (submit a clean-up effort), the **Lake map** with lake pages, and the **V1 simulator** |
| `admin.html` | Admin panel | For the Lake Sentry team. Review, approve, reject, unpublish or delete initiatives and lake stories. Open it with the 🔒 **Admin** button in the top-left of any page |
| `get-involved.html` | Get involved | “Answer the survey” button (opens the Google Form), animated survey results (headline and detailed), feedback themes, six actions and partner information |

## Files

| File | What it does |
|---|---|
| `tailwind-config.js` | Colour palette and fonts. Edit here to re-theme the whole site |
| `site.css` | Focus rings, skip link and all lake animations (waves, bubbles, ripples, shimmer) |
| `site.js` | Mobile menu, scroll progress bar, reveal-on-scroll, count-up numbers, waves, bubbles and click ripples |
| `lake-hero.js` | The home page lake animation |
| `about.js` | The interactive V1 diagram |
| `lakes-data.js` | **All lake information.** Edit this to add lakes, research, field notes and photos |
| `lake-map.js`, `bot-sim.js`, `initiatives.js`, `posts.js` | The four App-page tools |
| `tabs.js` | The tool tabs on the App page and admin panel |
| `store.js`, `cards.js` | Where submissions are saved, and how they're drawn (shared by the App page and admin panel) |
| `admin-auth.js`, `admin.js` | The admin login (including the password) and the admin panel |
| `v1-prototype.png`, `the-rollers.png` | Photos of the V1 prototype and “The Rollers” |
| `placeholder.svg`, `favicon.svg` | The image placeholder and the browser-tab icon |

## Admin login

Click the 🔒 **Admin** button in the top-left corner of any page.

- **Default password:** `LakeSentry@2026`. Change it: log in, open **Settings**, type a new password, then paste the line it gives you into `admin-auth.js` in place of the `PASSWORD_HASH` line.
- Submissions only appear on the public site after you approve them.
- **Important:** without a server, the password check happens in the visitor's browser. It keeps casual visitors out of the review screens, but it isn't real security. Also, each browser keeps its own submissions, so the admin panel only shows the submissions made in the browser it's opened in. Connecting an online database and login service (such as Firebase or Supabase) fixes both.

## Adding your own photos

Every spot waiting for a photo uses `placeholder.svg`, with an `<!-- IMAGE PLACEHOLDER -->` comment above it. To add a photo:

1. Upload your photo next to the other files (for example `field-visit-1.jpg`).
2. Change `src="placeholder.svg"` to `src="field-visit-1.jpg"`.
3. Rewrite the `alt="..."` text to describe what the photo shows.

Lake photos are set in `lakes-data.js` through each lake's `photo` and `photoAlt` fields.

## Changing the survey link

The survey opens a Google Form. To use a different form, search the `.html` files for `docs.google.com/forms` and replace every link.

## Things still to fill in

Search the files for `TODO`:

- Instagram and LinkedIn links (the footer on every page)
- a partner contact email (`get-involved.html`)
- field notes and research for each lake (`lakes-data.js`)

## Accessibility (WCAG 2.1 AA)

- Every text colour has at least 4.5:1 contrast on its background, and most are 10:1 or better.
- A thick yellow focus ring appears on everything you can Tab to, and there's a "Skip to main content" link.
- Everything works with a keyboard, including the lake map (Tab + Enter), the V1 diagram and the simulator (arrow keys).
- Every image has alt text. Decorative animations are hidden from screen readers.
- The home animation has a Pause button. When a device asks for reduced motion, the lake moves more calmly and the other decorative animations stop.
- The pages were checked with the axe accessibility checker, which found no WCAG 2.1 A/AA violations.

## Note on the demo data

The initiative network and Lake stories save submissions (including photos) in the visitor's own browser (`localStorage`), so they work without a server. That means each visitor only sees their own posts. Photos are shrunk to at most 1000 px before saving. To let everyone see everyone's posts, the site needs a small online database. In `posts.js`, only the `load()` and `save()` functions would change.
