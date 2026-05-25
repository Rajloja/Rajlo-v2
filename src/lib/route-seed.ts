/**
 * Auto-generated from the TA 2023 Route Taxi fare table PDF.
 *
 * Source: public/ROUTE TAXI FARE INCREASE 2023_updated.pdf
 * Generator: scripts/parse-ta-routes.mjs
 *
 * Do NOT hand-edit. Re-run the parser when TA publishes a new schedule.
 * Routes the parser couldn't extract cleanly (multi-line PDF rows) are
 * intentionally omitted — admin operators add those via the UI.
 */

export type SeedRoute = {
  origin: string;
  destination: string;
  parish: string | null;
  distanceKm: number;
  taFareJmd: number;
  slug: string;
};

export const TA_ROUTES_2023_SEED: SeedRoute[] = [
  {
    "origin": "Chisholm Avenue",
    "destination": "Downtown",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "chisholm-avenue-to-downtown"
  },
  {
    "origin": "Jones Town",
    "destination": "Downtown",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "jones-town-to-downtown"
  },
  {
    "origin": "Manley Meadows",
    "destination": "Downtown via",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "manley-meadows-to-downtown-via"
  },
  {
    "origin": "Padmore",
    "destination": "Chancery Street",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 3.24,
    "taFareJmd": 140,
    "slug": "padmore-to-chancery-street"
  },
  {
    "origin": "Cypress Hall",
    "destination": "Chancery Street",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 10.2,
    "taFareJmd": 180,
    "slug": "cypress-hall-to-chancery-street"
  },
  {
    "origin": "Essex Hall",
    "destination": "Stony Hill",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "essex-hall-to-stony-hill"
  },
  {
    "origin": "Mount Salus",
    "destination": "Stony Hill",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 4.5,
    "taFareJmd": 140,
    "slug": "mount-salus-to-stony-hill"
  },
  {
    "origin": "Free Town",
    "destination": "Lawrence Tavern",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "free-town-to-lawrence-tavern"
  },
  {
    "origin": "Glengoffe",
    "destination": "Lawrence Tavern",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "glengoffe-to-lawrence-tavern"
  },
  {
    "origin": "Mount Industry",
    "destination": "Lawrence Tavern",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "mount-industry-to-lawrence-tavern"
  },
  {
    "origin": "Half Way Tree",
    "destination": "Maxfield Avenue",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "half-way-tree-to-maxfield-avenue"
  },
  {
    "origin": "Arnett Gardens",
    "destination": "Cross Roads",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 2.4,
    "taFareJmd": 130,
    "slug": "arnett-gardens-to-cross-roads"
  },
  {
    "origin": "Cane River",
    "destination": "Nine Miles",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 5.5,
    "taFareJmd": 150,
    "slug": "cane-river-to-nine-miles"
  },
  {
    "origin": "Tavern/ Kintyre",
    "destination": "Papine",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 3.7,
    "taFareJmd": 140,
    "slug": "tavern-kintyre-to-papine"
  },
  {
    "origin": "Mount James",
    "destination": "Golden Spring",
    "parish": "Kingston and St. Andrew",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "mount-james-to-golden-spring"
  },
  {
    "origin": "Above Rocks",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 25.7,
    "taFareJmd": 290,
    "slug": "above-rocks-to-bog-walk"
  },
  {
    "origin": "Ewarton",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 16.1,
    "taFareJmd": 230,
    "slug": "ewarton-to-bog-walk"
  },
  {
    "origin": "Gobay",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 17,
    "taFareJmd": 230,
    "slug": "gobay-to-bog-walk"
  },
  {
    "origin": "Hampshire Dist.",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "hampshire-dist-to-bog-walk"
  },
  {
    "origin": "John Crow Spring",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 20,
    "taFareJmd": 250,
    "slug": "john-crow-spring-to-bog-walk"
  },
  {
    "origin": "Linstead",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "linstead-to-bog-walk"
  },
  {
    "origin": "Polly Ground",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "polly-ground-to-bog-walk"
  },
  {
    "origin": "Riversdale",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "riversdale-to-bog-walk"
  },
  {
    "origin": "Time And Patience",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "time-and-patience-to-bog-walk"
  },
  {
    "origin": "Treadways",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 12.9,
    "taFareJmd": 200,
    "slug": "treadways-to-bog-walk"
  },
  {
    "origin": "Troja",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 25.7,
    "taFareJmd": 290,
    "slug": "troja-to-bog-walk"
  },
  {
    "origin": "Wakefield",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "wakefield-to-bog-walk"
  },
  {
    "origin": "West Prospect",
    "destination": "Bog Walk",
    "parish": "St. Catherine",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "west-prospect-to-bog-walk"
  },
  {
    "origin": "Naggo Head",
    "destination": "Daytona",
    "parish": "St. Catherine",
    "distanceKm": 3.5,
    "taFareJmd": 140,
    "slug": "naggo-head-to-daytona"
  },
  {
    "origin": "Kellits",
    "destination": "Ewarton",
    "parish": "St. Catherine",
    "distanceKm": 32,
    "taFareJmd": 340,
    "slug": "kellits-to-ewarton"
  },
  {
    "origin": "Lluidasvale",
    "destination": "Ewarton",
    "parish": "St. Catherine",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "lluidasvale-to-ewarton"
  },
  {
    "origin": "Point Hill",
    "destination": "Ewarton",
    "parish": "St. Catherine",
    "distanceKm": 20.5,
    "taFareJmd": 260,
    "slug": "point-hill-to-ewarton"
  },
  {
    "origin": "Treadways",
    "destination": "Ewarton",
    "parish": "St. Catherine",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "treadways-to-ewarton"
  },
  {
    "origin": "Naggo Head",
    "destination": "Hellshire",
    "parish": "St. Catherine",
    "distanceKm": 8.7,
    "taFareJmd": 170,
    "slug": "naggo-head-to-hellshire"
  },
  {
    "origin": "Above Rocks",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 25.7,
    "taFareJmd": 290,
    "slug": "above-rocks-to-linstead"
  },
  {
    "origin": "Banbury",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 2.5,
    "taFareJmd": 130,
    "slug": "banbury-to-linstead"
  },
  {
    "origin": "Bermaddy",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 10.5,
    "taFareJmd": 190,
    "slug": "bermaddy-to-linstead"
  },
  {
    "origin": "Cheesefield",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 8.4,
    "taFareJmd": 170,
    "slug": "cheesefield-to-linstead"
  },
  {
    "origin": "Content",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 11.4,
    "taFareJmd": 190,
    "slug": "content-to-linstead"
  },
  {
    "origin": "Ewarton",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "ewarton-to-linstead"
  },
  {
    "origin": "Giblatore",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "giblatore-to-linstead"
  },
  {
    "origin": "Guys Hill",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "guys-hill-to-linstead"
  },
  {
    "origin": "Hampshire Dist.",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 15.5,
    "taFareJmd": 220,
    "slug": "hampshire-dist-to-linstead"
  },
  {
    "origin": "Harkers Hall",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "harkers-hall-to-linstead"
  },
  {
    "origin": "Jews Pen",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "jews-pen-to-linstead"
  },
  {
    "origin": "Kellits",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 42.9,
    "taFareJmd": 410,
    "slug": "kellits-to-linstead"
  },
  {
    "origin": "Knollis",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "knollis-to-linstead"
  },
  {
    "origin": "Lluidasvale",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 22.5,
    "taFareJmd": 270,
    "slug": "lluidasvale-to-linstead"
  },
  {
    "origin": "Mango Grove",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "mango-grove-to-linstead"
  },
  {
    "origin": "Moneague",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 24.1,
    "taFareJmd": 280,
    "slug": "moneague-to-linstead"
  },
  {
    "origin": "Mount Industry",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 21.6,
    "taFareJmd": 260,
    "slug": "mount-industry-to-linstead"
  },
  {
    "origin": "Mount Rosser",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "mount-rosser-to-linstead"
  },
  {
    "origin": "New Works",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "new-works-to-linstead"
  },
  {
    "origin": "Nutshell",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 7.6,
    "taFareJmd": 170,
    "slug": "nutshell-to-linstead"
  },
  {
    "origin": "Orangefield",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "orangefield-to-linstead"
  },
  {
    "origin": "Pollyground",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 12.9,
    "taFareJmd": 200,
    "slug": "pollyground-to-linstead"
  },
  {
    "origin": "Princessfield",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 7.6,
    "taFareJmd": 170,
    "slug": "princessfield-to-linstead"
  },
  {
    "origin": "Prospect",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 9.5,
    "taFareJmd": 180,
    "slug": "prospect-to-linstead"
  },
  {
    "origin": "Redwood",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 8.7,
    "taFareJmd": 170,
    "slug": "redwood-to-linstead"
  },
  {
    "origin": "Riversdale",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "riversdale-to-linstead"
  },
  {
    "origin": "Springvale",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "springvale-to-linstead"
  },
  {
    "origin": "Time And Patience",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "time-and-patience-to-linstead"
  },
  {
    "origin": "Treadways",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 7.3,
    "taFareJmd": 160,
    "slug": "treadways-to-linstead"
  },
  {
    "origin": "Victoria",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 3.7,
    "taFareJmd": 140,
    "slug": "victoria-to-linstead"
  },
  {
    "origin": "Wakefield",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 4.5,
    "taFareJmd": 140,
    "slug": "wakefield-to-linstead"
  },
  {
    "origin": "Wallens Housing",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 7.7,
    "taFareJmd": 170,
    "slug": "wallens-housing-to-linstead"
  },
  {
    "origin": "West Prospect",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 11.3,
    "taFareJmd": 190,
    "slug": "west-prospect-to-linstead"
  },
  {
    "origin": "White House",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "white-house-to-linstead"
  },
  {
    "origin": "York Street",
    "destination": "Linstead",
    "parish": "St. Catherine",
    "distanceKm": 6.5,
    "taFareJmd": 160,
    "slug": "york-street-to-linstead"
  },
  {
    "origin": "Waterford",
    "destination": "Naggo Head",
    "parish": "St. Catherine",
    "distanceKm": 6.5,
    "taFareJmd": 160,
    "slug": "waterford-to-naggo-head"
  },
  {
    "origin": "Bannister",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "bannister-to-old-harbour"
  },
  {
    "origin": "Bartons",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 12.9,
    "taFareJmd": 200,
    "slug": "bartons-to-old-harbour"
  },
  {
    "origin": "Bellas Gates",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 16.1,
    "taFareJmd": 230,
    "slug": "bellas-gates-to-old-harbour"
  },
  {
    "origin": "Bois Content",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "bois-content-to-old-harbour"
  },
  {
    "origin": "Browns Hall",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 18.8,
    "taFareJmd": 240,
    "slug": "browns-hall-to-old-harbour"
  },
  {
    "origin": "Claremont",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "claremont-to-old-harbour"
  },
  {
    "origin": "Ginger Ridge",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 24.1,
    "taFareJmd": 280,
    "slug": "ginger-ridge-to-old-harbour"
  },
  {
    "origin": "Gutters",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "gutters-to-old-harbour"
  },
  {
    "origin": "Longville Park",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "longville-park-to-old-harbour"
  },
  {
    "origin": "New Harbour Village",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "new-harbour-village-to-old-harbour"
  },
  {
    "origin": "Old Harbour Bay",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 3.8,
    "taFareJmd": 140,
    "slug": "old-harbour-bay-to-old-harbour"
  },
  {
    "origin": "Red Ground",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 9.5,
    "taFareJmd": 180,
    "slug": "red-ground-to-old-harbour"
  },
  {
    "origin": "Salt River",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "salt-river-to-old-harbour"
  },
  {
    "origin": "Sandy Bay",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 8.1,
    "taFareJmd": 170,
    "slug": "sandy-bay-to-old-harbour"
  },
  {
    "origin": "Spring Village",
    "destination": "Old Harbour",
    "parish": "St. Catherine",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "spring-village-to-old-harbour"
  },
  {
    "origin": "Bannister",
    "destination": "Old Harbour Bay",
    "parish": "St. Catherine",
    "distanceKm": 9.5,
    "taFareJmd": 180,
    "slug": "bannister-to-old-harbour-bay"
  },
  {
    "origin": "Spring Village",
    "destination": "Old Harbour Bay",
    "parish": "St. Catherine",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "spring-village-to-old-harbour-bay"
  },
  {
    "origin": "Greater Portmore",
    "destination": "Portmore Mall",
    "parish": "St. Catherine",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "greater-portmore-to-portmore-mall"
  },
  {
    "origin": "Gregory Park",
    "destination": "Portmore Mall",
    "parish": "St. Catherine",
    "distanceKm": 6.3,
    "taFareJmd": 160,
    "slug": "gregory-park-to-portmore-mall"
  },
  {
    "origin": "New Causeway Fishing",
    "destination": "Portmore Mall",
    "parish": "St. Catherine",
    "distanceKm": 2.8,
    "taFareJmd": 130,
    "slug": "new-causeway-fishing-to-portmore-mall"
  },
  {
    "origin": "Portmore Villas",
    "destination": "Portmore Mall",
    "parish": "St. Catherine",
    "distanceKm": 6.2,
    "taFareJmd": 160,
    "slug": "portmore-villas-to-portmore-mall"
  },
  {
    "origin": "Waterford",
    "destination": "Portmore Mall",
    "parish": "St. Catherine",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "waterford-to-portmore-mall"
  },
  {
    "origin": "West Queens Park",
    "destination": "Portmore Mall",
    "parish": "St. Catherine",
    "distanceKm": 7.6,
    "taFareJmd": 170,
    "slug": "west-queens-park-to-portmore-mall"
  },
  {
    "origin": "Westchester",
    "destination": "Portmore Mall",
    "parish": "St. Catherine",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "westchester-to-portmore-mall"
  },
  {
    "origin": "Angels Estate",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5.9,
    "taFareJmd": 150,
    "slug": "angels-estate-to-spanish-town"
  },
  {
    "origin": "Avon Park",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 4.4,
    "taFareJmd": 140,
    "slug": "avon-park-to-spanish-town"
  },
  {
    "origin": "Back Pasture",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 24.6,
    "taFareJmd": 290,
    "slug": "back-pasture-to-spanish-town"
  },
  {
    "origin": "Bayside",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "bayside-to-spanish-town"
  },
  {
    "origin": "Bernard Lodge",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "bernard-lodge-to-spanish-town"
  },
  {
    "origin": "Browns Hall",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 27.7,
    "taFareJmd": 310,
    "slug": "browns-hall-to-spanish-town"
  },
  {
    "origin": "Crescent District",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 4.4,
    "taFareJmd": 140,
    "slug": "crescent-district-to-spanish-town"
  },
  {
    "origin": "Cromarty Grove",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "cromarty-grove-to-spanish-town"
  },
  {
    "origin": "Dam Head",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "dam-head-to-spanish-town"
  },
  {
    "origin": "Duncans Pen",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 2,
    "taFareJmd": 130,
    "slug": "duncans-pen-to-spanish-town"
  },
  {
    "origin": "Ebony Vale",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5.3,
    "taFareJmd": 150,
    "slug": "ebony-vale-to-spanish-town"
  },
  {
    "origin": "Eltham Park",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "eltham-park-to-spanish-town"
  },
  {
    "origin": "Eltham View",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6.3,
    "taFareJmd": 160,
    "slug": "eltham-view-to-spanish-town"
  },
  {
    "origin": "Eltham Vista",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 4.2,
    "taFareJmd": 140,
    "slug": "eltham-vista-to-spanish-town"
  },
  {
    "origin": "Ensom City",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "ensom-city-to-spanish-town"
  },
  {
    "origin": "Fairview Park",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "fairview-park-to-spanish-town"
  },
  {
    "origin": "Frazers Content",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "frazers-content-to-spanish-town"
  },
  {
    "origin": "Friendship Meadows",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5.1,
    "taFareJmd": 150,
    "slug": "friendship-meadows-to-spanish-town"
  },
  {
    "origin": "Gordon Pen",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "gordon-pen-to-spanish-town"
  },
  {
    "origin": "Greater Portmore",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "greater-portmore-to-spanish-town"
  },
  {
    "origin": "Green Acres",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5.6,
    "taFareJmd": 150,
    "slug": "green-acres-to-spanish-town"
  },
  {
    "origin": "Hartland",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "hartland-to-spanish-town"
  },
  {
    "origin": "Hellshire",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "hellshire-to-spanish-town"
  },
  {
    "origin": "Hill Run",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "hill-run-to-spanish-town"
  },
  {
    "origin": "Horizon Park",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "horizon-park-to-spanish-town"
  },
  {
    "origin": "Innswood",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 7.5,
    "taFareJmd": 170,
    "slug": "innswood-to-spanish-town"
  },
  {
    "origin": "Innswood Village",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5.7,
    "taFareJmd": 150,
    "slug": "innswood-village-to-spanish-town"
  },
  {
    "origin": "Jew Pen",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 16.1,
    "taFareJmd": 230,
    "slug": "jew-pen-to-spanish-town"
  },
  {
    "origin": "Jobs Lane",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "jobs-lane-to-spanish-town"
  },
  {
    "origin": "Kensington District",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 17.3,
    "taFareJmd": 230,
    "slug": "kensington-district-to-spanish-town"
  },
  {
    "origin": "Kentish",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 36.8,
    "taFareJmd": 370,
    "slug": "kentish-to-spanish-town"
  },
  {
    "origin": "Keystone",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5.1,
    "taFareJmd": 150,
    "slug": "keystone-to-spanish-town"
  },
  {
    "origin": "Kitson Town",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 14.5,
    "taFareJmd": 210,
    "slug": "kitson-town-to-spanish-town"
  },
  {
    "origin": "Lauriston",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 2.8,
    "taFareJmd": 130,
    "slug": "lauriston-to-spanish-town"
  },
  {
    "origin": "Lime Tree",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "lime-tree-to-spanish-town"
  },
  {
    "origin": "Linstead",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 22.5,
    "taFareJmd": 270,
    "slug": "linstead-to-spanish-town"
  },
  {
    "origin": "Macca Tree",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 25.5,
    "taFareJmd": 290,
    "slug": "macca-tree-to-spanish-town"
  },
  {
    "origin": "Magil Palms",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5.8,
    "taFareJmd": 150,
    "slug": "magil-palms-to-spanish-town"
  },
  {
    "origin": "Mount View Estate via",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 7.7,
    "taFareJmd": 170,
    "slug": "mount-view-estate-via-to-spanish-town"
  },
  {
    "origin": "Mount Pleasant",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 26.5,
    "taFareJmd": 300,
    "slug": "mount-pleasant-to-spanish-town"
  },
  {
    "origin": "Naggo Head",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 8.1,
    "taFareJmd": 170,
    "slug": "naggo-head-to-spanish-town"
  },
  {
    "origin": "Old Harbour",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 17.7,
    "taFareJmd": 240,
    "slug": "old-harbour-to-spanish-town"
  },
  {
    "origin": "Old Harbour Bay",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "old-harbour-bay-to-spanish-town"
  },
  {
    "origin": "Point Hill",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 26.5,
    "taFareJmd": 300,
    "slug": "point-hill-to-spanish-town"
  },
  {
    "origin": "Polly Ground",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 35.4,
    "taFareJmd": 360,
    "slug": "polly-ground-to-spanish-town"
  },
  {
    "origin": "Queens Hill",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 25.7,
    "taFareJmd": 290,
    "slug": "queens-hill-to-spanish-town"
  },
  {
    "origin": "Seville Meadows 1",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "seville-meadows-1-to-spanish-town"
  },
  {
    "origin": "Seville Meadows 2",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "seville-meadows-2-to-spanish-town"
  },
  {
    "origin": "Seville Meadows 3",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "seville-meadows-3-to-spanish-town"
  },
  {
    "origin": "Sligoville",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 17.7,
    "taFareJmd": 240,
    "slug": "sligoville-to-spanish-town"
  },
  {
    "origin": "St.. John's Heights",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "st-john-s-heights-to-spanish-town"
  },
  {
    "origin": "Sydenham Villa",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "sydenham-villa-to-spanish-town"
  },
  {
    "origin": "Thompson Pen",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 3.1,
    "taFareJmd": 130,
    "slug": "thompson-pen-to-spanish-town"
  },
  {
    "origin": "Tredegar Park",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "tredegar-park-to-spanish-town"
  },
  {
    "origin": "Tryall Heights",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "tryall-heights-to-spanish-town"
  },
  {
    "origin": "Victoria",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 33.5,
    "taFareJmd": 350,
    "slug": "victoria-to-spanish-town"
  },
  {
    "origin": "Waterford",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "waterford-to-spanish-town"
  },
  {
    "origin": "Waterloo Gardens",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 5.4,
    "taFareJmd": 150,
    "slug": "waterloo-gardens-to-spanish-town"
  },
  {
    "origin": "White Water Meadows",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6.7,
    "taFareJmd": 160,
    "slug": "white-water-meadows-to-spanish-town"
  },
  {
    "origin": "Willowdene",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "willowdene-to-spanish-town"
  },
  {
    "origin": "Windsor Road",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 2.5,
    "taFareJmd": 130,
    "slug": "windsor-road-to-spanish-town"
  },
  {
    "origin": "Wynters Pen",
    "destination": "Spanish Town",
    "parish": "St. Catherine",
    "distanceKm": 6.7,
    "taFareJmd": 160,
    "slug": "wynters-pen-to-spanish-town"
  },
  {
    "origin": "Coxswain",
    "destination": "Chapelton",
    "parish": "Clarendon",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "coxswain-to-chapelton"
  },
  {
    "origin": "Mullet Hall",
    "destination": "Chapelton",
    "parish": "Clarendon",
    "distanceKm": 4.2,
    "taFareJmd": 140,
    "slug": "mullet-hall-to-chapelton"
  },
  {
    "origin": "Crawle River",
    "destination": "Chapelton",
    "parish": "Clarendon",
    "distanceKm": 6.5,
    "taFareJmd": 160,
    "slug": "crawle-river-to-chapelton"
  },
  {
    "origin": "Rock River",
    "destination": "Chapelton",
    "parish": "Clarendon",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "rock-river-to-chapelton"
  },
  {
    "origin": "Thompson Town",
    "destination": "Chapelton",
    "parish": "Clarendon",
    "distanceKm": 16.6,
    "taFareJmd": 230,
    "slug": "thompson-town-to-chapelton"
  },
  {
    "origin": "Cave Valley",
    "destination": "Frankfield",
    "parish": "Clarendon",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "cave-valley-to-frankfield"
  },
  {
    "origin": "Crooked River",
    "destination": "Frankfield",
    "parish": "Clarendon",
    "distanceKm": 8.3,
    "taFareJmd": 170,
    "slug": "crooked-river-to-frankfield"
  },
  {
    "origin": "Long Look",
    "destination": "Frankfield",
    "parish": "Clarendon",
    "distanceKm": 7.1,
    "taFareJmd": 160,
    "slug": "long-look-to-frankfield"
  },
  {
    "origin": "Chapelton",
    "destination": "Kellits",
    "parish": "Clarendon",
    "distanceKm": 24.5,
    "taFareJmd": 280,
    "slug": "chapelton-to-kellits"
  },
  {
    "origin": "Crooked River",
    "destination": "Kellits",
    "parish": "Clarendon",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "crooked-river-to-kellits"
  },
  {
    "origin": "James Hill",
    "destination": "Kellits",
    "parish": "Clarendon",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "james-hill-to-kellits"
  },
  {
    "origin": "Longville Park",
    "destination": "Lionel Town",
    "parish": "Clarendon",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "longville-park-to-lionel-town"
  },
  {
    "origin": "Ashley",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "ashley-to-may-pen"
  },
  {
    "origin": "Banks",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 34,
    "taFareJmd": 350,
    "slug": "banks-to-may-pen"
  },
  {
    "origin": "Beckford Kraal",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 30.2,
    "taFareJmd": 320,
    "slug": "beckford-kraal-to-may-pen"
  },
  {
    "origin": "Blackwoods",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 27.5,
    "taFareJmd": 310,
    "slug": "blackwoods-to-may-pen"
  },
  {
    "origin": "Bucknor",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "bucknor-to-may-pen"
  },
  {
    "origin": "Bushy Park",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 8.3,
    "taFareJmd": 170,
    "slug": "bushy-park-to-may-pen"
  },
  {
    "origin": "Chapelton",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 19.3,
    "taFareJmd": 250,
    "slug": "chapelton-to-may-pen"
  },
  {
    "origin": "Chatteau",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "chatteau-to-may-pen"
  },
  {
    "origin": "Coates Pen",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "coates-pen-to-may-pen"
  },
  {
    "origin": "Ebony Park",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "ebony-park-to-may-pen"
  },
  {
    "origin": "Effortville",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 2.1,
    "taFareJmd": 130,
    "slug": "effortville-to-may-pen"
  },
  {
    "origin": "Four Paths",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 5.5,
    "taFareJmd": 150,
    "slug": "four-paths-to-may-pen"
  },
  {
    "origin": "Free Town",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 11.7,
    "taFareJmd": 190,
    "slug": "free-town-to-may-pen"
  },
  {
    "origin": "Gimme Mi Bit",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 20.5,
    "taFareJmd": 260,
    "slug": "gimme-mi-bit-to-may-pen"
  },
  {
    "origin": "Gravel Hill via York",
    "destination": "Town May Pen",
    "parish": "Clarendon",
    "distanceKm": 16.9,
    "taFareJmd": 230,
    "slug": "gravel-hill-via-york-to-town-may-pen"
  },
  {
    "origin": "Hayes",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 13.3,
    "taFareJmd": 210,
    "slug": "hayes-to-may-pen"
  },
  {
    "origin": "Kemps Hill",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 34,
    "taFareJmd": 350,
    "slug": "kemps-hill-to-may-pen"
  },
  {
    "origin": "Kennedy Grove",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 6.2,
    "taFareJmd": 160,
    "slug": "kennedy-grove-to-may-pen"
  },
  {
    "origin": "Lionel Town",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 22,
    "taFareJmd": 270,
    "slug": "lionel-town-to-may-pen"
  },
  {
    "origin": "Longsville",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 9.3,
    "taFareJmd": 180,
    "slug": "longsville-to-may-pen"
  },
  {
    "origin": "Longville Park",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 21.6,
    "taFareJmd": 260,
    "slug": "longville-park-to-may-pen"
  },
  {
    "origin": "Longwood",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 34,
    "taFareJmd": 350,
    "slug": "longwood-to-may-pen"
  },
  {
    "origin": "Milk River",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 22,
    "taFareJmd": 270,
    "slug": "milk-river-to-may-pen"
  },
  {
    "origin": "Mineral Heights",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "mineral-heights-to-may-pen"
  },
  {
    "origin": "Mitchell Town",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "mitchell-town-to-may-pen"
  },
  {
    "origin": "Mitchells Hill",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 26.7,
    "taFareJmd": 300,
    "slug": "mitchells-hill-to-may-pen"
  },
  {
    "origin": "Mocho",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 16.8,
    "taFareJmd": 230,
    "slug": "mocho-to-may-pen"
  },
  {
    "origin": "Moores",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "moores-to-may-pen"
  },
  {
    "origin": "Mount Airy",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 23.9,
    "taFareJmd": 280,
    "slug": "mount-airy-to-may-pen"
  },
  {
    "origin": "Mount Providence",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 20.7,
    "taFareJmd": 260,
    "slug": "mount-providence-to-may-pen"
  },
  {
    "origin": "New Ground",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 24.3,
    "taFareJmd": 280,
    "slug": "new-ground-to-may-pen"
  },
  {
    "origin": "Old Harbour",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 18.4,
    "taFareJmd": 240,
    "slug": "old-harbour-to-may-pen"
  },
  {
    "origin": "Palmers Cross",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 3.3,
    "taFareJmd": 140,
    "slug": "palmers-cross-to-may-pen"
  },
  {
    "origin": "Pennants",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 25,
    "taFareJmd": 290,
    "slug": "pennants-to-may-pen"
  },
  {
    "origin": "Pleasant Valley",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "pleasant-valley-to-may-pen"
  },
  {
    "origin": "Portland Cottage",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "portland-cottage-to-may-pen"
  },
  {
    "origin": "Porus",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 21.6,
    "taFareJmd": 260,
    "slug": "porus-to-may-pen"
  },
  {
    "origin": "Pratville",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 30.6,
    "taFareJmd": 330,
    "slug": "pratville-to-may-pen"
  },
  {
    "origin": "Prospect",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "prospect-to-may-pen"
  },
  {
    "origin": "Race Course",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 31,
    "taFareJmd": 330,
    "slug": "race-course-to-may-pen"
  },
  {
    "origin": "Race Track",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "race-track-to-may-pen"
  },
  {
    "origin": "Richmond Park",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 23.4,
    "taFareJmd": 280,
    "slug": "richmond-park-to-may-pen"
  },
  {
    "origin": "Rock River",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 18.4,
    "taFareJmd": 240,
    "slug": "rock-river-to-may-pen"
  },
  {
    "origin": "Rocky Point",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 31,
    "taFareJmd": 330,
    "slug": "rocky-point-to-may-pen"
  },
  {
    "origin": "Rosewell",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "rosewell-to-may-pen"
  },
  {
    "origin": "Sandy Bay",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 9.5,
    "taFareJmd": 180,
    "slug": "sandy-bay-to-may-pen"
  },
  {
    "origin": "Scotts Pass",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 18.3,
    "taFareJmd": 240,
    "slug": "scotts-pass-to-may-pen"
  },
  {
    "origin": "Sedge Pond",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 36,
    "taFareJmd": 370,
    "slug": "sedge-pond-to-may-pen"
  },
  {
    "origin": "Sevens Heights",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 6.5,
    "taFareJmd": 160,
    "slug": "sevens-heights-to-may-pen"
  },
  {
    "origin": "Simon",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 28.7,
    "taFareJmd": 310,
    "slug": "simon-to-may-pen"
  },
  {
    "origin": "Smithville",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 30.2,
    "taFareJmd": 320,
    "slug": "smithville-to-may-pen"
  },
  {
    "origin": "Springfield",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 38,
    "taFareJmd": 380,
    "slug": "springfield-to-may-pen"
  },
  {
    "origin": "Stewarton",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 19.3,
    "taFareJmd": 250,
    "slug": "stewarton-to-may-pen"
  },
  {
    "origin": "Summerfield",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 20,
    "taFareJmd": 250,
    "slug": "summerfield-to-may-pen"
  },
  {
    "origin": "Thompson Town via",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 25.5,
    "taFareJmd": 290,
    "slug": "thompson-town-via-to-may-pen"
  },
  {
    "origin": "Threadlight",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "threadlight-to-may-pen"
  },
  {
    "origin": "Toll Gate",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 11.6,
    "taFareJmd": 190,
    "slug": "toll-gate-to-may-pen"
  },
  {
    "origin": "Victoria",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 26.8,
    "taFareJmd": 300,
    "slug": "victoria-to-may-pen"
  },
  {
    "origin": "Victoria Town",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 28.7,
    "taFareJmd": 310,
    "slug": "victoria-town-to-may-pen"
  },
  {
    "origin": "Water Lane",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 27,
    "taFareJmd": 300,
    "slug": "water-lane-to-may-pen"
  },
  {
    "origin": "Woodhall",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 17,
    "taFareJmd": 230,
    "slug": "woodhall-to-may-pen"
  },
  {
    "origin": "York Town",
    "destination": "May Pen",
    "parish": "Clarendon",
    "distanceKm": 8.4,
    "taFareJmd": 170,
    "slug": "york-town-to-may-pen"
  },
  {
    "origin": "Allison",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 6.5,
    "taFareJmd": 160,
    "slug": "allison-to-spalding"
  },
  {
    "origin": "Alston",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 5.5,
    "taFareJmd": 150,
    "slug": "alston-to-spalding"
  },
  {
    "origin": "Aenon Town",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "aenon-town-to-spalding"
  },
  {
    "origin": "Belcarres",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 8.3,
    "taFareJmd": 170,
    "slug": "belcarres-to-spalding"
  },
  {
    "origin": "Bullocks",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "bullocks-to-spalding"
  },
  {
    "origin": "Cave Valley",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 20,
    "taFareJmd": 250,
    "slug": "cave-valley-to-spalding"
  },
  {
    "origin": "Coffee Piece",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "coffee-piece-to-spalding"
  },
  {
    "origin": "Coleyville",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "coleyville-to-spalding"
  },
  {
    "origin": "Cumberland",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 10.9,
    "taFareJmd": 190,
    "slug": "cumberland-to-spalding"
  },
  {
    "origin": "Devon",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "devon-to-spalding"
  },
  {
    "origin": "Frankfield",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 17,
    "taFareJmd": 230,
    "slug": "frankfield-to-spalding"
  },
  {
    "origin": "Grantham",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 8.7,
    "taFareJmd": 170,
    "slug": "grantham-to-spalding"
  },
  {
    "origin": "Leicesterfield",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 17,
    "taFareJmd": 230,
    "slug": "leicesterfield-to-spalding"
  },
  {
    "origin": "Malton",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "malton-to-spalding"
  },
  {
    "origin": "Mizpah",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "mizpah-to-spalding"
  },
  {
    "origin": "Ritchies",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 6.8,
    "taFareJmd": 160,
    "slug": "ritchies-to-spalding"
  },
  {
    "origin": "Sanguinetti",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 4.4,
    "taFareJmd": 140,
    "slug": "sanguinetti-to-spalding"
  },
  {
    "origin": "Silent Hill",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 11.3,
    "taFareJmd": 190,
    "slug": "silent-hill-to-spalding"
  },
  {
    "origin": "Spalding Hill",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 2,
    "taFareJmd": 130,
    "slug": "spalding-hill-to-spalding"
  },
  {
    "origin": "Sunberry",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "sunberry-to-spalding"
  },
  {
    "origin": "Tweedside",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 8.8,
    "taFareJmd": 170,
    "slug": "tweedside-to-spalding"
  },
  {
    "origin": "Victoria",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "victoria-to-spalding"
  },
  {
    "origin": "Wildcane",
    "destination": "Spalding",
    "parish": "Clarendon",
    "distanceKm": 14.2,
    "taFareJmd": 210,
    "slug": "wildcane-to-spalding"
  },
  {
    "origin": "Frankfield",
    "destination": "Spalding Hill",
    "parish": "Clarendon",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "frankfield-to-spalding-hill"
  },
  {
    "origin": "Sanguinetti",
    "destination": "Spalding Hill",
    "parish": "Clarendon",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "sanguinetti-to-spalding-hill"
  },
  {
    "origin": "Silent Hill",
    "destination": "Spalding Hill",
    "parish": "Clarendon",
    "distanceKm": 13.3,
    "taFareJmd": 210,
    "slug": "silent-hill-to-spalding-hill"
  },
  {
    "origin": "Albert Town",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 24,
    "taFareJmd": 280,
    "slug": "albert-town-to-christiana"
  },
  {
    "origin": "Allison",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "allison-to-christiana"
  },
  {
    "origin": "Bohemia",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "bohemia-to-christiana"
  },
  {
    "origin": "Brockery",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "brockery-to-christiana"
  },
  {
    "origin": "Cascade",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "cascade-to-christiana"
  },
  {
    "origin": "Cheapside",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "cheapside-to-christiana"
  },
  {
    "origin": "Chudleigh",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "chudleigh-to-christiana"
  },
  {
    "origin": "Coleyville",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "coleyville-to-christiana"
  },
  {
    "origin": "Craighead",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "craighead-to-christiana"
  },
  {
    "origin": "Cumberland",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "cumberland-to-christiana"
  },
  {
    "origin": "Devon",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 6.6,
    "taFareJmd": 160,
    "slug": "devon-to-christiana"
  },
  {
    "origin": "Harry Watch",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "harry-watch-to-christiana"
  },
  {
    "origin": "Hibernia",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 14.5,
    "taFareJmd": 210,
    "slug": "hibernia-to-christiana"
  },
  {
    "origin": "Litchfield",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "litchfield-to-christiana"
  },
  {
    "origin": "Lorrimers",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "lorrimers-to-christiana"
  },
  {
    "origin": "Malton",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "malton-to-christiana"
  },
  {
    "origin": "Mizpah",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 12.9,
    "taFareJmd": 200,
    "slug": "mizpah-to-christiana"
  },
  {
    "origin": "Over River",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "over-river-to-christiana"
  },
  {
    "origin": "Pike",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 9.3,
    "taFareJmd": 180,
    "slug": "pike-to-christiana"
  },
  {
    "origin": "Robins Hall",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 12.6,
    "taFareJmd": 200,
    "slug": "robins-hall-to-christiana"
  },
  {
    "origin": "Santa Hill",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "santa-hill-to-christiana"
  },
  {
    "origin": "Silent Hill",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "silent-hill-to-christiana"
  },
  {
    "origin": "Spalding",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "spalding-to-christiana"
  },
  {
    "origin": "Spalding Hill",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 8.1,
    "taFareJmd": 170,
    "slug": "spalding-hill-to-christiana"
  },
  {
    "origin": "Troy",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 20.9,
    "taFareJmd": 260,
    "slug": "troy-to-christiana"
  },
  {
    "origin": "Wait A Bit",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "wait-a-bit-to-christiana"
  },
  {
    "origin": "Walderston",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "walderston-to-christiana"
  },
  {
    "origin": "Warsop",
    "destination": "Christiana",
    "parish": "Manchester",
    "distanceKm": 24,
    "taFareJmd": 280,
    "slug": "warsop-to-christiana"
  },
  {
    "origin": "Alligator Pond",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 28,
    "taFareJmd": 310,
    "slug": "alligator-pond-to-mandeville"
  },
  {
    "origin": "Asia",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 25.7,
    "taFareJmd": 290,
    "slug": "asia-to-mandeville"
  },
  {
    "origin": "Balaclava",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 32.6,
    "taFareJmd": 340,
    "slug": "balaclava-to-mandeville"
  },
  {
    "origin": "Ballards Valley",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 30,
    "taFareJmd": 320,
    "slug": "ballards-valley-to-mandeville"
  },
  {
    "origin": "Balvenie",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 3.1,
    "taFareJmd": 130,
    "slug": "balvenie-to-mandeville"
  },
  {
    "origin": "Banana Ground",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 16.1,
    "taFareJmd": 230,
    "slug": "banana-ground-to-mandeville"
  },
  {
    "origin": "Bath",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 13.4,
    "taFareJmd": 210,
    "slug": "bath-to-mandeville"
  },
  {
    "origin": "Bellefield",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 12.1,
    "taFareJmd": 200,
    "slug": "bellefield-to-mandeville"
  },
  {
    "origin": "Blenheim",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 16.1,
    "taFareJmd": 230,
    "slug": "blenheim-to-mandeville"
  },
  {
    "origin": "Blue Mountain",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 15.3,
    "taFareJmd": 220,
    "slug": "blue-mountain-to-mandeville"
  },
  {
    "origin": "Bombay",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 12.9,
    "taFareJmd": 200,
    "slug": "bombay-to-mandeville"
  },
  {
    "origin": "Broadleaf",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "broadleaf-to-mandeville"
  },
  {
    "origin": "Bull Savannah",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 37,
    "taFareJmd": 370,
    "slug": "bull-savannah-to-mandeville"
  },
  {
    "origin": "Caenwood",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 30,
    "taFareJmd": 320,
    "slug": "caenwood-to-mandeville"
  },
  {
    "origin": "Chantilly",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 13.4,
    "taFareJmd": 210,
    "slug": "chantilly-to-mandeville"
  },
  {
    "origin": "Christiana",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 20.8,
    "taFareJmd": 260,
    "slug": "christiana-to-mandeville"
  },
  {
    "origin": "Coffee Grove",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "coffee-grove-to-mandeville"
  },
  {
    "origin": "Coleyville",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "coleyville-to-mandeville"
  },
  {
    "origin": "Comfort",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "comfort-to-mandeville"
  },
  {
    "origin": "Comfort Hall",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "comfort-hall-to-mandeville"
  },
  {
    "origin": "Cross Keys",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 18.1,
    "taFareJmd": 240,
    "slug": "cross-keys-to-mandeville"
  },
  {
    "origin": "Davyton",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "davyton-to-mandeville"
  },
  {
    "origin": "Dunrobin",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "dunrobin-to-mandeville"
  },
  {
    "origin": "Dunsinane",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "dunsinane-to-mandeville"
  },
  {
    "origin": "Ellen Streeet",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "ellen-streeet-to-mandeville"
  },
  {
    "origin": "Farm",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 17.8,
    "taFareJmd": 240,
    "slug": "farm-to-mandeville"
  },
  {
    "origin": "Georges Valley",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 4.5,
    "taFareJmd": 140,
    "slug": "georges-valley-to-mandeville"
  },
  {
    "origin": "Greenvale",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 2.8,
    "taFareJmd": 130,
    "slug": "greenvale-to-mandeville"
  },
  {
    "origin": "Grey Ground",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "grey-ground-to-mandeville"
  },
  {
    "origin": "Grove Place (Bottom)",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 11.4,
    "taFareJmd": 190,
    "slug": "grove-place-bottom-to-mandeville"
  },
  {
    "origin": "Grove Town",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 22.5,
    "taFareJmd": 270,
    "slug": "grove-town-to-mandeville"
  },
  {
    "origin": "Gutters",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 17.2,
    "taFareJmd": 230,
    "slug": "gutters-to-mandeville"
  },
  {
    "origin": "Hanbury Road",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 6.5,
    "taFareJmd": 160,
    "slug": "hanbury-road-to-mandeville"
  },
  {
    "origin": "Harmons",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 14.5,
    "taFareJmd": 210,
    "slug": "harmons-to-mandeville"
  },
  {
    "origin": "Hatfield",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "hatfield-to-mandeville"
  },
  {
    "origin": "Heartease",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "heartease-to-mandeville"
  },
  {
    "origin": "Heathfield",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 16.1,
    "taFareJmd": 230,
    "slug": "heathfield-to-mandeville"
  },
  {
    "origin": "Huntley",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 16.1,
    "taFareJmd": 230,
    "slug": "huntley-to-mandeville"
  },
  {
    "origin": "Junction",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 33,
    "taFareJmd": 340,
    "slug": "junction-to-mandeville"
  },
  {
    "origin": "Kendal",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 7.3,
    "taFareJmd": 160,
    "slug": "kendal-to-mandeville"
  },
  {
    "origin": "Knockpatrick",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 9.6,
    "taFareJmd": 180,
    "slug": "knockpatrick-to-mandeville"
  },
  {
    "origin": "Lancaster",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 19.3,
    "taFareJmd": 250,
    "slug": "lancaster-to-mandeville"
  },
  {
    "origin": "Land Settlement",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 9.5,
    "taFareJmd": 180,
    "slug": "land-settlement-to-mandeville"
  },
  {
    "origin": "Lincoln",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "lincoln-to-mandeville"
  },
  {
    "origin": "Maidstone via Lincoln",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 20.6,
    "taFareJmd": 260,
    "slug": "maidstone-via-lincoln-to-mandeville"
  },
  {
    "origin": "Mannings Field",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 27.5,
    "taFareJmd": 310,
    "slug": "mannings-field-to-mandeville"
  },
  {
    "origin": "Marlie Hill",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 25,
    "taFareJmd": 290,
    "slug": "marlie-hill-to-mandeville"
  },
  {
    "origin": "May Day",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "may-day-to-mandeville"
  },
  {
    "origin": "May Pen",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 39,
    "taFareJmd": 390,
    "slug": "may-pen-to-mandeville"
  },
  {
    "origin": "Mike Town",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 4.9,
    "taFareJmd": 150,
    "slug": "mike-town-to-mandeville"
  },
  {
    "origin": "Mile Gully",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "mile-gully-to-mandeville"
  },
  {
    "origin": "Morelands",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 7.5,
    "taFareJmd": 170,
    "slug": "morelands-to-mandeville"
  },
  {
    "origin": "Morningside",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 31,
    "taFareJmd": 330,
    "slug": "morningside-to-mandeville"
  },
  {
    "origin": "Mount Prospect",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 13.8,
    "taFareJmd": 210,
    "slug": "mount-prospect-to-mandeville"
  },
  {
    "origin": "Newport",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "newport-to-mandeville"
  },
  {
    "origin": "New Green",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 4.4,
    "taFareJmd": 140,
    "slug": "new-green-to-mandeville"
  },
  {
    "origin": "New Hall",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 7.1,
    "taFareJmd": 160,
    "slug": "new-hall-to-mandeville"
  },
  {
    "origin": "New Wales",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "new-wales-to-mandeville"
  },
  {
    "origin": "Nomprel",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 19.1,
    "taFareJmd": 250,
    "slug": "nomprel-to-mandeville"
  },
  {
    "origin": "Old England",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 6.7,
    "taFareJmd": 160,
    "slug": "old-england-to-mandeville"
  },
  {
    "origin": "Plowden",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 27.4,
    "taFareJmd": 300,
    "slug": "plowden-to-mandeville"
  },
  {
    "origin": "Porus",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 16.1,
    "taFareJmd": 230,
    "slug": "porus-to-mandeville"
  },
  {
    "origin": "Pratville",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 27.4,
    "taFareJmd": 300,
    "slug": "pratville-to-mandeville"
  },
  {
    "origin": "Providence",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "providence-to-mandeville"
  },
  {
    "origin": "Pusey Hill",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 25.7,
    "taFareJmd": 290,
    "slug": "pusey-hill-to-mandeville"
  },
  {
    "origin": "Resource",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 25,
    "taFareJmd": 290,
    "slug": "resource-to-mandeville"
  },
  {
    "origin": "Richmond",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "richmond-to-mandeville"
  },
  {
    "origin": "Robins Hall",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 31,
    "taFareJmd": 330,
    "slug": "robins-hall-to-mandeville"
  },
  {
    "origin": "Rose Hill",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 20.8,
    "taFareJmd": 260,
    "slug": "rose-hill-to-mandeville"
  },
  {
    "origin": "Royal Flat",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 8.5,
    "taFareJmd": 170,
    "slug": "royal-flat-to-mandeville"
  },
  {
    "origin": "Santa Cruz",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 35.6,
    "taFareJmd": 360,
    "slug": "santa-cruz-to-mandeville"
  },
  {
    "origin": "Scotts Pass",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 19.3,
    "taFareJmd": 250,
    "slug": "scotts-pass-to-mandeville"
  },
  {
    "origin": "Shirehampton",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 18.4,
    "taFareJmd": 240,
    "slug": "shirehampton-to-mandeville"
  },
  {
    "origin": "Spalding",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 17.6,
    "taFareJmd": 240,
    "slug": "spalding-to-mandeville"
  },
  {
    "origin": "Spur Tree",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "spur-tree-to-mandeville"
  },
  {
    "origin": "St.. Pauls",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 27,
    "taFareJmd": 300,
    "slug": "st-pauls-to-mandeville"
  },
  {
    "origin": "Summerset",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 11.6,
    "taFareJmd": 190,
    "slug": "summerset-to-mandeville"
  },
  {
    "origin": "Swabys Hope",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 9.8,
    "taFareJmd": 180,
    "slug": "swabys-hope-to-mandeville"
  },
  {
    "origin": "Three Chain Road",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "three-chain-road-to-mandeville"
  },
  {
    "origin": "Toll Gate",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "toll-gate-to-mandeville"
  },
  {
    "origin": "Top Hill",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 33,
    "taFareJmd": 340,
    "slug": "top-hill-to-mandeville"
  },
  {
    "origin": "Waltham",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "waltham-to-mandeville"
  },
  {
    "origin": "Warwick",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 24.1,
    "taFareJmd": 280,
    "slug": "warwick-to-mandeville"
  },
  {
    "origin": "Williamsfield",
    "destination": "Mandeville",
    "parish": "Manchester",
    "distanceKm": 10.5,
    "taFareJmd": 190,
    "slug": "williamsfield-to-mandeville"
  },
  {
    "origin": "Mile Gully",
    "destination": "Balaclava",
    "parish": "St. Elizabeth",
    "distanceKm": 19.5,
    "taFareJmd": 250,
    "slug": "mile-gully-to-balaclava"
  },
  {
    "origin": "Russell Hill",
    "destination": "Balaclava",
    "parish": "St. Elizabeth",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "russell-hill-to-balaclava"
  },
  {
    "origin": "Arlington",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 9.3,
    "taFareJmd": 180,
    "slug": "arlington-to-black-river"
  },
  {
    "origin": "Brompton",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 9.6,
    "taFareJmd": 180,
    "slug": "brompton-to-black-river"
  },
  {
    "origin": "Cotterwood",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "cotterwood-to-black-river"
  },
  {
    "origin": "Fyffes Pen",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "fyffes-pen-to-black-river"
  },
  {
    "origin": "Ginger Hill",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "ginger-hill-to-black-river"
  },
  {
    "origin": "Hopewell",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "hopewell-to-black-river"
  },
  {
    "origin": "Junction",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 38.4,
    "taFareJmd": 380,
    "slug": "junction-to-black-river"
  },
  {
    "origin": "Lacovia",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 22.4,
    "taFareJmd": 270,
    "slug": "lacovia-to-black-river"
  },
  {
    "origin": "Lower Works",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "lower-works-to-black-river"
  },
  {
    "origin": "Luana",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "luana-to-black-river"
  },
  {
    "origin": "Mountainside",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "mountainside-to-black-river"
  },
  {
    "origin": "New Market",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 25.6,
    "taFareJmd": 290,
    "slug": "new-market-to-black-river"
  },
  {
    "origin": "Parottee",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "parottee-to-black-river"
  },
  {
    "origin": "Pedro Cross via",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 25.2,
    "taFareJmd": 290,
    "slug": "pedro-cross-via-to-black-river"
  },
  {
    "origin": "Rock Hall",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 22,
    "taFareJmd": 270,
    "slug": "rock-hall-to-black-river"
  },
  {
    "origin": "Santa Cruz",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 30.4,
    "taFareJmd": 330,
    "slug": "santa-cruz-to-black-river"
  },
  {
    "origin": "Southfield",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 29.3,
    "taFareJmd": 320,
    "slug": "southfield-to-black-river"
  },
  {
    "origin": "Treasure Beach",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 27.2,
    "taFareJmd": 300,
    "slug": "treasure-beach-to-black-river"
  },
  {
    "origin": "Vineyards",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "vineyards-to-black-river"
  },
  {
    "origin": "Whitehouse",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 18.6,
    "taFareJmd": 240,
    "slug": "whitehouse-to-black-river"
  },
  {
    "origin": "Woodlands",
    "destination": "Black River",
    "parish": "St. Elizabeth",
    "distanceKm": 27,
    "taFareJmd": 300,
    "slug": "woodlands-to-black-river"
  },
  {
    "origin": "Gutters",
    "destination": "Bull Savannah",
    "parish": "St. Elizabeth",
    "distanceKm": 18.6,
    "taFareJmd": 240,
    "slug": "gutters-to-bull-savannah"
  },
  {
    "origin": "Alligator Pond",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 9.6,
    "taFareJmd": 180,
    "slug": "alligator-pond-to-junction"
  },
  {
    "origin": "Brinkley",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "brinkley-to-junction"
  },
  {
    "origin": "Bull Savannah",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "bull-savannah-to-junction"
  },
  {
    "origin": "Comma Pen",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "comma-pen-to-junction"
  },
  {
    "origin": "Dalton via Southfield",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 12.5,
    "taFareJmd": 200,
    "slug": "dalton-via-southfield-to-junction"
  },
  {
    "origin": "Genus",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 9.5,
    "taFareJmd": 180,
    "slug": "genus-to-junction"
  },
  {
    "origin": "Gutters via Nain",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 14.2,
    "taFareJmd": 210,
    "slug": "gutters-via-nain-to-junction"
  },
  {
    "origin": "Malvern",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 17.5,
    "taFareJmd": 240,
    "slug": "malvern-to-junction"
  },
  {
    "origin": "Morningside",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 4.5,
    "taFareJmd": 140,
    "slug": "morningside-to-junction"
  },
  {
    "origin": "Pedro Cross",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "pedro-cross-to-junction"
  },
  {
    "origin": "Rose Hall",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "rose-hall-to-junction"
  },
  {
    "origin": "Southfield",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 9.6,
    "taFareJmd": 180,
    "slug": "southfield-to-junction"
  },
  {
    "origin": "Todd Town",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "todd-town-to-junction"
  },
  {
    "origin": "Top Hill",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 5.6,
    "taFareJmd": 150,
    "slug": "top-hill-to-junction"
  },
  {
    "origin": "Treasure Beach",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 23,
    "taFareJmd": 270,
    "slug": "treasure-beach-to-junction"
  },
  {
    "origin": "Tryall",
    "destination": "Junction",
    "parish": "St. Elizabeth",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "tryall-to-junction"
  },
  {
    "origin": "Aberdeen",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 33.4,
    "taFareJmd": 350,
    "slug": "aberdeen-to-santa-cruz"
  },
  {
    "origin": "Balaclava",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 22.4,
    "taFareJmd": 270,
    "slug": "balaclava-to-santa-cruz"
  },
  {
    "origin": "Bartons",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 15.2,
    "taFareJmd": 220,
    "slug": "bartons-to-santa-cruz"
  },
  {
    "origin": "Braes River",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 8.4,
    "taFareJmd": 170,
    "slug": "braes-river-to-santa-cruz"
  },
  {
    "origin": "Brompton",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 27.2,
    "taFareJmd": 300,
    "slug": "brompton-to-santa-cruz"
  },
  {
    "origin": "Burnt Ground via Coke",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 3.5,
    "taFareJmd": 140,
    "slug": "burnt-ground-via-coke-to-santa-cruz"
  },
  {
    "origin": "Carisbrook via Lacovia",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "carisbrook-via-lacovia-to-santa-cruz"
  },
  {
    "origin": "Elderslie",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 31,
    "taFareJmd": 330,
    "slug": "elderslie-to-santa-cruz"
  },
  {
    "origin": "Elim",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 16.4,
    "taFareJmd": 230,
    "slug": "elim-to-santa-cruz"
  },
  {
    "origin": "Gutters",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 13.9,
    "taFareJmd": 210,
    "slug": "gutters-to-santa-cruz"
  },
  {
    "origin": "Junction via North",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 25.8,
    "taFareJmd": 290,
    "slug": "junction-via-north-to-santa-cruz"
  },
  {
    "origin": "Junction via Gutters",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "junction-via-gutters-to-santa-cruz"
  },
  {
    "origin": "Lacovia",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "lacovia-to-santa-cruz"
  },
  {
    "origin": "Leeds",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "leeds-to-santa-cruz"
  },
  {
    "origin": "Maggotty",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 20.8,
    "taFareJmd": 260,
    "slug": "maggotty-to-santa-cruz"
  },
  {
    "origin": "Malvern",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 17.6,
    "taFareJmd": 240,
    "slug": "malvern-to-santa-cruz"
  },
  {
    "origin": "Middle Quarters",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 19.2,
    "taFareJmd": 250,
    "slug": "middle-quarters-to-santa-cruz"
  },
  {
    "origin": "Mountainside",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 18.1,
    "taFareJmd": 240,
    "slug": "mountainside-to-santa-cruz"
  },
  {
    "origin": "Munro",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 24,
    "taFareJmd": 280,
    "slug": "munro-to-santa-cruz"
  },
  {
    "origin": "Myersville",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 11.2,
    "taFareJmd": 190,
    "slug": "myersville-to-santa-cruz"
  },
  {
    "origin": "New Building",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 17,
    "taFareJmd": 230,
    "slug": "new-building-to-santa-cruz"
  },
  {
    "origin": "New Market",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 32,
    "taFareJmd": 340,
    "slug": "new-market-to-santa-cruz"
  },
  {
    "origin": "Newell",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 25.9,
    "taFareJmd": 290,
    "slug": "newell-to-santa-cruz"
  },
  {
    "origin": "Northampton",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "northampton-to-santa-cruz"
  },
  {
    "origin": "Paradise",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 15.5,
    "taFareJmd": 220,
    "slug": "paradise-to-santa-cruz"
  },
  {
    "origin": "Park Mountain",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "park-mountain-to-santa-cruz"
  },
  {
    "origin": "Pedro Cross via",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 31,
    "taFareJmd": 330,
    "slug": "pedro-cross-via-to-santa-cruz"
  },
  {
    "origin": "Quickstep",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 40.2,
    "taFareJmd": 390,
    "slug": "quickstep-to-santa-cruz"
  },
  {
    "origin": "Retirement",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "retirement-to-santa-cruz"
  },
  {
    "origin": "Rocky Hill",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "rocky-hill-to-santa-cruz"
  },
  {
    "origin": "Scholefield",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "scholefield-to-santa-cruz"
  },
  {
    "origin": "Siloah",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 28.8,
    "taFareJmd": 310,
    "slug": "siloah-to-santa-cruz"
  },
  {
    "origin": "Slipe",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "slipe-to-santa-cruz"
  },
  {
    "origin": "Southfield",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 29.8,
    "taFareJmd": 320,
    "slug": "southfield-to-santa-cruz"
  },
  {
    "origin": "Thornton via Maggotty",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "thornton-via-maggotty-to-santa-cruz"
  },
  {
    "origin": "Warminister",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "warminister-to-santa-cruz"
  },
  {
    "origin": "Watchwell",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 24.1,
    "taFareJmd": 280,
    "slug": "watchwell-to-santa-cruz"
  },
  {
    "origin": "Y.s. Falls",
    "destination": "Santa Cruz",
    "parish": "St. Elizabeth",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "y-s-falls-to-santa-cruz"
  },
  {
    "origin": "Bethel Town",
    "destination": "Darliston",
    "parish": "Westmoreland",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "bethel-town-to-darliston"
  },
  {
    "origin": "New Market",
    "destination": "Darliston",
    "parish": "Westmoreland",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "new-market-to-darliston"
  },
  {
    "origin": "Petersfield",
    "destination": "Darliston",
    "parish": "Westmoreland",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "petersfield-to-darliston"
  },
  {
    "origin": "Green Island",
    "destination": "Grange Hill",
    "parish": "Westmoreland",
    "distanceKm": 17.5,
    "taFareJmd": 240,
    "slug": "green-island-to-grange-hill"
  },
  {
    "origin": "Paul Island",
    "destination": "Grange Hill",
    "parish": "Westmoreland",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "paul-island-to-grange-hill"
  },
  {
    "origin": "Beach Road /",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "beach-road-to-negril"
  },
  {
    "origin": "Grange Hill",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 27,
    "taFareJmd": 300,
    "slug": "grange-hill-to-negril"
  },
  {
    "origin": "Green Island",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 20.8,
    "taFareJmd": 260,
    "slug": "green-island-to-negril"
  },
  {
    "origin": "Little London",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 16.5,
    "taFareJmd": 230,
    "slug": "little-london-to-negril"
  },
  {
    "origin": "March Town",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 23,
    "taFareJmd": 270,
    "slug": "march-town-to-negril"
  },
  {
    "origin": "Negril Spot",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 8.7,
    "taFareJmd": 170,
    "slug": "negril-spot-to-negril"
  },
  {
    "origin": "Orange Bay",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "orange-bay-to-negril"
  },
  {
    "origin": "Orange Hill",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "orange-hill-to-negril"
  },
  {
    "origin": "Revival",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "revival-to-negril"
  },
  {
    "origin": "Sheffield",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "sheffield-to-negril"
  },
  {
    "origin": "West End",
    "destination": "Negril",
    "parish": "Westmoreland",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "west-end-to-negril"
  },
  {
    "origin": "Banbury",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "banbury-to-savanna-la-mar"
  },
  {
    "origin": "Bath",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "bath-to-savanna-la-mar"
  },
  {
    "origin": "Bethel Town",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 37,
    "taFareJmd": 370,
    "slug": "bethel-town-to-savanna-la-mar"
  },
  {
    "origin": "Bluefields",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "bluefields-to-savanna-la-mar"
  },
  {
    "origin": "Burnt Savannah",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "burnt-savannah-to-savanna-la-mar"
  },
  {
    "origin": "Cave Mountain",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 16.5,
    "taFareJmd": 230,
    "slug": "cave-mountain-to-savanna-la-mar"
  },
  {
    "origin": "Chichester",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 22,
    "taFareJmd": 270,
    "slug": "chichester-to-savanna-la-mar"
  },
  {
    "origin": "Content",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "content-to-savanna-la-mar"
  },
  {
    "origin": "Cornwall",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 25.6,
    "taFareJmd": 290,
    "slug": "cornwall-to-savanna-la-mar"
  },
  {
    "origin": "Darliston",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 22.4,
    "taFareJmd": 270,
    "slug": "darliston-to-savanna-la-mar"
  },
  {
    "origin": "Flower Hill",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "flower-hill-to-savanna-la-mar"
  },
  {
    "origin": "Fort William",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 12.5,
    "taFareJmd": 200,
    "slug": "fort-william-to-savanna-la-mar"
  },
  {
    "origin": "Friendship",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 12.5,
    "taFareJmd": 200,
    "slug": "friendship-to-savanna-la-mar"
  },
  {
    "origin": "Grange",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "grange-to-savanna-la-mar"
  },
  {
    "origin": "Grange Hill",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "grange-hill-to-savanna-la-mar"
  },
  {
    "origin": "Hertford",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "hertford-to-savanna-la-mar"
  },
  {
    "origin": "Kentucky",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 23,
    "taFareJmd": 270,
    "slug": "kentucky-to-savanna-la-mar"
  },
  {
    "origin": "Little London",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 11.2,
    "taFareJmd": 190,
    "slug": "little-london-to-savanna-la-mar"
  },
  {
    "origin": "Llandilo Housing",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "llandilo-housing-to-savanna-la-mar"
  },
  {
    "origin": "Mackfield",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 21.2,
    "taFareJmd": 260,
    "slug": "mackfield-to-savanna-la-mar"
  },
  {
    "origin": "Moreland Hill",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "moreland-hill-to-savanna-la-mar"
  },
  {
    "origin": "Negril",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 28,
    "taFareJmd": 310,
    "slug": "negril-to-savanna-la-mar"
  },
  {
    "origin": "Paul Island",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 25,
    "taFareJmd": 290,
    "slug": "paul-island-to-savanna-la-mar"
  },
  {
    "origin": "Petersfield",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "petersfield-to-savanna-la-mar"
  },
  {
    "origin": "Porters",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 18.5,
    "taFareJmd": 240,
    "slug": "porters-to-savanna-la-mar"
  },
  {
    "origin": "Red Hills via Frome",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 22,
    "taFareJmd": 270,
    "slug": "red-hills-via-frome-to-savanna-la-mar"
  },
  {
    "origin": "Roaring River",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "roaring-river-to-savanna-la-mar"
  },
  {
    "origin": "Shrewsbury",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "shrewsbury-to-savanna-la-mar"
  },
  {
    "origin": "Shrewsbury",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 15.5,
    "taFareJmd": 220,
    "slug": "shrewsbury-to-savanna-la-mar-15-5km"
  },
  {
    "origin": "Smithfield",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "smithfield-to-savanna-la-mar"
  },
  {
    "origin": "Strathbogie",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "strathbogie-to-savanna-la-mar"
  },
  {
    "origin": "Welcome",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "welcome-to-savanna-la-mar"
  },
  {
    "origin": "Whitehouse",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 28,
    "taFareJmd": 310,
    "slug": "whitehouse-to-savanna-la-mar"
  },
  {
    "origin": "White Hall",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 27.2,
    "taFareJmd": 300,
    "slug": "white-hall-to-savanna-la-mar"
  },
  {
    "origin": "Whithorn",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "whithorn-to-savanna-la-mar"
  },
  {
    "origin": "Willamsfield",
    "destination": "Savanna La Mar",
    "parish": "Westmoreland",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "willamsfield-to-savanna-la-mar"
  },
  {
    "origin": "Norman Manley",
    "destination": "West End",
    "parish": "Westmoreland",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "norman-manley-to-west-end"
  },
  {
    "origin": "Bog",
    "destination": "White House",
    "parish": "Westmoreland",
    "distanceKm": 13.5,
    "taFareJmd": 210,
    "slug": "bog-to-white-house"
  },
  {
    "origin": "New Works",
    "destination": "White House",
    "parish": "Westmoreland",
    "distanceKm": 15.4,
    "taFareJmd": 220,
    "slug": "new-works-to-white-house"
  },
  {
    "origin": "Petersville",
    "destination": "White House",
    "parish": "Westmoreland",
    "distanceKm": 6.8,
    "taFareJmd": 160,
    "slug": "petersville-to-white-house"
  },
  {
    "origin": "Cave Valley",
    "destination": "Green Island",
    "parish": "Hanover",
    "distanceKm": 6.7,
    "taFareJmd": 160,
    "slug": "cave-valley-to-green-island"
  },
  {
    "origin": "Bamboo",
    "destination": "Hopewell",
    "parish": "Hanover",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "bamboo-to-hopewell"
  },
  {
    "origin": "Cacoon Castle",
    "destination": "Hopewell",
    "parish": "Hanover",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "cacoon-castle-to-hopewell"
  },
  {
    "origin": "Haddington",
    "destination": "Hopewell",
    "parish": "Hanover",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "haddington-to-hopewell"
  },
  {
    "origin": "Pondside",
    "destination": "Hopewell",
    "parish": "Hanover",
    "distanceKm": 13.5,
    "taFareJmd": 210,
    "slug": "pondside-to-hopewell"
  },
  {
    "origin": "Sandy Bay",
    "destination": "Hopewell",
    "parish": "Hanover",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "sandy-bay-to-hopewell"
  },
  {
    "origin": "Bulls Bay",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "bulls-bay-to-lucea"
  },
  {
    "origin": "Cacoon",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 5.7,
    "taFareJmd": 150,
    "slug": "cacoon-to-lucea"
  },
  {
    "origin": "Cascade",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "cascade-to-lucea"
  },
  {
    "origin": "Cauldwell",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "cauldwell-to-lucea"
  },
  {
    "origin": "Claremont",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "claremont-to-lucea"
  },
  {
    "origin": "Dias",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 6.3,
    "taFareJmd": 160,
    "slug": "dias-to-lucea"
  },
  {
    "origin": "Elgin Town",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "elgin-town-to-lucea"
  },
  {
    "origin": "Esher",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "esher-to-lucea"
  },
  {
    "origin": "Glasgow",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "glasgow-to-lucea"
  },
  {
    "origin": "Grange Hill",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 20,
    "taFareJmd": 250,
    "slug": "grange-hill-to-lucea"
  },
  {
    "origin": "Green Island",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "green-island-to-lucea"
  },
  {
    "origin": "Haughton Court",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "haughton-court-to-lucea"
  },
  {
    "origin": "Hopewell",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "hopewell-to-lucea"
  },
  {
    "origin": "Jericho",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 7.3,
    "taFareJmd": 160,
    "slug": "jericho-to-lucea"
  },
  {
    "origin": "Kingsvale",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 9.5,
    "taFareJmd": 180,
    "slug": "kingsvale-to-lucea"
  },
  {
    "origin": "Lances Bay",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "lances-bay-to-lucea"
  },
  {
    "origin": "Maryland",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "maryland-to-lucea"
  },
  {
    "origin": "Negril",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 39,
    "taFareJmd": 390,
    "slug": "negril-to-lucea"
  },
  {
    "origin": "Orange Bay",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 22,
    "taFareJmd": 270,
    "slug": "orange-bay-to-lucea"
  },
  {
    "origin": "Saint Simon",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "saint-simon-to-lucea"
  },
  {
    "origin": "Sandy Bay",
    "destination": "Lucea",
    "parish": "Hanover",
    "distanceKm": 15.5,
    "taFareJmd": 220,
    "slug": "sandy-bay-to-lucea"
  },
  {
    "origin": "Adelphi",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "adelphi-to-montego-bay"
  },
  {
    "origin": "Airport",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "airport-to-montego-bay"
  },
  {
    "origin": "Anchovy",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "anchovy-to-montego-bay"
  },
  {
    "origin": "Barrett Town",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "barrett-town-to-montego-bay"
  },
  {
    "origin": "Bethel Town",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 27,
    "taFareJmd": 300,
    "slug": "bethel-town-to-montego-bay"
  },
  {
    "origin": "Bickersteth",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "bickersteth-to-montego-bay"
  },
  {
    "origin": "Bogue",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "bogue-to-montego-bay"
  },
  {
    "origin": "Cacoon Castle",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 22,
    "taFareJmd": 270,
    "slug": "cacoon-castle-to-montego-bay"
  },
  {
    "origin": "Cambridge",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 26,
    "taFareJmd": 300,
    "slug": "cambridge-to-montego-bay"
  },
  {
    "origin": "Cambridge Meadows",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 24,
    "taFareJmd": 280,
    "slug": "cambridge-meadows-to-montego-bay"
  },
  {
    "origin": "Catherine Hall",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 1.6,
    "taFareJmd": 120,
    "slug": "catherine-hall-to-montego-bay"
  },
  {
    "origin": "Catherine Mount",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "catherine-mount-to-montego-bay"
  },
  {
    "origin": "Chester Castle",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 24,
    "taFareJmd": 280,
    "slug": "chester-castle-to-montego-bay"
  },
  {
    "origin": "Clock",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 1,
    "taFareJmd": 120,
    "slug": "clock-to-montego-bay"
  },
  {
    "origin": "Content",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "content-to-montego-bay"
  },
  {
    "origin": "Copse",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 18.2,
    "taFareJmd": 240,
    "slug": "copse-to-montego-bay"
  },
  {
    "origin": "Coral Gardens",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "coral-gardens-to-montego-bay"
  },
  {
    "origin": "Cornwall",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "cornwall-to-montego-bay"
  },
  {
    "origin": "Cornwall Courts",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "cornwall-courts-to-montego-bay"
  },
  {
    "origin": "Dumfries",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 22.4,
    "taFareJmd": 270,
    "slug": "dumfries-to-montego-bay"
  },
  {
    "origin": "Fairfield",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "fairfield-to-montego-bay"
  },
  {
    "origin": "Farm Heights",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "farm-heights-to-montego-bay"
  },
  {
    "origin": "Flankers",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 6.5,
    "taFareJmd": 160,
    "slug": "flankers-to-montego-bay"
  },
  {
    "origin": "Flower Hill",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "flower-hill-to-montego-bay"
  },
  {
    "origin": "Freeport",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "freeport-to-montego-bay"
  },
  {
    "origin": "Glendevon",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "glendevon-to-montego-bay"
  },
  {
    "origin": "Goodwill",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 24,
    "taFareJmd": 280,
    "slug": "goodwill-to-montego-bay"
  },
  {
    "origin": "Granville",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "granville-to-montego-bay"
  },
  {
    "origin": "Green Pond",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 5.6,
    "taFareJmd": 150,
    "slug": "green-pond-to-montego-bay"
  },
  {
    "origin": "Greenwood",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 25.5,
    "taFareJmd": 290,
    "slug": "greenwood-to-montego-bay"
  },
  {
    "origin": "Gutters",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "gutters-to-montego-bay"
  },
  {
    "origin": "Hampton",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "hampton-to-montego-bay"
  },
  {
    "origin": "Hendon",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 3.7,
    "taFareJmd": 140,
    "slug": "hendon-to-montego-bay"
  },
  {
    "origin": "Hendon Norwood",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 4.7,
    "taFareJmd": 150,
    "slug": "hendon-norwood-to-montego-bay"
  },
  {
    "origin": "Hopewell",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 14.2,
    "taFareJmd": 210,
    "slug": "hopewell-to-montego-bay"
  },
  {
    "origin": "Ironshore",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "ironshore-to-montego-bay"
  },
  {
    "origin": "Irwin via Tucker (Tucker",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "irwin-via-tucker-tucker-to-montego-bay"
  },
  {
    "origin": "Johns Hall",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 11.5,
    "taFareJmd": 190,
    "slug": "johns-hall-to-montego-bay"
  },
  {
    "origin": "Kempshot",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 13.5,
    "taFareJmd": 210,
    "slug": "kempshot-to-montego-bay"
  },
  {
    "origin": "Kensington",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 20.1,
    "taFareJmd": 250,
    "slug": "kensington-to-montego-bay"
  },
  {
    "origin": "Lethe",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 15.2,
    "taFareJmd": 220,
    "slug": "lethe-to-montego-bay"
  },
  {
    "origin": "Lilliput",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 23.5,
    "taFareJmd": 280,
    "slug": "lilliput-to-montego-bay"
  },
  {
    "origin": "Lottery",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "lottery-to-montego-bay"
  },
  {
    "origin": "Mafoota",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 18.7,
    "taFareJmd": 240,
    "slug": "mafoota-to-montego-bay"
  },
  {
    "origin": "Maldon",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 22.5,
    "taFareJmd": 270,
    "slug": "maldon-to-montego-bay"
  },
  {
    "origin": "Maroon Town",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 26,
    "taFareJmd": 300,
    "slug": "maroon-town-to-montego-bay"
  },
  {
    "origin": "Melbourne",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "melbourne-to-montego-bay"
  },
  {
    "origin": "Moore Park",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "moore-park-to-montego-bay"
  },
  {
    "origin": "Mount Carey",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "mount-carey-to-montego-bay"
  },
  {
    "origin": "Mount Horeb",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 19.2,
    "taFareJmd": 250,
    "slug": "mount-horeb-to-montego-bay"
  },
  {
    "origin": "Mount Salem",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "mount-salem-to-montego-bay"
  },
  {
    "origin": "Mountpelier",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 17,
    "taFareJmd": 230,
    "slug": "mountpelier-to-montego-bay"
  },
  {
    "origin": "Moy Hall",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "moy-hall-to-montego-bay"
  },
  {
    "origin": "Norwood",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 5.1,
    "taFareJmd": 150,
    "slug": "norwood-to-montego-bay"
  },
  {
    "origin": "Orange",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "orange-to-montego-bay"
  },
  {
    "origin": "Over River",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 10.5,
    "taFareJmd": 190,
    "slug": "over-river-to-montego-bay"
  },
  {
    "origin": "Paradise",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 3.3,
    "taFareJmd": 140,
    "slug": "paradise-to-montego-bay"
  },
  {
    "origin": "Paradise Norwood",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "paradise-norwood-to-montego-bay"
  },
  {
    "origin": "Pitfour",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 8.5,
    "taFareJmd": 170,
    "slug": "pitfour-to-montego-bay"
  },
  {
    "origin": "Point",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 21.5,
    "taFareJmd": 260,
    "slug": "point-to-montego-bay"
  },
  {
    "origin": "Pondside",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 27.7,
    "taFareJmd": 310,
    "slug": "pondside-to-montego-bay"
  },
  {
    "origin": "Providence Heights",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 7.8,
    "taFareJmd": 170,
    "slug": "providence-heights-to-montego-bay"
  },
  {
    "origin": "Retirement",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 9.6,
    "taFareJmd": 180,
    "slug": "retirement-to-montego-bay"
  },
  {
    "origin": "Rhyne Park",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "rhyne-park-to-montego-bay"
  },
  {
    "origin": "Roehampton",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 17.6,
    "taFareJmd": 240,
    "slug": "roehampton-to-montego-bay"
  },
  {
    "origin": "Rose Hall",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "rose-hall-to-montego-bay"
  },
  {
    "origin": "Rose Heights",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "rose-heights-to-montego-bay"
  },
  {
    "origin": "Rosemount",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 4,
    "taFareJmd": 140,
    "slug": "rosemount-to-montego-bay"
  },
  {
    "origin": "Salt Spring",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "salt-spring-to-montego-bay"
  },
  {
    "origin": "Sign",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "sign-to-montego-bay"
  },
  {
    "origin": "Somerton",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "somerton-to-montego-bay"
  },
  {
    "origin": "Spot Valley",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 20,
    "taFareJmd": 250,
    "slug": "spot-valley-to-montego-bay"
  },
  {
    "origin": "Spring Mount",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 14.7,
    "taFareJmd": 220,
    "slug": "spring-mount-to-montego-bay"
  },
  {
    "origin": "Springfield",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 16.2,
    "taFareJmd": 230,
    "slug": "springfield-to-montego-bay"
  },
  {
    "origin": "Shettlewood",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "shettlewood-to-montego-bay"
  },
  {
    "origin": "Summerhill",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 22.8,
    "taFareJmd": 270,
    "slug": "summerhill-to-montego-bay"
  },
  {
    "origin": "Sunderland",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 13.3,
    "taFareJmd": 210,
    "slug": "sunderland-to-montego-bay"
  },
  {
    "origin": "Sunvalley",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "sunvalley-to-montego-bay"
  },
  {
    "origin": "The Estuary (Lagoon",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 15.6,
    "taFareJmd": 220,
    "slug": "the-estuary-lagoon-to-montego-bay"
  },
  {
    "origin": "Tower Hill",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "tower-hill-to-montego-bay"
  },
  {
    "origin": "Tucker",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 5.1,
    "taFareJmd": 150,
    "slug": "tucker-to-montego-bay"
  },
  {
    "origin": "Wakefield",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 26.3,
    "taFareJmd": 300,
    "slug": "wakefield-to-montego-bay"
  },
  {
    "origin": "Wales Pond",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "wales-pond-to-montego-bay"
  },
  {
    "origin": "West Green",
    "destination": "Montego Bay",
    "parish": "St. James",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "west-green-to-montego-bay"
  },
  {
    "origin": "Albert Town",
    "destination": "Clarks Town",
    "parish": "Trelawny",
    "distanceKm": 27.1,
    "taFareJmd": 300,
    "slug": "albert-town-to-clarks-town"
  },
  {
    "origin": "Duanvale",
    "destination": "Clarks Town",
    "parish": "Trelawny",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "duanvale-to-clarks-town"
  },
  {
    "origin": "Clarks Town",
    "destination": "Duncans",
    "parish": "Trelawny",
    "distanceKm": 8.3,
    "taFareJmd": 170,
    "slug": "clarks-town-to-duncans"
  },
  {
    "origin": "Discovery Bay",
    "destination": "Duncans",
    "parish": "Trelawny",
    "distanceKm": 19.5,
    "taFareJmd": 250,
    "slug": "discovery-bay-to-duncans"
  },
  {
    "origin": "Silver Sands",
    "destination": "Duncans",
    "parish": "Trelawny",
    "distanceKm": 2.2,
    "taFareJmd": 130,
    "slug": "silver-sands-to-duncans"
  },
  {
    "origin": "Albert Town",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 42,
    "taFareJmd": 410,
    "slug": "albert-town-to-falmouth"
  },
  {
    "origin": "Bounty Hall",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "bounty-hall-to-falmouth"
  },
  {
    "origin": "Bunkers Hill",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 13.6,
    "taFareJmd": 210,
    "slug": "bunkers-hill-to-falmouth"
  },
  {
    "origin": "Coral Spring Village",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 10.5,
    "taFareJmd": 190,
    "slug": "coral-spring-village-to-falmouth"
  },
  {
    "origin": "Clarks Town",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "clarks-town-to-falmouth"
  },
  {
    "origin": "Daniel Town",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 7.8,
    "taFareJmd": 170,
    "slug": "daniel-town-to-falmouth"
  },
  {
    "origin": "Davis Pen",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "davis-pen-to-falmouth"
  },
  {
    "origin": "Deeside",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 19.2,
    "taFareJmd": 250,
    "slug": "deeside-to-falmouth"
  },
  {
    "origin": "Discovery Bay",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 33,
    "taFareJmd": 340,
    "slug": "discovery-bay-to-falmouth"
  },
  {
    "origin": "Duanvale",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 14.7,
    "taFareJmd": 220,
    "slug": "duanvale-to-falmouth"
  },
  {
    "origin": "Duncans",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "duncans-to-falmouth"
  },
  {
    "origin": "Falmouth Garden",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 1.5,
    "taFareJmd": 120,
    "slug": "falmouth-garden-to-falmouth"
  },
  {
    "origin": "Friendship",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "friendship-to-falmouth"
  },
  {
    "origin": "Granville",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "granville-to-falmouth"
  },
  {
    "origin": "Greenwood",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "greenwood-to-falmouth"
  },
  {
    "origin": "Hague",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 3.5,
    "taFareJmd": 140,
    "slug": "hague-to-falmouth"
  },
  {
    "origin": "Lilliput",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "lilliput-to-falmouth"
  },
  {
    "origin": "Martha Brae",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 2,
    "taFareJmd": 130,
    "slug": "martha-brae-to-falmouth"
  },
  {
    "origin": "Sherwood Content",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "sherwood-content-to-falmouth"
  },
  {
    "origin": "Wakefield",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "wakefield-to-falmouth"
  },
  {
    "origin": "Zion",
    "destination": "Falmouth",
    "parish": "Trelawny",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "zion-to-falmouth"
  },
  {
    "origin": "Cave Valley",
    "destination": "Alexandria",
    "parish": "St. Ann",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "cave-valley-to-alexandria"
  },
  {
    "origin": "Grants Bailey",
    "destination": "Alexandria",
    "parish": "St. Ann",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "grants-bailey-to-alexandria"
  },
  {
    "origin": "Higgins Land",
    "destination": "Alexandria",
    "parish": "St. Ann",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "higgins-land-to-alexandria"
  },
  {
    "origin": "Murray Mountain",
    "destination": "Alexandria",
    "parish": "St. Ann",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "murray-mountain-to-alexandria"
  },
  {
    "origin": "Nine Miles",
    "destination": "Alexandria",
    "parish": "St. Ann",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "nine-miles-to-alexandria"
  },
  {
    "origin": "Stepney",
    "destination": "Alexandria",
    "parish": "St. Ann",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "stepney-to-alexandria"
  },
  {
    "origin": "Aboukir",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 22.4,
    "taFareJmd": 270,
    "slug": "aboukir-to-browns-town"
  },
  {
    "origin": "Alexandria",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "alexandria-to-browns-town"
  },
  {
    "origin": "Bamboo",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 14.7,
    "taFareJmd": 220,
    "slug": "bamboo-to-browns-town"
  },
  {
    "origin": "Cave Valley",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 25.9,
    "taFareJmd": 290,
    "slug": "cave-valley-to-browns-town"
  },
  {
    "origin": "Clarks Town",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 22.4,
    "taFareJmd": 270,
    "slug": "clarks-town-to-browns-town"
  },
  {
    "origin": "Discovery Bay",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "discovery-bay-to-browns-town"
  },
  {
    "origin": "Higgin Land",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "higgin-land-to-browns-town"
  },
  {
    "origin": "Keith",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 9.4,
    "taFareJmd": 180,
    "slug": "keith-to-browns-town"
  },
  {
    "origin": "Lower Buxton",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "lower-buxton-to-browns-town"
  },
  {
    "origin": "Madras",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 17.9,
    "taFareJmd": 240,
    "slug": "madras-to-browns-town"
  },
  {
    "origin": "Muir House via Green Hill",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 18.5,
    "taFareJmd": 240,
    "slug": "muir-house-via-green-hill-to-browns-town"
  },
  {
    "origin": "Orange Hill",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 2.6,
    "taFareJmd": 130,
    "slug": "orange-hill-to-browns-town"
  },
  {
    "origin": "Stepney",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 22.4,
    "taFareJmd": 270,
    "slug": "stepney-to-browns-town"
  },
  {
    "origin": "Watt Town",
    "destination": "Browns Town",
    "parish": "St. Ann",
    "distanceKm": 15.2,
    "taFareJmd": 220,
    "slug": "watt-town-to-browns-town"
  },
  {
    "origin": "Golden Grove",
    "destination": "Claremont",
    "parish": "St. Ann",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "golden-grove-to-claremont"
  },
  {
    "origin": "Irons Mountain",
    "destination": "Claremont",
    "parish": "St. Ann",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "irons-mountain-to-claremont"
  },
  {
    "origin": "Pedro River",
    "destination": "Claremont",
    "parish": "St. Ann",
    "distanceKm": 23.7,
    "taFareJmd": 280,
    "slug": "pedro-river-to-claremont"
  },
  {
    "origin": "Bensonton",
    "destination": "Claremont",
    "parish": "St. Ann",
    "distanceKm": 15.6,
    "taFareJmd": 220,
    "slug": "bensonton-to-claremont"
  },
  {
    "origin": "Duncans",
    "destination": "Discovery Bay",
    "parish": "St. Ann",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "duncans-to-discovery-bay"
  },
  {
    "origin": "Farm Town",
    "destination": "Discovery Bay",
    "parish": "St. Ann",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "farm-town-to-discovery-bay"
  },
  {
    "origin": "Rio Bueno",
    "destination": "Discovery Bay",
    "parish": "St. Ann",
    "distanceKm": 9.2,
    "taFareJmd": 180,
    "slug": "rio-bueno-to-discovery-bay"
  },
  {
    "origin": "Runaway Bay",
    "destination": "Discovery Bay",
    "parish": "St. Ann",
    "distanceKm": 7.7,
    "taFareJmd": 170,
    "slug": "runaway-bay-to-discovery-bay"
  },
  {
    "origin": "Thicketts",
    "destination": "Discovery Bay",
    "parish": "St. Ann",
    "distanceKm": 10.3,
    "taFareJmd": 190,
    "slug": "thicketts-to-discovery-bay"
  },
  {
    "origin": "Clapham",
    "destination": "Moneague",
    "parish": "St. Ann",
    "distanceKm": 6.3,
    "taFareJmd": 160,
    "slug": "clapham-to-moneague"
  },
  {
    "origin": "Claremont",
    "destination": "Moneague",
    "parish": "St. Ann",
    "distanceKm": 12.5,
    "taFareJmd": 200,
    "slug": "claremont-to-moneague"
  },
  {
    "origin": "Bamboo",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "bamboo-to-ocho-rios"
  },
  {
    "origin": "Bamboo Walk",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 15.6,
    "taFareJmd": 220,
    "slug": "bamboo-walk-to-ocho-rios"
  },
  {
    "origin": "Beecher Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 6.2,
    "taFareJmd": 160,
    "slug": "beecher-town-to-ocho-rios"
  },
  {
    "origin": "Boscobel",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "boscobel-to-ocho-rios"
  },
  {
    "origin": "Breadnut Hill",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 4.9,
    "taFareJmd": 150,
    "slug": "breadnut-hill-to-ocho-rios"
  },
  {
    "origin": "Camperdown",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 30.9,
    "taFareJmd": 330,
    "slug": "camperdown-to-ocho-rios"
  },
  {
    "origin": "Chalky Hill",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "chalky-hill-to-ocho-rios"
  },
  {
    "origin": "Charles Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 10.2,
    "taFareJmd": 180,
    "slug": "charles-town-to-ocho-rios"
  },
  {
    "origin": "Chester",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 20.5,
    "taFareJmd": 260,
    "slug": "chester-to-ocho-rios"
  },
  {
    "origin": "Clapham",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 26,
    "taFareJmd": 300,
    "slug": "clapham-to-ocho-rios"
  },
  {
    "origin": "Claremont",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 19.2,
    "taFareJmd": 250,
    "slug": "claremont-to-ocho-rios"
  },
  {
    "origin": "Colegate",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "colegate-to-ocho-rios"
  },
  {
    "origin": "Content Gardens",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 3.7,
    "taFareJmd": 140,
    "slug": "content-gardens-to-ocho-rios"
  },
  {
    "origin": "Davis Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 16.8,
    "taFareJmd": 230,
    "slug": "davis-town-to-ocho-rios"
  },
  {
    "origin": "Days Mountain",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 24.3,
    "taFareJmd": 280,
    "slug": "days-mountain-to-ocho-rios"
  },
  {
    "origin": "Dressikie",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 27.4,
    "taFareJmd": 300,
    "slug": "dressikie-to-ocho-rios"
  },
  {
    "origin": "Dunnsville",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "dunnsville-to-ocho-rios"
  },
  {
    "origin": "Eltham",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 7.5,
    "taFareJmd": 170,
    "slug": "eltham-to-ocho-rios"
  },
  {
    "origin": "Exchange",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 7.8,
    "taFareJmd": 170,
    "slug": "exchange-to-ocho-rios"
  },
  {
    "origin": "Fellowship Hall",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 17,
    "taFareJmd": 230,
    "slug": "fellowship-hall-to-ocho-rios"
  },
  {
    "origin": "Free Hill",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 25.9,
    "taFareJmd": 290,
    "slug": "free-hill-to-ocho-rios"
  },
  {
    "origin": "Galina",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 27.6,
    "taFareJmd": 310,
    "slug": "galina-to-ocho-rios"
  },
  {
    "origin": "Gayle via Lodge",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "gayle-via-lodge-to-ocho-rios"
  },
  {
    "origin": "Geddes Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 28.4,
    "taFareJmd": 310,
    "slug": "geddes-town-to-ocho-rios"
  },
  {
    "origin": "Golden Grove",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 17.5,
    "taFareJmd": 240,
    "slug": "golden-grove-to-ocho-rios"
  },
  {
    "origin": "Grants Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 28,
    "taFareJmd": 310,
    "slug": "grants-town-to-ocho-rios"
  },
  {
    "origin": "Great Pond",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 9.6,
    "taFareJmd": 180,
    "slug": "great-pond-to-ocho-rios"
  },
  {
    "origin": "Hamilton Mountain",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 24.2,
    "taFareJmd": 280,
    "slug": "hamilton-mountain-to-ocho-rios"
  },
  {
    "origin": "Higgins Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "higgins-town-to-ocho-rios"
  },
  {
    "origin": "Hinds Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "hinds-town-to-ocho-rios"
  },
  {
    "origin": "Jack's River",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 24.1,
    "taFareJmd": 280,
    "slug": "jack-s-river-to-ocho-rios"
  },
  {
    "origin": "Jeffery Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "jeffery-town-to-ocho-rios"
  },
  {
    "origin": "Lewis",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 17.9,
    "taFareJmd": 240,
    "slug": "lewis-to-ocho-rios"
  },
  {
    "origin": "Lime Hall",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "lime-hall-to-ocho-rios"
  },
  {
    "origin": "Lucky Hill",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 25.8,
    "taFareJmd": 290,
    "slug": "lucky-hill-to-ocho-rios"
  },
  {
    "origin": "Mango Valley",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "mango-valley-to-ocho-rios"
  },
  {
    "origin": "Mansfield Heights",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 4.1,
    "taFareJmd": 140,
    "slug": "mansfield-heights-to-ocho-rios"
  },
  {
    "origin": "Mile End",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 11.5,
    "taFareJmd": 190,
    "slug": "mile-end-to-ocho-rios"
  },
  {
    "origin": "Moneague",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 19.2,
    "taFareJmd": 250,
    "slug": "moneague-to-ocho-rios"
  },
  {
    "origin": "Mount Zion",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 22.1,
    "taFareJmd": 270,
    "slug": "mount-zion-to-ocho-rios"
  },
  {
    "origin": "Oracabessa",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "oracabessa-to-ocho-rios"
  },
  {
    "origin": "Parry Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 4.8,
    "taFareJmd": 150,
    "slug": "parry-town-to-ocho-rios"
  },
  {
    "origin": "Petersfield",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 12.4,
    "taFareJmd": 200,
    "slug": "petersfield-to-ocho-rios"
  },
  {
    "origin": "Pimento Walk",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 3.5,
    "taFareJmd": 140,
    "slug": "pimento-walk-to-ocho-rios"
  },
  {
    "origin": "Priory",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "priory-to-ocho-rios"
  },
  {
    "origin": "Race Course",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 21.6,
    "taFareJmd": 260,
    "slug": "race-course-to-ocho-rios"
  },
  {
    "origin": "Retirement",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 28.4,
    "taFareJmd": 310,
    "slug": "retirement-to-ocho-rios"
  },
  {
    "origin": "Retreat",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 13.7,
    "taFareJmd": 210,
    "slug": "retreat-to-ocho-rios"
  },
  {
    "origin": "Seville Heights",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 12.3,
    "taFareJmd": 200,
    "slug": "seville-heights-to-ocho-rios"
  },
  {
    "origin": "Shaw Park",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 2.6,
    "taFareJmd": 130,
    "slug": "shaw-park-to-ocho-rios"
  },
  {
    "origin": "Snow Hill",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 3,
    "taFareJmd": 130,
    "slug": "snow-hill-to-ocho-rios"
  },
  {
    "origin": "St.. Ann's Bay",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 12.5,
    "taFareJmd": 200,
    "slug": "st-ann-s-bay-to-ocho-rios"
  },
  {
    "origin": "Steer Town",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 9.6,
    "taFareJmd": 180,
    "slug": "steer-town-to-ocho-rios"
  },
  {
    "origin": "Three Hills",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 11.2,
    "taFareJmd": 190,
    "slug": "three-hills-to-ocho-rios"
  },
  {
    "origin": "Tryall Heights",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 27.8,
    "taFareJmd": 310,
    "slug": "tryall-heights-to-ocho-rios"
  },
  {
    "origin": "Valley Bush",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "valley-bush-to-ocho-rios"
  },
  {
    "origin": "Windsor Heights",
    "destination": "Ocho Rios",
    "parish": "St. Ann",
    "distanceKm": 14,
    "taFareJmd": 210,
    "slug": "windsor-heights-to-ocho-rios"
  },
  {
    "origin": "Alderton",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 25,
    "taFareJmd": 290,
    "slug": "alderton-to-st-ann-s-bay"
  },
  {
    "origin": "Bamboo",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "bamboo-to-st-ann-s-bay"
  },
  {
    "origin": "Chalky Hill",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 7.2,
    "taFareJmd": 160,
    "slug": "chalky-hill-to-st-ann-s-bay"
  },
  {
    "origin": "Chester",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 11.3,
    "taFareJmd": 190,
    "slug": "chester-to-st-ann-s-bay"
  },
  {
    "origin": "Claremont",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "claremont-to-st-ann-s-bay"
  },
  {
    "origin": "Davis Town",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 10.6,
    "taFareJmd": 190,
    "slug": "davis-town-to-st-ann-s-bay"
  },
  {
    "origin": "Discovery Bay",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 24,
    "taFareJmd": 280,
    "slug": "discovery-bay-to-st-ann-s-bay"
  },
  {
    "origin": "Farm Town",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 27.5,
    "taFareJmd": 310,
    "slug": "farm-town-to-st-ann-s-bay"
  },
  {
    "origin": "Hermitage",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 11.2,
    "taFareJmd": 190,
    "slug": "hermitage-to-st-ann-s-bay"
  },
  {
    "origin": "Higgin Town",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "higgin-town-to-st-ann-s-bay"
  },
  {
    "origin": "Lewis",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 6.5,
    "taFareJmd": 160,
    "slug": "lewis-to-st-ann-s-bay"
  },
  {
    "origin": "Lime Hall",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 6.3,
    "taFareJmd": 160,
    "slug": "lime-hall-to-st-ann-s-bay"
  },
  {
    "origin": "Lumsden",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 12.5,
    "taFareJmd": 200,
    "slug": "lumsden-to-st-ann-s-bay"
  },
  {
    "origin": "Mansfield Heights",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 15.1,
    "taFareJmd": 220,
    "slug": "mansfield-heights-to-st-ann-s-bay"
  },
  {
    "origin": "Moneague",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 29,
    "taFareJmd": 320,
    "slug": "moneague-to-st-ann-s-bay"
  },
  {
    "origin": "Mount Zion",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 12.4,
    "taFareJmd": 200,
    "slug": "mount-zion-to-st-ann-s-bay"
  },
  {
    "origin": "Priory",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 3.4,
    "taFareJmd": 140,
    "slug": "priory-to-st-ann-s-bay"
  },
  {
    "origin": "Runaway Bay",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "runaway-bay-to-st-ann-s-bay"
  },
  {
    "origin": "Seville Heights",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 4.5,
    "taFareJmd": 140,
    "slug": "seville-heights-to-st-ann-s-bay"
  },
  {
    "origin": "Steer Town",
    "destination": "St.. Ann's Bay",
    "parish": "St. Ann",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "steer-town-to-st-ann-s-bay"
  },
  {
    "origin": "Bangor Ridge",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 28.6,
    "taFareJmd": 310,
    "slug": "bangor-ridge-to-annotto-bay"
  },
  {
    "origin": "Buff Bay",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "buff-bay-to-annotto-bay"
  },
  {
    "origin": "Bybrook",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 28.3,
    "taFareJmd": 310,
    "slug": "bybrook-to-annotto-bay"
  },
  {
    "origin": "Charles Town",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 20.8,
    "taFareJmd": 260,
    "slug": "charles-town-to-annotto-bay"
  },
  {
    "origin": "Enfield",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "enfield-to-annotto-bay"
  },
  {
    "origin": "Highgate",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "highgate-to-annotto-bay"
  },
  {
    "origin": "Islington",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "islington-to-annotto-bay"
  },
  {
    "origin": "Kildare",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "kildare-to-annotto-bay"
  },
  {
    "origin": "Port Maria",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 26.1,
    "taFareJmd": 300,
    "slug": "port-maria-to-annotto-bay"
  },
  {
    "origin": "Richmond",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 17.7,
    "taFareJmd": 240,
    "slug": "richmond-to-annotto-bay"
  },
  {
    "origin": "Skibo",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 24,
    "taFareJmd": 280,
    "slug": "skibo-to-annotto-bay"
  },
  {
    "origin": "Spring Hill",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 30.6,
    "taFareJmd": 330,
    "slug": "spring-hill-to-annotto-bay"
  },
  {
    "origin": "Tryall Heights",
    "destination": "Annotto Bay",
    "parish": "St. Mary",
    "distanceKm": 31.1,
    "taFareJmd": 330,
    "slug": "tryall-heights-to-annotto-bay"
  },
  {
    "origin": "Bonny Gate",
    "destination": "Gayle",
    "parish": "St. Mary",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "bonny-gate-to-gayle"
  },
  {
    "origin": "Rio Nuevo",
    "destination": "Gayle",
    "parish": "St. Mary",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "rio-nuevo-to-gayle"
  },
  {
    "origin": "Top Pen via",
    "destination": "Gayle",
    "parish": "St. Mary",
    "distanceKm": 5.6,
    "taFareJmd": 150,
    "slug": "top-pen-via-to-gayle"
  },
  {
    "origin": "Cox Piece",
    "destination": "Guys Hill",
    "parish": "St. Mary",
    "distanceKm": 21.2,
    "taFareJmd": 260,
    "slug": "cox-piece-to-guys-hill"
  },
  {
    "origin": "Derry",
    "destination": "Guys Hill",
    "parish": "St. Mary",
    "distanceKm": 20,
    "taFareJmd": 250,
    "slug": "derry-to-guys-hill"
  },
  {
    "origin": "Gayle",
    "destination": "Guys Hill",
    "parish": "St. Mary",
    "distanceKm": 12.2,
    "taFareJmd": 200,
    "slug": "gayle-to-guys-hill"
  },
  {
    "origin": "Aleppo via Clermont",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 7.6,
    "taFareJmd": 170,
    "slug": "aleppo-via-clermont-to-highgate"
  },
  {
    "origin": "Belfield",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 8.4,
    "taFareJmd": 170,
    "slug": "belfield-to-highgate"
  },
  {
    "origin": "Benbow",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 20.7,
    "taFareJmd": 260,
    "slug": "benbow-to-highgate"
  },
  {
    "origin": "Flint River",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "flint-river-to-highgate"
  },
  {
    "origin": "Grandy Hole",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "grandy-hole-to-highgate"
  },
  {
    "origin": "Guys Hill",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "guys-hill-to-highgate"
  },
  {
    "origin": "Islington",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "islington-to-highgate"
  },
  {
    "origin": "John Crow Spring",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 10.9,
    "taFareJmd": 190,
    "slug": "john-crow-spring-to-highgate"
  },
  {
    "origin": "Marlborough",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 5,
    "taFareJmd": 150,
    "slug": "marlborough-to-highgate"
  },
  {
    "origin": "Platfield",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "platfield-to-highgate"
  },
  {
    "origin": "Richmond",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 4.3,
    "taFareJmd": 140,
    "slug": "richmond-to-highgate"
  },
  {
    "origin": "Rose Hill",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 10.4,
    "taFareJmd": 190,
    "slug": "rose-hill-to-highgate"
  },
  {
    "origin": "Seaton",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 13,
    "taFareJmd": 200,
    "slug": "seaton-to-highgate"
  },
  {
    "origin": "Zion Hill",
    "destination": "Highgate",
    "parish": "St. Mary",
    "distanceKm": 4.9,
    "taFareJmd": 150,
    "slug": "zion-hill-to-highgate"
  },
  {
    "origin": "Bailey's Vale",
    "destination": "Oracabessa",
    "parish": "St. Mary",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "bailey-s-vale-to-oracabessa"
  },
  {
    "origin": "Jacks River",
    "destination": "Oracabessa",
    "parish": "St. Mary",
    "distanceKm": 3.4,
    "taFareJmd": 140,
    "slug": "jacks-river-to-oracabessa"
  },
  {
    "origin": "Hamilton",
    "destination": "Oracabessa",
    "parish": "St. Mary",
    "distanceKm": 3.5,
    "taFareJmd": 140,
    "slug": "hamilton-to-oracabessa"
  },
  {
    "origin": "Albion Mountain",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 6.7,
    "taFareJmd": 160,
    "slug": "albion-mountain-to-port-maria"
  },
  {
    "origin": "Bailey's Vale",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "bailey-s-vale-to-port-maria"
  },
  {
    "origin": "Bonny Gate",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 12.6,
    "taFareJmd": 200,
    "slug": "bonny-gate-to-port-maria"
  },
  {
    "origin": "Free Hill",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 7.3,
    "taFareJmd": 160,
    "slug": "free-hill-to-port-maria"
  },
  {
    "origin": "Gayle",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 21.5,
    "taFareJmd": 260,
    "slug": "gayle-to-port-maria"
  },
  {
    "origin": "Geddes Town",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "geddes-town-to-port-maria"
  },
  {
    "origin": "Hampstead",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 9.8,
    "taFareJmd": 180,
    "slug": "hampstead-to-port-maria"
  },
  {
    "origin": "Heywood Hall",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 10,
    "taFareJmd": 180,
    "slug": "heywood-hall-to-port-maria"
  },
  {
    "origin": "Highgate",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "highgate-to-port-maria"
  },
  {
    "origin": "Islington",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 12.2,
    "taFareJmd": 200,
    "slug": "islington-to-port-maria"
  },
  {
    "origin": "Oracabessa",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 11.3,
    "taFareJmd": 190,
    "slug": "oracabessa-to-port-maria"
  },
  {
    "origin": "Oxford",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 7.5,
    "taFareJmd": 170,
    "slug": "oxford-to-port-maria"
  },
  {
    "origin": "Sandside",
    "destination": "Port Maria",
    "parish": "St. Mary",
    "distanceKm": 3.2,
    "taFareJmd": 140,
    "slug": "sandside-to-port-maria"
  },
  {
    "origin": "Fellowship Hall",
    "destination": "Stewart",
    "parish": "St. Mary",
    "distanceKm": 6.1,
    "taFareJmd": 160,
    "slug": "fellowship-hall-to-stewart"
  },
  {
    "origin": "Rodney Hall",
    "destination": "Buff Bay",
    "parish": "Portland",
    "distanceKm": 11.8,
    "taFareJmd": 200,
    "slug": "rodney-hall-to-buff-bay"
  },
  {
    "origin": "Skibo",
    "destination": "Buff Bay",
    "parish": "Portland",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "skibo-to-buff-bay"
  },
  {
    "origin": "Wakesfield",
    "destination": "Buff Bay",
    "parish": "Portland",
    "distanceKm": 17.6,
    "taFareJmd": 240,
    "slug": "wakesfield-to-buff-bay"
  },
  {
    "origin": "Anchovy",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 3.5,
    "taFareJmd": 140,
    "slug": "anchovy-to-port-antonio"
  },
  {
    "origin": "Boston",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 15.6,
    "taFareJmd": 220,
    "slug": "boston-to-port-antonio"
  },
  {
    "origin": "Boundbrook",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 2.9,
    "taFareJmd": 130,
    "slug": "boundbrook-to-port-antonio"
  },
  {
    "origin": "Berrydale",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 11.2,
    "taFareJmd": 190,
    "slug": "berrydale-to-port-antonio"
  },
  {
    "origin": "Comfort Castle",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 22.5,
    "taFareJmd": 270,
    "slug": "comfort-castle-to-port-antonio"
  },
  {
    "origin": "Cornwall Barracks",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "cornwall-barracks-to-port-antonio"
  },
  {
    "origin": "Drapers Heights",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "drapers-heights-to-port-antonio"
  },
  {
    "origin": "Fair Prospect",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "fair-prospect-to-port-antonio"
  },
  {
    "origin": "Fellowship",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "fellowship-to-port-antonio"
  },
  {
    "origin": "Flat Grass",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 41,
    "taFareJmd": 400,
    "slug": "flat-grass-to-port-antonio"
  },
  {
    "origin": "Fruitfull Vale",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 26.3,
    "taFareJmd": 300,
    "slug": "fruitfull-vale-to-port-antonio"
  },
  {
    "origin": "Hope Bay",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 16.3,
    "taFareJmd": 230,
    "slug": "hope-bay-to-port-antonio"
  },
  {
    "origin": "Kensington",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 32.7,
    "taFareJmd": 340,
    "slug": "kensington-to-port-antonio"
  },
  {
    "origin": "Long Bay",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 25.9,
    "taFareJmd": 290,
    "slug": "long-bay-to-port-antonio"
  },
  {
    "origin": "Long Road",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 36.2,
    "taFareJmd": 370,
    "slug": "long-road-to-port-antonio"
  },
  {
    "origin": "Manchioneal",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 34.3,
    "taFareJmd": 350,
    "slug": "manchioneal-to-port-antonio"
  },
  {
    "origin": "Millbank",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 24.5,
    "taFareJmd": 280,
    "slug": "millbank-to-port-antonio"
  },
  {
    "origin": "Moore Town",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "moore-town-to-port-antonio"
  },
  {
    "origin": "Mount Pleasant",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 21.7,
    "taFareJmd": 260,
    "slug": "mount-pleasant-to-port-antonio"
  },
  {
    "origin": "Nonsuch",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 11,
    "taFareJmd": 190,
    "slug": "nonsuch-to-port-antonio"
  },
  {
    "origin": "Orange Bay",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 25.6,
    "taFareJmd": 290,
    "slug": "orange-bay-to-port-antonio"
  },
  {
    "origin": "Rio Grande Valley",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "rio-grande-valley-to-port-antonio"
  },
  {
    "origin": "Rock Hall",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 26.4,
    "taFareJmd": 300,
    "slug": "rock-hall-to-port-antonio"
  },
  {
    "origin": "Scotts Run",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 39.7,
    "taFareJmd": 390,
    "slug": "scotts-run-to-port-antonio"
  },
  {
    "origin": "Sherwood Forest",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 16,
    "taFareJmd": 230,
    "slug": "sherwood-forest-to-port-antonio"
  },
  {
    "origin": "Shot Over",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "shot-over-to-port-antonio"
  },
  {
    "origin": "Shrewsbury",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 24.2,
    "taFareJmd": 280,
    "slug": "shrewsbury-to-port-antonio"
  },
  {
    "origin": "Skibo",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 31,
    "taFareJmd": 330,
    "slug": "skibo-to-port-antonio"
  },
  {
    "origin": "Stony Hill",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 4.5,
    "taFareJmd": 140,
    "slug": "stony-hill-to-port-antonio"
  },
  {
    "origin": "Snow Hill",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 8,
    "taFareJmd": 170,
    "slug": "snow-hill-to-port-antonio"
  },
  {
    "origin": "Springbank",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 3.5,
    "taFareJmd": 140,
    "slug": "springbank-to-port-antonio"
  },
  {
    "origin": "Swift River",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 24.2,
    "taFareJmd": 280,
    "slug": "swift-river-to-port-antonio"
  },
  {
    "origin": "Windsor",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 11.2,
    "taFareJmd": 190,
    "slug": "windsor-to-port-antonio"
  },
  {
    "origin": "Windsor Forrest",
    "destination": "Port Antonio",
    "parish": "Portland",
    "distanceKm": 22.2,
    "taFareJmd": 270,
    "slug": "windsor-forrest-to-port-antonio"
  },
  {
    "origin": "Aelous Valley",
    "destination": "Albion",
    "parish": "St. Thomas",
    "distanceKm": 13.4,
    "taFareJmd": 210,
    "slug": "aelous-valley-to-albion"
  },
  {
    "origin": "Bath",
    "destination": "Golden Grove",
    "parish": "St. Thomas",
    "distanceKm": 16.5,
    "taFareJmd": 230,
    "slug": "bath-to-golden-grove"
  },
  {
    "origin": "Rowlandsfield",
    "destination": "Golden Grove",
    "parish": "St. Thomas",
    "distanceKm": 7.5,
    "taFareJmd": 170,
    "slug": "rowlandsfield-to-golden-grove"
  },
  {
    "origin": "Wheelerfield",
    "destination": "Golden Grove",
    "parish": "St. Thomas",
    "distanceKm": 4.4,
    "taFareJmd": 140,
    "slug": "wheelerfield-to-golden-grove"
  },
  {
    "origin": "Albion",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 21,
    "taFareJmd": 260,
    "slug": "albion-to-morant-bay"
  },
  {
    "origin": "Arcadia",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 18.5,
    "taFareJmd": 240,
    "slug": "arcadia-to-morant-bay"
  },
  {
    "origin": "Bachelor's Hall",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 32,
    "taFareJmd": 340,
    "slug": "bachelor-s-hall-to-morant-bay"
  },
  {
    "origin": "Barking Lodge",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 30,
    "taFareJmd": 320,
    "slug": "barking-lodge-to-morant-bay"
  },
  {
    "origin": "Bath",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 24.1,
    "taFareJmd": 280,
    "slug": "bath-to-morant-bay"
  },
  {
    "origin": "Cedar Valley",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 28,
    "taFareJmd": 310,
    "slug": "cedar-valley-to-morant-bay"
  },
  {
    "origin": "Content",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 27,
    "taFareJmd": 300,
    "slug": "content-to-morant-bay"
  },
  {
    "origin": "Dalvey",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 24.1,
    "taFareJmd": 280,
    "slug": "dalvey-to-morant-bay"
  },
  {
    "origin": "Danvers Pen",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 12.8,
    "taFareJmd": 200,
    "slug": "danvers-pen-to-morant-bay"
  },
  {
    "origin": "Duhaney Pen",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 2.8,
    "taFareJmd": 130,
    "slug": "duhaney-pen-to-morant-bay"
  },
  {
    "origin": "Easington",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 30,
    "taFareJmd": 320,
    "slug": "easington-to-morant-bay"
  },
  {
    "origin": "Font Hill",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "font-hill-to-morant-bay"
  },
  {
    "origin": "Golden Grove",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 22.7,
    "taFareJmd": 270,
    "slug": "golden-grove-to-morant-bay"
  },
  {
    "origin": "Golden Valley",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 22.4,
    "taFareJmd": 270,
    "slug": "golden-valley-to-morant-bay"
  },
  {
    "origin": "Hillside",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 15,
    "taFareJmd": 220,
    "slug": "hillside-to-morant-bay"
  },
  {
    "origin": "Johns Town",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 5.6,
    "taFareJmd": 150,
    "slug": "johns-town-to-morant-bay"
  },
  {
    "origin": "Llandewey",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 34,
    "taFareJmd": 350,
    "slug": "llandewey-to-morant-bay"
  },
  {
    "origin": "Lloyds",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 24.1,
    "taFareJmd": 280,
    "slug": "lloyds-to-morant-bay"
  },
  {
    "origin": "Middleton",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "middleton-to-morant-bay"
  },
  {
    "origin": "Needham Pen",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 7.5,
    "taFareJmd": 170,
    "slug": "needham-pen-to-morant-bay"
  },
  {
    "origin": "New Pera",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 14.4,
    "taFareJmd": 210,
    "slug": "new-pera-to-morant-bay"
  },
  {
    "origin": "Nutts River",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 4.5,
    "taFareJmd": 140,
    "slug": "nutts-river-to-morant-bay"
  },
  {
    "origin": "Pear Tree River",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 15.5,
    "taFareJmd": 220,
    "slug": "pear-tree-river-to-morant-bay"
  },
  {
    "origin": "Pomfret",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 12,
    "taFareJmd": 200,
    "slug": "pomfret-to-morant-bay"
  },
  {
    "origin": "Port Morant",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 11.5,
    "taFareJmd": 190,
    "slug": "port-morant-to-morant-bay"
  },
  {
    "origin": "Prospect",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 8.1,
    "taFareJmd": 170,
    "slug": "prospect-to-morant-bay"
  },
  {
    "origin": "Ramble",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 38.6,
    "taFareJmd": 380,
    "slug": "ramble-to-morant-bay"
  },
  {
    "origin": "Retreat",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 6,
    "taFareJmd": 160,
    "slug": "retreat-to-morant-bay"
  },
  {
    "origin": "Rocky Point",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 15.6,
    "taFareJmd": 220,
    "slug": "rocky-point-to-morant-bay"
  },
  {
    "origin": "Rowlandfield",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 26.8,
    "taFareJmd": 300,
    "slug": "rowlandfield-to-morant-bay"
  },
  {
    "origin": "Seaforth",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "seaforth-to-morant-bay"
  },
  {
    "origin": "Spring Gardens",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 6.4,
    "taFareJmd": 160,
    "slug": "spring-gardens-to-morant-bay"
  },
  {
    "origin": "Sunning Hill",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 23.8,
    "taFareJmd": 280,
    "slug": "sunning-hill-to-morant-bay"
  },
  {
    "origin": "Trinityville",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 19.3,
    "taFareJmd": 250,
    "slug": "trinityville-to-morant-bay"
  },
  {
    "origin": "Wheelerfield",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 30.4,
    "taFareJmd": 330,
    "slug": "wheelerfield-to-morant-bay"
  },
  {
    "origin": "White Hall",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 9.7,
    "taFareJmd": 180,
    "slug": "white-hall-to-morant-bay"
  },
  {
    "origin": "White Horses",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 9,
    "taFareJmd": 180,
    "slug": "white-horses-to-morant-bay"
  },
  {
    "origin": "Wilmington",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 8.5,
    "taFareJmd": 170,
    "slug": "wilmington-to-morant-bay"
  },
  {
    "origin": "Winchester",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 19.1,
    "taFareJmd": 250,
    "slug": "winchester-to-morant-bay"
  },
  {
    "origin": "Yallahs",
    "destination": "Morant Bay",
    "parish": "St. Thomas",
    "distanceKm": 19,
    "taFareJmd": 250,
    "slug": "yallahs-to-morant-bay"
  },
  {
    "origin": "Aelous Valley",
    "destination": "Yallahs",
    "parish": "St. Thomas",
    "distanceKm": 8.4,
    "taFareJmd": 170,
    "slug": "aelous-valley-to-yallahs"
  },
  {
    "origin": "Llandewey",
    "destination": "Yallahs",
    "parish": "St. Thomas",
    "distanceKm": 11.3,
    "taFareJmd": 190,
    "slug": "llandewey-to-yallahs"
  },
  {
    "origin": "Lloyds",
    "destination": "Yallahs",
    "parish": "St. Thomas",
    "distanceKm": 4.5,
    "taFareJmd": 140,
    "slug": "lloyds-to-yallahs"
  },
  {
    "origin": "Norris",
    "destination": "Yallahs",
    "parish": "St. Thomas",
    "distanceKm": 7,
    "taFareJmd": 160,
    "slug": "norris-to-yallahs"
  },
  {
    "origin": "Ramble",
    "destination": "Yallahs",
    "parish": "St. Thomas",
    "distanceKm": 18,
    "taFareJmd": 240,
    "slug": "ramble-to-yallahs"
  },
  {
    "origin": "Swamp Road",
    "destination": "Yallahs",
    "parish": "St. Thomas",
    "distanceKm": 5.7,
    "taFareJmd": 150,
    "slug": "swamp-road-to-yallahs"
  }
];
