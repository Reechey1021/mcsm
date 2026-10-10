// data/tracks.js
// GT7 locations and layouts for the round picker. Admins can also type any track
// by hand ("Other"), so a missing or renamed layout never blocks a season.
export const TRACKS = [
  ['alsace', 'Alsace', 'FRA', ['Village', 'Test Course']],
  ['maggiore', 'Autodrome Lago Maggiore', 'ITA', ['Full Course', 'Centre', 'East', 'West', 'Full Course Reverse', 'Centre Reverse', 'East Reverse', 'West Reverse']],
  ['interlagos', 'Autódromo de Interlagos', 'BRA', ['']],
  ['autopolis', 'Autopolis International Racing Course', 'JPN', ['Full Course', 'Short Course']],
  ['bluemoon', 'Blue Moon Bay Speedway', 'USA', ['Speedway', 'Infield A', 'Infield B', 'Infield A Reverse', 'Infield B Reverse']],
  ['brands', 'Brands Hatch', 'GBR', ['Grand Prix Circuit', 'Indy Circuit']],
  ['broadbean', 'Broad Bean Raceway', 'JPN', ['', 'Reverse']],
  ['catalunya', 'Circuit de Barcelona-Catalunya', 'ESP', ['Grand Prix Layout', 'National Layout', 'Rallycross Layout']],
  ['sarthe', 'Circuit de la Sarthe', 'FRA', ['', 'No Chicane']],
  ['stcroix', 'Circuit de Sainte-Croix', 'FRA', ['A', 'B', 'C', 'A Reverse', 'B Reverse', 'C Reverse']],
  ['spa', 'Circuit de Spa-Francorchamps', 'BEL', ['', '24h Layout']],
  ['villeneuve', 'Circuit Gilles-Villeneuve', 'CAN', ['']],
  ['daytona', 'Daytona International Speedway', 'USA', ['Road Course', 'Tri-Oval']],
  ['deepforest', 'Deep Forest Raceway', 'SUI', ['', 'Reverse']],
  ['dragon', 'Dragon Trail', 'CRO', ['Seaside', 'Gardens', 'Seaside Reverse', 'Gardens Reverse']],
  ['fuji', 'Fuji International Speedway', 'JPN', ['Full Course', 'Short Course']],
  ['goodwood', 'Goodwood Motor Circuit', 'GBR', ['']],
  ['grandvalley', 'Grand Valley', 'USA', ['Highway 1', 'South', 'Highway 1 Reverse', 'South Reverse']],
  ['highspeed', 'High Speed Ring', 'JPN', ['', 'Reverse']],
  ['kyoto', 'Kyoto Driving Park', 'JPN', ['Yamagiwa', 'Miyabi', 'Yamagiwa+Miyabi', 'Yamagiwa Reverse', 'Yamagiwa+Miyabi Reverse']],
  ['atlanta', 'Michelin Raceway Road Atlanta', 'USA', ['']],
  ['monza', 'Monza', 'ITA', ['', 'No Chicane']],
  ['panorama', 'Mount Panorama', 'AUS', ['']],
  ['northernisle', 'Northern Isle Speedway', 'USA', ['']],
  ['nurburgring', 'Nürburgring', 'GER', ['Nordschleife', 'Grand Prix', '24h']],
  ['redbull', 'Red Bull Ring', 'AUT', ['', 'Short Track']],
  ['sardegna', 'Sardegna – Road Track', 'ITA', ['A', 'B', 'C', 'A Reverse', 'B Reverse', 'C Reverse']],
  ['ssrx', 'Special Stage Route X', null, ['']],
  ['suzuka', 'Suzuka Circuit', 'JPN', ['', 'East Course']],
  ['tokyo', 'Tokyo Expressway', 'JPN', ['Central Outer Loop', 'Central Inner Loop', 'East Outer Loop', 'East Inner Loop', 'South Outer Loop', 'South Inner Loop']],
  ['trial', 'Trial Mountain Circuit', 'USA', ['', 'Reverse']],
  ['tsukuba', 'Tsukuba Circuit', 'JPN', ['']],
  ['watkins', 'Watkins Glen', 'USA', ['Long Course', 'Short Course']],
  ['laguna', 'WeatherTech Raceway Laguna Seca', 'USA', ['']],
  ['willow', 'Willow Springs', 'USA', ['Big Willow', 'Streets of Willow', 'Horse Thief Mile']],
].map(([id, name, cc, layouts]) => ({ id, name, cc, layouts }));

export const trackById = (id) => TRACKS.find((t) => t.id === id) || null;
export const roundTitle = (r) => (r ? [r.track, r.layout].filter(Boolean).join(' – ') : '');
