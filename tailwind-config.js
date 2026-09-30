/* =====================================================================
   Tailwind CSS configuration (shared by every page)
   ---------------------------------------------------------------------
   Tailwind is loaded from its CDN in each page's <head>. The CDN build
   reads this `tailwind.config` object and creates classes such as
   `bg-panel`, `text-aqua` or `font-display` from it.

   The colours are the original Lake Sentry palette: deep navy water,
   bright aqua, reef teal, mint green, warm sun and coral.

   Colour contrast (WCAG 2.1 AA needs 4.5:1 for normal text). On the
   navy/panel backgrounds:
     txt-1 (white) ... 15:1+     aqua ...... 10:1+     mint ...... 10:1+
     txt-2 ........... 10:1+     sun ....... 9:1+      coral ..... 6:1+
     txt-3 ........... 6.2:1+    reef ...... 6.7:1+
   Dark text (#00232A) on an aqua button ... 10.6:1
   ===================================================================== */

// Safety net: if the Tailwind CDN didn't load (e.g. you're offline), this
// stops the browser showing a "tailwind is not defined" error.
window.tailwind = window.tailwind || {};

tailwind.config = {
  theme: {
    extend: {
      colors: {
        ink: '#040713',       // deepest background
        deep: '#0B1330',      // section background A
        deep2: '#0F1C42',     // section background B
        panel: '#131F42',     // cards
        panel2: '#182548',    // raised cards / dialogs
        aqua: '#38E4F0',      // main accent (links, highlights, buttons)
        reef: '#22C3A6',      // teal accent
        mint: '#3CE8A0',      // "prevent" / success
        sun: '#FFC163',       // warnings, V2 ideas
        coral: '#FF7A8A',     // problems / errors
        surface: '#1E5C94',   // lake surface blue (hero)
        txt: {
          1: '#FBFDFF',       // headings
          2: '#CDD8ED',       // body text
          3: '#96A8CC',       // secondary text
        },
        line: 'rgba(148, 196, 255, 0.16)',   // subtle borders
        linehi: 'rgba(148, 196, 255, 0.34)', // stronger borders
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
