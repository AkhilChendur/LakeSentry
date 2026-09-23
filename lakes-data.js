/* =====================================================================
   Lake data for the App page (lake map + initiative form)
   ---------------------------------------------------------------------
   This is the ONE place to edit lake information. Each lake is an
   object with these fields:

     id           short unique name used in code (letters and dashes)
     name         the lake's display name
     area         neighbourhood / locality
     lat, lon     approximate coordinates — used to place the lake on
                  the schematic map (not a precise GIS map)
     size         how big to draw the lake on the map (1 = small, 3 = large)
     labelDx/Dy   nudges the map label so labels don't overlap
     verified     false = location still needs to be confirmed
     status       'observed' (Lake Sentry has field notes) or 'planned'
     photo        path to a photo, or the placeholder until you add one
     photoAlt     alt text describing the photo
     about, research, observations, perspective   the lake page sections

   Text marked "TODO" is a prompt for you to fill in with your own
   research, field notes and photos.
   ===================================================================== */
window.LAKE_SENTRY_LAKES = [
  {
    id: 'hussain-sagar',
    name: 'Hussain Sagar',
    area: 'Central Hyderabad (between Hyderabad and Secunderabad)',
    lat: 17.4239, lon: 78.4738, size: 2.4, labelDx: 0, labelDy: 46,
    verified: true,
    status: 'observed',
    photo: 'assets/images/placeholder.svg',
    photoAlt: 'Placeholder for a photo of Hussain Sagar lake.',
    about: 'A man-made lake built in the 1500s at the heart of the city. It is one of Hyderabad’s best-known landmarks and is surrounded by busy roads, parks and public spaces.',
    research: 'Until the 1950s the lake was almost free of pollution. Today about 1,041 kg of phosphates and 1,204 kg of nitrates enter it every day through four waste channels, and encroachment has shrunk the lake and reduced its biodiversity.',
    observations: 'TODO: add Lake Sentry field notes from a site visit, such as where floating waste collects, what types you saw and the date of the visit.',
    perspective: 'A highly visible lake, ideal for awareness campaigns. Any machine trial would need permission and coordination with lake authorities.',
  },
  {
    id: 'durgam-cheruvu',
    name: 'Durgam Cheruvu',
    area: 'Madhapur / Jubilee Hills (west Hyderabad)',
    lat: 17.4300, lon: 78.3890, size: 1.5, labelDx: 26, labelDy: -24,
    verified: true,
    status: 'planned',
    photo: 'assets/images/placeholder.svg',
    photoAlt: 'Placeholder for a photo of Durgam Cheruvu lake.',
    about: 'Often called the “Secret Lake”, Durgam Cheruvu sits close to the city’s IT corridor and is crossed by a cable-stayed bridge.',
    research: 'TODO: add secondary research, e.g. news reports or studies about waste and water quality at Durgam Cheruvu.',
    observations: 'TODO: field visit planned. Add notes and photos here afterwards.',
    perspective: 'Heavy foot traffic from nearby offices makes this a good place to reach young professionals with awareness content.',
  },
  {
    id: 'malkam-cheruvu',
    name: 'Malkam Cheruvu',
    area: 'Raidurg (west Hyderabad)',
    lat: 17.4195, lon: 78.3710, size: 1.1, labelDx: -30, labelDy: 30,
    verified: true,
    status: 'observed',
    photo: 'assets/images/placeholder.svg',
    photoAlt: 'Placeholder for a field photo of floating trash at Malkam Cheruvu.',
    about: 'A lake in the Raidurg area of west Hyderabad.',
    research: 'Named in Lake Sentry’s research as one of the Hyderabad lakes polluted by floating trash and debris.',
    observations: 'Keystone International School students visited and photographed Hyderabad lakes, where the trash was visible, physical and ongoing. TODO: add the specific observations for this lake.',
    perspective: 'A candidate site for a supervised V1 test run, subject to permission from local authorities and resident associations.',
  },
  {
    id: 'film-nagar-lake',
    name: 'Film Nagar Lake',
    area: 'Film Nagar / Jubilee Hills',
    lat: 17.4140, lon: 78.4100, size: 0.9, labelDx: 34, labelDy: 30,
    verified: true,
    status: 'observed',
    photo: 'assets/images/placeholder.svg',
    photoAlt: 'Placeholder for a field photo of Film Nagar Lake.',
    about: 'A small neighbourhood lake in the Film Nagar area.',
    research: 'Named in Lake Sentry’s research as one of the Hyderabad lakes polluted by floating trash and debris.',
    observations: 'TODO: add Lake Sentry field notes and photos for Film Nagar Lake.',
    perspective: 'Smaller lakes like this are where a compact, low-cost machine could make the most visible difference.',
  },
  {
    id: 'rangadhamuni-cheruvu',
    name: 'Rangadhamuni Cheruvu',
    area: 'Kukatpally (north-west Hyderabad)',
    lat: 17.4880, lon: 78.4150, size: 1.3, labelDx: 0, labelDy: -30,
    verified: true,
    status: 'observed',
    photo: 'assets/images/placeholder.svg',
    photoAlt: 'Placeholder for a field photo of Rangadhamuni Cheruvu.',
    about: 'A lake in the Kukatpally area of north-west Hyderabad.',
    research: 'Named in Lake Sentry’s research as one of the Hyderabad lakes polluted by floating trash and debris.',
    observations: 'TODO: add Lake Sentry field notes and photos for Rangadhamuni Cheruvu.',
    perspective: 'A dense residential area around the lake means awareness and better waste bins could reduce new waste at the source.',
  },
  {
    id: 'osman-sagar',
    name: 'Osman Sagar (Gandipet)',
    area: 'Gandipet (west of the city)',
    lat: 17.3800, lon: 78.3000, size: 3, labelDx: 0, labelDy: 62,
    verified: true,
    status: 'planned',
    photo: 'assets/images/placeholder.svg',
    photoAlt: 'Placeholder for a photo of Osman Sagar reservoir.',
    about: 'A large reservoir on the Musi river, built in the 1920s after the great flood of 1908. It has historically supplied drinking water to Hyderabad.',
    research: 'TODO: add research on waste and water quality in the Osman Sagar catchment.',
    observations: 'TODO: field visit planned.',
    perspective: 'As a drinking-water source, prevention (keeping waste out of the catchment) matters even more here than clean-up.',
  },
  {
    id: 'himayat-sagar',
    name: 'Himayat Sagar',
    area: 'South-west of the city',
    lat: 17.3200, lon: 78.3700, size: 2.8, labelDx: 0, labelDy: 58,
    verified: true,
    status: 'planned',
    photo: 'assets/images/placeholder.svg',
    photoAlt: 'Placeholder for a photo of Himayat Sagar reservoir.',
    about: 'A reservoir on the Esi river, a tributary of the Musi, built in the 1920s as a partner to Osman Sagar.',
    research: 'TODO: add research on Himayat Sagar.',
    observations: 'TODO: field visit planned.',
    perspective: 'A large reservoir like this would be a long-term target for a more autonomous, solar-powered V2.',
  },
  {
    id: 'pebble-city-lake',
    name: 'Pebble City Lake',
    area: 'Location to be verified',
    lat: 17.3700, lon: 78.3350, size: 0.8, labelDx: 0, labelDy: 28,
    verified: false,
    status: 'planned',
    photo: 'assets/images/placeholder.svg',
    photoAlt: 'Placeholder for a photo of Pebble City Lake.',
    about: 'TODO: listed as a potential lake page. Add a description once the location is confirmed.',
    research: 'TODO: add research.',
    observations: 'TODO: add field notes.',
    perspective: 'TODO: add the Lake Sentry perspective for this lake.',
  },
];
