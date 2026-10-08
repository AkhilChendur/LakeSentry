/* =====================================================================
   Lake data for the Lake Explorer (lake map + lake reports)
   ---------------------------------------------------------------------
   This is the ONE place to edit lake information. Clicking a lake on
   the map opens a full "lake report" built from the fields below, plus
   live data from the site (published initiatives and visitor stories).

   HOW TO ADD A FIGURE:  put it in a lake's `stats` list and point its
   `source` at an entry in LAKE_SENTRY_SOURCES (below). Every figure
   shows its source, so only add numbers you can cite.

   Anything marked "TODO" is shown to visitors as "To be added".

   ---- Fields of each lake ------------------------------------------
   id, name, area         short id, display name, locality
   lat, lon, size         map position (leave lat/lon out for lakes that
                          have no confirmed position: they are listed
                          next to the map but not drawn on it)
   labelDx, labelDy       nudges the map label so labels don't overlap
   positionUnknown        true = the map position is only a guess (drawn
                          with a dashed outline)
   status                 'documented' (we hold data on it) or 'listed'
   updated                date this report was last edited (YYYY-MM-DD)
   photo, photoAlt        main photo (placeholder until you add one)
   gallery                more photos: [{ src, alt, caption }]
   summary                2-3 sentences: where things stand today
   about, research        description, and pollution research
   observations           Lake Sentry field notes
   perspective            how Lake Sentry could help
   facts                  [{ label, value, source }]  quick facts
   stats                  [{ group, value, unit, label, note, source }]
                            group: 'recovered' (waste removed) or
                                   'pollution' (pollution load)
   findings               [{ text, source }]  qualitative findings
   timeline               [{ when, title, text, source }]
   initiatives            [{ name, organization, timing, date,
                             description, link, source }]
                            timing: 'ongoing', 'upcoming' or 'past'
   (Initiatives submitted by visitors and approved in the Admin panel
    are added automatically; you don't need to list those here.)
   ===================================================================== */

/* ---------- Sources: cite these by id ---------- */
window.LAKE_SENTRY_SOURCES = {
  'wiki-hussain-sagar': {
    name: 'Hussain Sagar (Wikipedia)',
    url: 'https://en.wikipedia.org/wiki/Hussain_Sagar',
  },
  'dhruvansh': {
    name: 'Clean-up drive data, Dhruvansh Foundation (this year)',
  },
  'sciencedirect-lake-pollution': {
    name: 'Lake Pollution (ScienceDirect Topics)',
    url: 'https://www.sciencedirect.com/topics/earth-and-planetary-sciences/lake-pollution',
  },
  'lakesentry-deck': {
    name: 'Lake Sentry exhibition presentation (problem and research slides)',
  },
  'keystone-visits': {
    name: 'Site visits and photographs by Keystone International School students',
  },
  'bhuvan-water-bodies': {
    name: 'Bhuvan (ISRO, National Remote Sensing Centre): Water Resources, including the Water Bodies Information System',
    url: 'https://www.nrsc.gov.in/nrscnew/Services_Bhuvan_WaterResources.php',
  },
  'bhuvan': {
    name: 'Bhuvan geoportal (ISRO, National Remote Sensing Centre)',
    url: 'https://bhuvan.nrsc.gov.in',
  },
  'india-wris': {
    name: 'India WRIS: Water Resources Information System of India',
    url: 'https://indiawris.gov.in',
  },
  'sandrp': {
    name: 'SANDRP, 17 Feb 2026: “Hyderabad Lakes 2025: Degradation Continues Amid HYDRAA Efforts”',
  },
  'toi': {
    name: 'Times of India, 5 June 2025: “Hyderabad staring at a mounting plastic pollution crisis”',
  },
};

/* Reading about Hyderabad's lakes in general (shown on every report). */
window.LAKE_SENTRY_FURTHER_READING = ['sandrp', 'toi'];

/* Official government maps where exact lake boundaries, positions and
   satellite-measured water-spread area can be checked. Lake Sentry's own
   map is a simplified drawing, so every report points to these. */
window.LAKE_SENTRY_MAP_SOURCES = ['bhuvan-water-bodies', 'bhuvan', 'india-wris'];

window.LAKE_SENTRY_LAKES = [
  {
    id: 'hussain-sagar',
    name: 'Hussain Sagar',
    area: 'Central Hyderabad (between Hyderabad and Secunderabad)',
    lat: 17.4239, lon: 78.4738, size: 2.4, labelDx: 0, labelDy: 46,
    status: 'documented',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a photo of Hussain Sagar lake.',
    gallery: [],
    summary: 'One of Hyderabad’s best-known lakes, and the most documented. Records show waste entering it every day through four channels, carrying about 1,041 kg of phosphates and 1,204 kg of nitrates. No clean-up recovery totals have been recorded for it by Lake Sentry yet.',
    about: 'A man-made lake at the heart of the city, surrounded by busy roads, parks and public spaces.',
    research: 'Until the 1950s the lake was almost free of pollution. Since then waste channels, encroachment and loss of biodiversity have changed its condition substantially.',
    observations: 'TODO: add Lake Sentry field notes from a site visit: where floating waste collects, what types you saw, and the date of the visit.',
    perspective: 'A highly visible lake, ideal for awareness campaigns. Any machine trial would need permission and coordination with the lake authorities.',
    facts: [
      { label: 'Type', value: 'Man-made lake', source: 'wiki-hussain-sagar' },
      { label: 'Built', value: '1500s', source: 'wiki-hussain-sagar' },
      { label: 'Waste-carrying channels', value: '4', source: 'wiki-hussain-sagar' },
    ],
    stats: [
      { group: 'pollution', value: '1,041', unit: 'kg per day', label: 'Phosphates entering the lake', note: 'Carried in by waste disposed of in the four channels.', source: 'wiki-hussain-sagar' },
      { group: 'pollution', value: '1,204', unit: 'kg per day', label: 'Nitrates entering the lake', note: 'Carried in by waste disposed of in the four channels.', source: 'wiki-hussain-sagar' },
    ],
    findings: [
      { text: 'The lake has shrunk because of encroachment and has suffered a severe loss of biodiversity in recent decades.', source: 'wiki-hussain-sagar' },
      { text: 'Authorities have introduced restrictions and measures to reduce pollution, but cleaning floating trash still relies heavily on manual volunteers.', source: 'lakesentry-deck' },
    ],
    timeline: [
      { when: '1500s', title: 'A man-made lake is built', text: 'Hussain Sagar is constructed as an artificial lake.', source: 'wiki-hussain-sagar' },
      { when: 'Until the 1950s', title: 'Almost free of pollution', text: 'The lake stays in relatively good condition for centuries.', source: 'wiki-hussain-sagar' },
      { when: 'Recent decades', title: 'Waste channels, shrinkage, biodiversity loss', text: 'Waste inflow through four channels and encroachment change the lake substantially.', source: 'wiki-hussain-sagar' },
    ],
    initiatives: [],
  },
  {
    id: 'durgam-cheruvu',
    name: 'Durgam Cheruvu',
    area: 'Madhapur / Jubilee Hills (west Hyderabad)',
    lat: 17.4300, lon: 78.3890, size: 1.5, labelDx: 26, labelDy: -24,
    status: 'listed',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a photo of Durgam Cheruvu lake.',
    gallery: [],
    summary: 'Listed as a lake page, with no pollution data or clean-up figures recorded yet.',
    about: 'Often called the “Secret Lake”, Durgam Cheruvu sits close to the city’s IT corridor and is crossed by a cable-stayed bridge.',
    research: 'TODO: add secondary research, e.g. news reports or studies about waste and water quality at Durgam Cheruvu.',
    observations: 'TODO: add field notes and photos from a site visit.',
    perspective: 'Heavy foot traffic from nearby offices makes this a good place to reach young professionals with awareness content.',
    facts: [], stats: [], findings: [], timeline: [], initiatives: [],
  },
  {
    id: 'malkam-cheruvu',
    name: 'Malkam Cheruvu',
    area: 'Raidurg (west Hyderabad)',
    lat: 17.4195, lon: 78.3710, size: 1.1, labelDx: -30, labelDy: 30,
    status: 'documented',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a field photo of floating trash at Malkam Cheruvu.',
    gallery: [],
    summary: 'Reported as polluted by floating trash and debris. No measured clean-up totals have been recorded yet.',
    about: 'A lake in the Raidurg area of west Hyderabad.',
    research: 'TODO: add research specific to Malkam Cheruvu.',
    observations: 'TODO: add the specific field observations and photos for this lake.',
    perspective: 'A candidate site for a supervised V1 test run, subject to permission from local authorities and resident associations.',
    facts: [],
    stats: [],
    findings: [
      { text: 'Named among the Hyderabad lakes polluted by floating trash and debris, which makes the water unpleasant and harms wildlife.', source: 'lakesentry-deck' },
      { text: 'Students photographed trash at Hyderabad lakes and found it visible, physical and ongoing.', source: 'keystone-visits' },
    ],
    timeline: [], initiatives: [],
  },
  {
    id: 'film-nagar-lake',
    name: 'Film Nagar Lake',
    area: 'Film Nagar / Jubilee Hills',
    lat: 17.4140, lon: 78.4100, size: 0.9, labelDx: 34, labelDy: 30,
    status: 'documented',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a field photo of Film Nagar Lake.',
    gallery: [],
    summary: 'Reported as polluted by floating trash and debris. No measured clean-up totals have been recorded yet.',
    about: 'A small neighbourhood lake in the Film Nagar area.',
    research: 'TODO: add research specific to Film Nagar Lake.',
    observations: 'TODO: add Lake Sentry field notes and photos for Film Nagar Lake.',
    perspective: 'Smaller lakes like this are where a compact, low-cost machine could make the most visible difference.',
    facts: [],
    stats: [],
    findings: [
      { text: 'Named among the Hyderabad lakes polluted by floating trash and debris.', source: 'lakesentry-deck' },
      { text: 'Students photographed trash at Hyderabad lakes and found it visible, physical and ongoing.', source: 'keystone-visits' },
    ],
    timeline: [], initiatives: [],
  },
  {
    id: 'rangadhamuni-cheruvu',
    name: 'Rangadhamuni Cheruvu',
    area: 'North-west Hyderabad',
    lat: 17.4880, lon: 78.4150, size: 1.3, labelDx: 0, labelDy: -30,
    status: 'documented',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a field photo of Rangadhamuni Cheruvu.',
    gallery: [],
    summary: 'Reported as polluted by floating trash and debris. No measured clean-up totals have been recorded yet.',
    about: 'A lake in north-west Hyderabad.',
    research: 'TODO: add research specific to Rangadhamuni Cheruvu.',
    observations: 'TODO: add Lake Sentry field notes and photos for Rangadhamuni Cheruvu.',
    perspective: 'A dense residential area around the lake means awareness and better waste bins could reduce new waste at the source.',
    facts: [],
    stats: [],
    findings: [
      { text: 'Named among the Hyderabad lakes polluted by floating trash and debris.', source: 'lakesentry-deck' },
      { text: 'Students photographed trash at Hyderabad lakes and found it visible, physical and ongoing.', source: 'keystone-visits' },
    ],
    timeline: [], initiatives: [],
  },
  {
    // No map position yet: listed next to the map, not drawn on it.
    id: 'kotha-cheruvu',
    name: 'Kotha Cheruvu',
    area: 'Location to be confirmed',
    status: 'documented',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a photo of Kotha Cheruvu.',
    gallery: [],
    summary: 'The largest recovery on record: about 15 tonnes of plastic pulled from this lake in this year’s clean-up drives.',
    about: 'TODO: add a description and the exact location of Kotha Cheruvu.',
    research: 'TODO: add research specific to Kotha Cheruvu.',
    observations: 'TODO: add Lake Sentry field notes and photos.',
    perspective: 'A strong case for the project: the scale of plastic recovered by hand shows how much waste reaches lakes like this one.',
    facts: [],
    stats: [
      { group: 'recovered', value: '15', unit: 'tonnes', label: 'Plastic pulled from the lake', note: 'Recovered in this year’s clean-up drives.', source: 'dhruvansh' },
    ],
    findings: [],
    timeline: [],
    initiatives: [
      { name: 'Clean-up drives (this year)', organization: 'Dhruvansh Foundation', timing: 'past', date: '', description: 'Clean-up drives this year pulled about 15 tonnes of plastic from the lake.', link: '', source: 'dhruvansh' },
    ],
  },
  {
    // No map position yet: listed next to the map, not drawn on it.
    id: 'barla-kunta',
    name: 'Barla Kunta',
    area: 'Location to be confirmed',
    status: 'documented',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a photo of Barla Kunta lake.',
    gallery: [],
    summary: 'About 5 tonnes of plastic were pulled from this lake alone in this year’s clean-up drives.',
    about: 'TODO: add a description and the exact location of Barla Kunta.',
    research: 'TODO: add research specific to Barla Kunta.',
    observations: 'TODO: add Lake Sentry field notes and photos.',
    perspective: 'Shows the scale of plastic that reaches smaller lakes, and why a low-cost, locally built collector is worth testing.',
    facts: [],
    stats: [
      { group: 'recovered', value: '5', unit: 'tonnes', label: 'Plastic pulled from the lake', note: 'Recovered in this year’s clean-up drives, from this lake alone.', source: 'dhruvansh' },
    ],
    findings: [],
    timeline: [],
    initiatives: [
      { name: 'Clean-up drives (this year)', organization: 'Dhruvansh Foundation', timing: 'past', date: '', description: 'Clean-up drives this year pulled about 5 tonnes of plastic from the lake.', link: '', source: 'dhruvansh' },
    ],
  },
  {
    id: 'osman-sagar',
    name: 'Osman Sagar (Gandipet)',
    area: 'Gandipet (west of the city)',
    lat: 17.3800, lon: 78.3000, size: 3, labelDx: 0, labelDy: 62,
    status: 'listed',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a photo of Osman Sagar reservoir.',
    gallery: [],
    summary: 'Listed as a lake page, with no pollution data or clean-up figures recorded yet.',
    about: 'A large reservoir on the Musi river, built in the 1920s after the great flood of 1908. It has historically supplied drinking water to Hyderabad.',
    research: 'TODO: add research on waste and water quality in the Osman Sagar catchment.',
    observations: 'TODO: add field notes and photos from a site visit.',
    perspective: 'As a drinking-water source, prevention (keeping waste out of the catchment) matters even more here than clean-up.',
    facts: [], stats: [], findings: [], timeline: [], initiatives: [],
  },
  {
    id: 'himayat-sagar',
    name: 'Himayat Sagar',
    area: 'South-west of the city',
    lat: 17.3200, lon: 78.3700, size: 2.8, labelDx: 0, labelDy: 58,
    status: 'listed',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a photo of Himayat Sagar reservoir.',
    gallery: [],
    summary: 'Listed as a lake page, with no pollution data or clean-up figures recorded yet.',
    about: 'A reservoir on the Esi river, a tributary of the Musi, built in the 1920s as a partner to Osman Sagar.',
    research: 'TODO: add research on Himayat Sagar.',
    observations: 'TODO: add field notes and photos from a site visit.',
    perspective: 'A large reservoir like this would be a long-term target for a more autonomous, solar-powered V2.',
    facts: [], stats: [], findings: [], timeline: [], initiatives: [],
  },
  {
    id: 'pebble-city-lake',
    name: 'Pebble City Lake',
    area: 'Location to be confirmed',
    lat: 17.3700, lon: 78.3350, size: 0.8, labelDx: 0, labelDy: 28,
    positionUnknown: true,
    status: 'listed',
    updated: '2026-10-07',
    photo: 'placeholder.svg',
    photoAlt: 'Placeholder for a photo of Pebble City Lake.',
    gallery: [],
    summary: 'Listed as a potential lake page. The location and details still need to be confirmed.',
    about: 'TODO: add a description once the location is confirmed.',
    research: 'TODO: add research.',
    observations: 'TODO: add field notes.',
    perspective: 'TODO: add the Lake Sentry perspective for this lake.',
    facts: [], stats: [], findings: [], timeline: [], initiatives: [],
  },
];
