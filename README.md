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
| `about.html` | About | A short page: the three parts of the project, the problem, an interactive V1 diagram, what's next, who it's for, the SDGs and the team. Impact targets, risks, feasibility and sources are in collapsed “More details” boxes |
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
| `v1-prototype.png`, `the-rollers.png`, `team-photo.jpg` | Photos of the V1 prototype, “The Rollers” and the team |
| `404.html` | The page visitors see if a link is broken |
| `logo-blue.png`, `logo-light.png`, `favicon.png`, `apple-touch-icon.png`, `og-image.png` | The logo, browser-tab icon and share preview |
| `placeholder.svg` | The image placeholder |

## Lake reports (Lake Explorer → Lake map)

Click a lake on the map, or in the list, to open its full report: where things stand, recovery figures with sources, ongoing / upcoming / past initiatives, key findings and timeline, field notes, photos, visitor stories, and a list of sources. Every lake has a shareable link, such as `app.html?lake=hussain-sagar#map`.

- **Edit the facts in `lakes-data.js`.** The top of that file explains every field. Add a figure to a lake's `stats` and cite a source from `LAKE_SENTRY_SOURCES`; the source shows next to the figure and in the report's source list. Only add numbers you can cite.
- **Initiatives and stories are automatic.** Anything approved in the Admin panel appears in the right lake's report. An initiative with no date counts as *ongoing*, a future date as *upcoming* and a past date as *past*.
- Lakes with no `lat`/`lon` (Kotha Cheruvu and Barla Kunta for now) are listed next to the map but not drawn on it. Add their coordinates in `lakes-data.js` to put them on the map.
- Map positions are approximate. The map is schematic, not to scale.

## Logo and colours

The logo is in `logo-blue.png` (shown in light mode) and `logo-light.png` (the same logo in a light tint, shown in dark mode). Both have transparent backgrounds. `favicon.png` and `apple-touch-icon.png` are the splash icon, and `og-image.png` is the picture shown when the site is shared. To change the logo, replace those files (keep the names).

The colours are built from the logo's blue, `#00279C`. In light mode it is the main accent, and in dark mode a lighter tint of it. All colours are at the top of `site.css`.

To change how big the mini Lake Sentry robot is on the home-page lake, edit `BOT_SCALE` near the top of `lake-hero.js` (1 is the original small size). The header logo size is the `h-10 ... sm:h-14` classes on the logo images in each page.

## Official maps (Bhuvan)

The map in the Lake Explorer is a simplified drawing, so the site points to the government's official maps for exact lake boundaries and water-spread area: [Bhuvan](https://bhuvan.nrsc.gov.in) (ISRO's National Remote Sensing Centre) and [India WRIS](https://indiawris.gov.in). The links appear under the map, in every lake report, and in the sources. They are listed in `lakes-data.js` (`LAKE_SENTRY_SOURCES` and `LAKE_SENTRY_MAP_SOURCES`).

## Light / dark mode

The ☀/🌙 button in the header switches themes, and the site remembers each visitor's choice. Colours for both themes live at the top of `site.css`: change a colour there and it updates everywhere.

## Hidden for now: survey results and research

The survey results (Get Involved page), the research section (About page) and the survey statistics on the Home page are **hidden, not deleted**, while waiting for the new survey. Search the `.html` files for `HIDDEN FOR NOW`: deleting the word `hidden` on the line below each comment shows that part again.

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
