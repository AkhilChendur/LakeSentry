/* =====================================================================
   Tailwind CSS configuration + light/dark theme (shared by every page)
   ---------------------------------------------------------------------
   Tailwind is loaded from its CDN in each page's <head>. The CDN build
   reads this `tailwind.config` object and creates classes such as
   `bg-panel`, `text-aqua` or `font-display` from it.

   LIGHT / DARK MODE
   Every colour below points to a CSS variable (e.g. --aqua). The actual
   values live in site.css: one set for dark mode and one for light
   mode. Switching theme just swaps the variables, so every page updates
   at once. The toggle button is in the header (site.js).

   Contrast (WCAG 2.1 AA needs 4.5:1 for normal text) is checked for
   both themes: every text colour is at least 4.7:1 on every background.
   ===================================================================== */

// Apply the saved theme straight away (before the page is drawn) so it
// never "flashes" the wrong theme. Default: dark.
(function () {
  let theme = 'dark';
  try { theme = localStorage.getItem('lakeSentry.theme') || 'dark'; } catch (e) { /* storage blocked */ }
  document.documentElement.dataset.theme = theme;
})();

// Safety net: if the Tailwind CDN didn't load (e.g. you're offline), this
// stops the browser showing a "tailwind is not defined" error.
window.tailwind = window.tailwind || {};

// Helper: a colour made from a CSS variable that holds "R G B" numbers,
// so Tailwind's opacity shortcuts (like bg-ink/80) still work.
function themeColour(name) {
  return 'rgb(var(--' + name + ') / <alpha-value>)';
}

tailwind.config = {
  theme: {
    extend: {
      colors: {
        ink: themeColour('ink'),        // page background
        deep: themeColour('deep'),      // section background A
        deep2: themeColour('deep2'),    // section background B
        panel: themeColour('panel'),    // cards
        panel2: themeColour('panel2'),  // raised cards / dialogs
        aqua: themeColour('aqua'),      // main accent (links, buttons)
        reef: themeColour('reef'),      // teal accent
        mint: themeColour('mint'),      // "prevent" / success
        sun: themeColour('sun'),        // warnings, V2 ideas
        coral: themeColour('coral'),    // problems / errors
        onaccent: themeColour('onaccent'), // text on aqua/mint/sun buttons
        surface: '#1E5C94',             // lake surface blue (same in both themes)
        txt: {
          1: themeColour('txt1'),       // headings
          2: themeColour('txt2'),       // body text
          3: themeColour('txt3'),       // secondary text
        },
        line: 'var(--line)',            // subtle borders
        linehi: 'var(--linehi)',        // stronger borders
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'], // headings
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'], // body
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'], // labels & numbers
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
};
