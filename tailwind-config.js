/* =====================================================================
   Tailwind CSS configuration (shared by every page)
   ---------------------------------------------------------------------
   Tailwind is loaded from its CDN in each page's <head>. The CDN build
   reads this `tailwind.config` object and generates the classes you use
   in the HTML (e.g. `bg-lake-900`, `font-display`) on the fly.

   To change the colour palette or fonts across the whole site, edit the
   values below — you do not need to touch the HTML.

   Colour contrast notes (WCAG 2.1 AA needs 4.5:1 for normal text):
   - lake-700 / lake-800 / lake-900 on white ....... 7:1 or better
   - ink (slate-800 style) body text on sand-50 .... 12:1+
   - lake-200 / white text on lake-900 / lake-950 .. 9:1 or better
   - reed-700 on white ............................. 6:1+
   ===================================================================== */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        // Deep lake blues/teals — the primary brand colour
        lake: {
          50: '#EEF7F8',
          100: '#D5ECEF',
          200: '#A9D8DF',
          300: '#76BFCB',
          400: '#3F9FB0',
          500: '#1F8295',
          600: '#156A7C',
          700: '#105565',
          800: '#0C4150',
          900: '#082E3A',
          950: '#041B24',
        },
        // Reed green — used for "prevent", success and nature accents
        reed: {
          50: '#EEF8F0',
          100: '#D5EEDA',
          300: '#86CF98',
          500: '#3C9A55',
          700: '#23693A',
          800: '#1B522D',
        },
        // Warm sand — used for highlights, warnings and "V2" ideas
        sand: {
          50: '#FBF8F1',
          100: '#F5EEDC',
          300: '#EBCB7C',
          400: '#E2B24A',
          700: '#8A5A0B',
          800: '#6D4608',
        },
        // Near-black text colour with a hint of blue
        ink: '#14232B',
      },
      fontFamily: {
        // Headings: Fraunces (a friendly, editorial serif)
        display: ['Fraunces', 'Georgia', 'serif'],
        // Body text: Inter (a very readable sans-serif)
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
};
