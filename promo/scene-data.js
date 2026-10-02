// scene-data.js
// Content for the three showcase Workshops. Mod names, authors and art are
// invented placeholders; only the game names and app IDs are real.

window.SCENE_DATA = {
    games: [
        {
            id: 'rw',
            tab: 'Steam Workshop :: RimWorld',
            url: 'steamcommunity.com/app/294100/workshop/',
            title: 'RimWorld Workshop',
            subtitle: 'Mods and scenarios for RimWorld.',
            search: 'Search RimWorld',
            entries: '32,929',
            categories: ['Mod', 'Translation', 'Scenario', '1.4', '1.5', '1.6', 'Biotech', 'Ideology'],
            cards: [
                { title: 'Stockpile Labels', author: 'Marrow', stars: 5, sub: false, art: { kind: 'colony', hue: 30, label: 'STOCKPILE LABELS' } },
                { title: 'Quiet Colonists', author: 'Ennis', stars: 5, sub: true, art: { kind: 'emblem', hue: 200, icon: 'moon', label: 'QUIET' } },
                { title: 'Wall Lights Redux', author: 'Tallow', stars: 4, sub: true, art: { kind: 'emblem', hue: 42, icon: 'bulb', label: 'WALL LIGHTS' } },
                { title: 'Faction Banners', author: 'Oaken', stars: 5, sub: false, art: { kind: 'planet', hue: 18, label: 'FACTION BANNERS' } },
                { title: 'Smarter Haulers', author: 'Pike & Co', stars: 4, sub: true, art: { kind: 'colony', hue: 95, label: 'SMARTER HAULERS' } },
                { title: 'Field Medicine Plus', author: 'Dr. Vasquez', stars: 5, sub: false, art: { kind: 'emblem', hue: 355, icon: 'cross', label: 'FIELD MEDICINE' } },
                { title: 'Turret Overhaul', author: 'Kestrel', stars: 4, sub: false, art: { kind: 'colony', hue: 12, label: 'TURRETS' } },
                { title: 'Hydroponics+', author: 'Greenroot', stars: 5, sub: true, art: { kind: 'emblem', hue: 120, icon: 'leaf', label: 'HYDROPONICS+' } },
                { title: 'Mood Tracker', author: 'Sable', stars: 4, sub: false, art: { kind: 'planet', hue: 265, label: 'MOOD TRACKER' } },
                { title: 'Better Bedrolls', author: 'Hearth', stars: 4, sub: true, art: { kind: 'colony', hue: 48, label: 'BEDROLLS' } },
                { title: 'Caravan Planner', author: 'Wayfarer', stars: 5, sub: false, art: { kind: 'planet', hue: 190, label: 'CARAVANS' } },
                { title: 'Deep Drill Tweaks', author: 'Bedrock', stars: 4, sub: false, art: { kind: 'emblem', hue: 25, icon: 'gear', label: 'DEEP DRILL' } }
            ]
        },
        {
            id: 'pz',
            tab: 'Steam Workshop :: Project Zomboid',
            url: 'steamcommunity.com/app/108600/workshop/',
            title: 'Project Zomboid Workshop',
            subtitle: 'Maps, mods and tools for Project Zomboid.',
            search: 'Search Project Zomboid',
            entries: '41,377',
            categories: ['Build 41', 'Build 42', 'Map', 'Items', 'Vehicles', 'Weapons', 'Textures', 'Multiplayer'],
            cards: [
                { title: 'Barricade Overhaul', author: 'Knoxboy', stars: 5, art: { kind: 'night', hue: 140, label: 'BARRICADES' } },
                { title: 'Car Radio Plus', author: 'Static', stars: 3, art: { kind: 'stamp', hue: 40, label: 'CAR RADIO' } },
                { title: 'Survivor Journals', author: 'Inkwell', stars: 4, art: { kind: 'stamp', hue: 25, label: 'JOURNALS' } },
                { title: 'Map Markers Pro', author: 'Cartograph', stars: 5, art: { kind: 'map', hue: 0, label: 'MAP MARKERS' } },
                { title: 'Rusty Bikes', author: 'Gearhead', stars: 2, art: { kind: 'night', hue: 20, label: 'RUSTY BIKES' } },
                { title: 'Canned Food Pack', author: 'Pantry', stars: 4, art: { kind: 'stamp', hue: 0, label: 'CANNED FOOD' } },
                { title: 'Generator Range', author: 'Wattson', stars: 5, art: { kind: 'night', hue: 55, label: 'GENERATORS' } },
                { title: 'Loud Doors', author: 'Hinge', stars: 3, art: { kind: 'map', hue: 30, label: 'LOUD DOORS' } },
                { title: 'Sprinter Alerts', author: 'Nightowl', stars: 4, art: { kind: 'night', hue: 0, label: 'SPRINTERS' } },
                { title: 'Farmhouse Map', author: 'Riverside', stars: 5, art: { kind: 'map', hue: 100, label: 'FARMHOUSE' } },
                { title: 'Old Shotgun Skins', author: 'Buckshot', stars: 1, art: { kind: 'stamp', hue: 15, label: 'SHOTGUNS' } },
                { title: 'Better Lockpicking', author: 'Tumbler', stars: 4, art: { kind: 'night', hue: 200, label: 'LOCKPICKING' } }
            ]
        },
        {
            id: 'cs',
            tab: 'Steam Workshop :: Cities: Skylines II',
            url: 'steamcommunity.com/app/949230/workshop/',
            title: 'Cities: Skylines II Workshop',
            subtitle: 'Assets, maps and saves for Cities: Skylines II.',
            search: 'Search Cities: Skylines II',
            entries: '12,408',
            categories: ['Mods', 'Assets', 'Maps', 'Saves', 'Roads', 'Buildings', 'Props', 'Vehicles'],
            cards: [
                { title: 'Traffic Flow Tools', author: 'Gridlock', stars: 5, art: { kind: 'roads', hue: 200, label: 'TRAFFIC FLOW' } },
                { title: 'Harbor District', author: 'Pier 9', stars: 5, art: { kind: 'iso', hue: 195, label: 'HARBOR' } },
                { title: 'Transit Lines+', author: 'Metroline', stars: 4, art: { kind: 'transit', hue: 0, label: 'TRANSIT+' } },
                { title: 'Bike Lane Kit', author: 'Spoke', stars: 4, art: { kind: 'roads', hue: 150, label: 'BIKE LANES' } },
                { title: 'Night Lighting', author: 'Lumen', stars: 5, art: { kind: 'iso', hue: 250, label: 'NIGHT LIGHTS' } },
                { title: 'Zoning Toolkit', author: 'Planner', stars: 4, art: { kind: 'transit', hue: 120, label: 'ZONING' } },
                { title: 'Park Assets Pack', author: 'Greenway', stars: 5, art: { kind: 'iso', hue: 110, label: 'PARKS' } },
                { title: 'Roundabout Builder', author: 'Circuit', stars: 4, art: { kind: 'roads', hue: 30, label: 'ROUNDABOUTS' } },
                // Second batch arrives through infinite scroll; non-matching
                // items are dropped by the filters as they load.
                { title: 'Bus Depot Kit', author: 'Route 66', stars: 5, batch: 1, art: { kind: 'transit', hue: 45, label: 'BUS DEPOT' } },
                { title: 'Old Town Facades', author: 'Brick', stars: 2, batch: 1, art: { kind: 'iso', hue: 20, label: 'OLD TOWN' } },
                { title: 'Tram Network', author: 'Overhead', stars: 4, batch: 1, art: { kind: 'transit', hue: 300, label: 'TRAMS' } },
                { title: 'Coastal Map', author: 'Tidewater', stars: 5, batch: 1, sub: true, art: { kind: 'roads', hue: 185, label: 'COASTAL' } },
                { title: 'Highway Ramps', author: 'Interchange', stars: 5, batch: 1, art: { kind: 'roads', hue: 210, label: 'RAMPS' } },
                { title: 'Suburb Houses', author: 'Cul-de-sac', stars: 3, batch: 1, art: { kind: 'iso', hue: 35, label: 'SUBURBS' } },
                { title: 'Cargo Rail Hub', author: 'Freight', stars: 4, batch: 1, art: { kind: 'transit', hue: 200, label: 'CARGO RAIL' } },
                { title: 'Skyline Towers', author: 'Vertical', stars: 5, batch: 1, art: { kind: 'iso', hue: 215, label: 'TOWERS' } }
            ]
        }
    ],
    starOptions: ['Show All', '5 Stars Only', '4+ Stars', '3+ Stars', '2+ Stars', '1+ Stars'],
    sortLabel: 'Most Popular (One Week)'
};
