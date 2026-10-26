// Rolls up the TRI national file (one row per facility per chemical)
// into one GeoJSON point per facility, with total air releases in pounds.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const INPUT = 'data-raw/tri-us.csv';
const OUTPUT = 'public/data/tri-facilities.geojson';
const GRAMS_PER_POUND = 453.592;

// Headers look like "12. LATITUDE", so strip the leading number
const rows = parse(readFileSync(INPUT), {
  columns: (header) => header.map((h) => h.replace(/^\d+\.\s*/, '').trim()),
  skip_empty_lines: true,
  relax_column_count: true,
});

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const facilities = new Map();
let year = null;

for (const r of rows) {
  const lat = parseFloat(r['LATITUDE']);
  const lon = parseFloat(r['LONGITUDE']);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  year ??= r['YEAR'];

  // Dioxins are reported in grams; convert everything to pounds
  const toLbs = r['UNIT OF MEASURE']?.toLowerCase().startsWith('gram')
    ? (v) => v / GRAMS_PER_POUND
    : (v) => v;

  const air = toLbs(num(r['5.1 - FUGITIVE AIR']) + num(r['5.2 - STACK AIR']));
  const onsite = toLbs(num(r['ON-SITE RELEASE TOTAL']));

  const id = r['TRIFD'];
  if (!facilities.has(id)) {
    facilities.set(id, {
      id,
      name: r['FACILITY NAME'],
      city: r['CITY'],
      county: r['COUNTY'],
      state: r['ST'],
      sector: r['INDUSTRY SECTOR'],
      lat,
      lon,
      air_lbs: 0,
      onsite_lbs: 0,
      chems: new Map(), // chemical -> air lbs
    });
  }

  const f = facilities.get(id);
  f.air_lbs += air;
  f.onsite_lbs += onsite;
  f.chems.set(r['CHEMICAL'], (f.chems.get(r['CHEMICAL']) ?? 0) + air);
}

const features = [...facilities.values()]
  .map((f) => {
    const topChems = [...f.chems.entries()]
      .filter(([, lbs]) => lbs > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
      .join('; ');

    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(f.lon.toFixed(5)), Number(f.lat.toFixed(5))],
      },
      properties: {
        id: f.id,
        name: f.name,
        city: f.city,
        county: f.county,
        state: f.state,
        sector: f.sector,
        air_lbs: Math.round(f.air_lbs),
        onsite_lbs: Math.round(f.onsite_lbs),
        chem_count: f.chems.size,
        top_air_chems: topChems,
      },
    };
  })
  // Biggest emitters last, so they draw on top of smaller ones
  .sort((a, b) => a.properties.air_lbs - b.properties.air_lbs);

writeFileSync(OUTPUT, JSON.stringify({ type: 'FeatureCollection', features }));

// Summary stats to help pick circle sizes and heatmap weights
const airValues = features.map((f) => f.properties.air_lbs).filter((v) => v > 0).sort((a, b) => a - b);
const pct = (p) => airValues[Math.floor((p / 100) * (airValues.length - 1))];
const sectors = new Map();
for (const f of features) sectors.set(f.properties.sector, (sectors.get(f.properties.sector) ?? 0) + 1);

console.log(`Reporting year: ${year}`);
console.log(`Input rows: ${rows.length}`);
console.log(`Facilities written: ${features.length}`);
console.log(`Facilities with air releases > 0: ${airValues.length}`);
console.log(`Air lbs percentiles - 50th: ${pct(50)}, 90th: ${pct(90)}, 99th: ${pct(99)}, max: ${airValues.at(-1)}`);
console.log('Top 10 sectors by facility count:');
[...sectors.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([s, n]) => console.log(`  ${n}  ${s}`));
console.log(`Wrote ${OUTPUT}`);