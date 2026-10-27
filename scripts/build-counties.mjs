// Builds the county data the map uses:
//   public/data/counties.geojson  county shapes + every PLACES health measure as properties
//   public/data/measures.json     what each measure is, its survey year, and its value range
//
// Inputs:
//   public/data/us-counties.geojson    Census county shapes (from the mapshaper step)
//   data-raw/places-county-all.csv     PLACES county data, all measures, age-adjusted
//
// Later datasets (Social Vulnerability Index, TRI totals) will be joined here too,
// so this file becomes the one place where per-county data comes together.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const SHAPES = 'public/data/us-counties.geojson';
const PLACES_CSV = 'data-raw/places-county-all.csv';
const OUT_COUNTIES = 'public/data/counties.geojson';
const OUT_MEASURES = 'public/data/measures.json';

// Empty or non-numeric values become null (shown as "No data" on the map)
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Value at a percentile of a sorted array
const percentile = (sorted, p) => sorted[Math.round((p / 100) * (sorted.length - 1))];

const shapes = JSON.parse(readFileSync(SHAPES, 'utf8'));
const rows = parse(readFileSync(PLACES_CSV), { columns: true, skip_empty_lines: true });

const measures = new Map(); // measure id -> metadata + all county values
const byCounty = new Map(); // county FIPS -> properties to add

for (const r of rows) {
  const id = r.measureid;
  if (!id) continue;
  if (r.locationid.length !== 5) continue; // skip non-county rows (e.g. the national total)

  if (!measures.has(id)) {
    measures.set(id, {
      id,
      name: r.measure,
      short: r.short_question_text,
      category: r.category,
      year: Number(r.year),
      unit: r.data_value_unit || '%',
      values: [],
    });
  }

  const value = num(r.data_value);
  if (value === null) continue;

  // locationid is the 5-digit county FIPS code; parsed as text, so leading zeros are kept
  const props = byCounty.get(r.locationid) ?? { STUSPS: r.stateabbr };
  props[id] = value;
  props[`${id}_lo`] = num(r.low_confidence_limit);
  props[`${id}_hi`] = num(r.high_confidence_limit);
  byCounty.set(r.locationid, props);

  measures.get(id).values.push(value);
}

// Join onto the county shapes
let matched = 0;
for (const feature of shapes.features) {
  const extra = byCounty.get(feature.properties.GEOID);
  if (extra) {
    Object.assign(feature.properties, extra);
    matched++;
  }
}

// Summaries used for color scales and legends
const measureList = [...measures.values()]
  .map(({ values, ...m }) => {
    const sorted = values.sort((a, b) => a - b);
    return {
      ...m,
      counties: sorted.length,
      min: sorted[0],
      max: sorted.at(-1),
      p05: percentile(sorted, 5),
      p95: percentile(sorted, 95),
    };
  })
  .filter((m) => m.counties > 0)
  .sort((a, b) => a.category.localeCompare(b.category) || a.short.localeCompare(b.short));

writeFileSync(OUT_COUNTIES, JSON.stringify(shapes));
writeFileSync(OUT_MEASURES, JSON.stringify(measureList, null, 2));

// Report
const unmatched = [...byCounty.keys()].filter((fips) => !shapes.features.some((f) => f.properties.GEOID === fips));
const mb = (path) => (statSync(path).size / 1e6).toFixed(1);

console.log(`PLACES rows read: ${rows.length}`);
console.log(`Measures: ${measureList.length}`);
console.log(`Counties in shapes file: ${shapes.features.length}`);
console.log(`Counties with PLACES data: ${matched}`);
console.log(`PLACES counties with no matching shape: ${unmatched.length}${unmatched.length ? ` (${unmatched.slice(0, 10).join(', ')}${unmatched.length > 10 ? ', ...' : ''})` : ''}`);
console.log('');
console.log('Measures (id, year, counties, 5th-95th percentile):');
for (const m of measureList) {
  console.log(`  ${m.id.padEnd(12)} ${m.year}  ${String(m.counties).padStart(4)}  ${m.p05}-${m.p95}${m.unit}  ${m.short}`);
}
console.log('');
console.log(`Wrote ${OUT_COUNTIES} (${mb(OUT_COUNTIES)} MB)`);
console.log(`Wrote ${OUT_MEASURES}`);
