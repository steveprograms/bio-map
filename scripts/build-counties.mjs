// Builds the county data the map uses:
//   public/data/counties.geojson  county shapes + every measure as properties
//   public/data/measures.json     what each measure is, where it comes from, and its value range
//
// Inputs:
//   public/data/us-counties.geojson    Census county shapes (from the mapshaper step)
//   data-raw/places-county-all.csv     CDC PLACES county data, all measures, age-adjusted
//   data-raw/svi-2022-county.csv       CDC/ATSDR Social Vulnerability Index 2022, US counties
//
// Each dataset adds measures to the same county table. TRI totals come next.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const SHAPES = 'public/data/us-counties.geojson';
const PLACES_CSV = 'data-raw/places-county-all.csv';
const SVI_CSV = 'data-raw/svi-2022-county.csv';
const OUT_COUNTIES = 'public/data/counties.geojson';
const OUT_MEASURES = 'public/data/measures.json';

// Empty, non-numeric, and SVI's -999 "missing" values become null (shown as "No data")
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > -999 ? n : null;
};

// Value at a percentile of a sorted array
const percentile = (sorted, p) => sorted[Math.round((p / 100) * (sorted.length - 1))];

const readCsv = (path) => parse(readFileSync(path), { columns: true, skip_empty_lines: true });

const measures = new Map(); // measure id -> metadata + all county values (in the order added)
const byCounty = new Map(); // county FIPS -> properties to add

function countyProps(fips) {
  if (!byCounty.has(fips)) byCounty.set(fips, {});
  return byCounty.get(fips);
}

function addValue(measureId, fips, value, low = null, high = null) {
  if (value === null) return;
  const props = countyProps(fips);
  props[measureId] = value;
  if (low !== null) props[`${measureId}_lo`] = low;
  if (high !== null) props[`${measureId}_hi`] = high;
  measures.get(measureId).values.push(value);
}

// ---------- CDC PLACES ----------

// Clearer names for a few PLACES measures whose short names are misleading
const PLACES_SHORT_NAMES = {
  ACCESS2: 'No Health Insurance (18–64)',
  GHLTH: 'Fair or Poor Health',
};

const placesRows = readCsv(PLACES_CSV);
const placesMeasureIds = [];

for (const r of placesRows) {
  const id = r.measureid;
  if (!id) continue;
  if (r.locationid.length !== 5) continue; // skip non-county rows (e.g. the national total)

  if (!measures.has(id)) {
    measures.set(id, {
      id,
      name: r.measure,
      short: PLACES_SHORT_NAMES[id] ?? r.short_question_text,
      category: r.category,
      source: 'CDC PLACES, 2025 release',
      valueType: 'Age-adjusted prevalence',
      year: Number(r.year),
      period: r.year,
      unit: r.data_value_unit || '%',
      values: [],
    });
    placesMeasureIds.push(id);
  }

  // locationid is the 5-digit county FIPS code; parsed as text, so leading zeros are kept
  countyProps(r.locationid).STUSPS ??= r.stateabbr;
  addValue(id, r.locationid, num(r.data_value), num(r.low_confidence_limit), num(r.high_confidence_limit));
}

// ---------- CDC/ATSDR Social Vulnerability Index 2022 ----------

const SVI_SOURCE = 'CDC/ATSDR Social Vulnerability Index 2022';
const SVI_PERIOD = '2018–2022';

// Percentile ranks among US counties, 0 (least vulnerable) to 1 (most vulnerable)
const SVI_THEMES = [
  ['RPL_THEMES', 'Overall SVI', 'Overall social vulnerability'],
  ['RPL_THEME1', 'Socioeconomic Status', 'SVI theme 1: Socioeconomic status'],
  ['RPL_THEME2', 'Household Characteristics', 'SVI theme 2: Household characteristics'],
  ['RPL_THEME3', 'Racial & Ethnic Minority Status', 'SVI theme 3: Racial and ethnic minority status'],
  ['RPL_THEME4', 'Housing Type & Transportation', 'SVI theme 4: Housing type and transportation'],
];

// Percentages from the American Community Survey 5-year estimates
const SVI_INDICATORS = [
  ['EP_POV150', 'Below 150% of Poverty', 'Persons below 150% of the federal poverty level'],
  ['EP_UNEMP', 'Unemployed', 'Civilians (age 16+) who are unemployed'],
  ['EP_HBURD', 'Housing Cost Burden', 'Households with income under $75,000 spending 30% or more on housing'],
  ['EP_NOHSDP', 'No High School Diploma', 'Persons (age 25+) with no high school diploma'],
  ['EP_UNINSUR', 'Uninsured (all ages)', 'Civilians with no health insurance'],
  ['EP_AGE65', 'Age 65 and Older', 'Persons aged 65 and older'],
  ['EP_AGE17', 'Age 17 and Younger', 'Persons aged 17 and younger'],
  ['EP_DISABL', 'With a Disability', 'Civilians with a disability'],
  ['EP_SNGPNT', 'Single-Parent Households', 'Single-parent households with children under 18'],
  ['EP_LIMENG', 'Limited English', 'Persons (age 5+) who speak English "less than well"'],
  ['EP_MINRTY', 'Racial & Ethnic Minority', 'Persons who are Hispanic or Latino or a race other than White'],
  ['EP_MUNIT', 'Multi-Unit Housing', 'Housing units in structures with 10 or more units'],
  ['EP_MOBILE', 'Mobile Homes', 'Housing units that are mobile homes'],
  ['EP_CROWD', 'Crowded Housing', 'Occupied housing units with more people than rooms'],
  ['EP_NOVEH', 'No Vehicle', 'Households with no vehicle available'],
  ['EP_GROUPQ', 'Group Quarters', 'Persons living in group quarters'],
];

for (const [id, short, name] of SVI_THEMES) {
  measures.set(id, {
    id,
    name,
    short,
    category: 'Social Vulnerability: Overall and Themes',
    source: SVI_SOURCE,
    valueType: 'Percentile rank among US counties (higher = more vulnerable)',
    year: 2022,
    period: SVI_PERIOD,
    unit: '',
    values: [],
  });
}
for (const [id, short, name] of SVI_INDICATORS) {
  measures.set(id, {
    id,
    name,
    short,
    category: 'Social Vulnerability: Indicators',
    source: SVI_SOURCE,
    valueType: 'Percent, American Community Survey 5-year estimate',
    year: 2022,
    period: SVI_PERIOD,
    unit: '%',
    values: [],
  });
}

const sviRows = readCsv(SVI_CSV);
for (const r of sviRows) {
  // Pad to 5 digits in case the file dropped leading zeros (1001 -> 01001)
  const fips = String(r.FIPS).trim().padStart(5, '0');
  const props = countyProps(fips);
  props.STUSPS ??= r.ST_ABBR;

  // Not a picker measure: population for weighting and per-capita rates later
  const population = num(r.E_TOTPOP);
  if (population !== null) props.POP = population;

  for (const [id] of [...SVI_THEMES, ...SVI_INDICATORS]) addValue(id, fips, num(r[id]));
}

// ---------- Join onto the county shapes ----------

const shapes = JSON.parse(readFileSync(SHAPES, 'utf8'));
const shapeFips = new Set(shapes.features.map((f) => f.properties.GEOID));

let matched = 0;
for (const feature of shapes.features) {
  const extra = byCounty.get(feature.properties.GEOID);
  if (extra) {
    Object.assign(feature.properties, extra);
    matched++;
  }
}

// ---------- Measure summaries for color scales and legends ----------

const summarize = ({ values, ...m }) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    ...m,
    counties: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    p05: percentile(sorted, 5),
    p95: percentile(sorted, 95),
  };
};

const all = [...measures.values()].filter((m) => m.values.length > 0);
const placesList = all
  .filter((m) => placesMeasureIds.includes(m.id))
  .map(summarize)
  .sort((a, b) => a.category.localeCompare(b.category) || a.short.localeCompare(b.short));
const sviList = all.filter((m) => !placesMeasureIds.includes(m.id)).map(summarize); // keep SVI's own order
const measureList = [...placesList, ...sviList];

writeFileSync(OUT_COUNTIES, JSON.stringify(shapes));
writeFileSync(OUT_MEASURES, JSON.stringify(measureList, null, 2));

// ---------- Report ----------

const unmatched = [...byCounty.keys()].filter((fips) => !shapeFips.has(fips));
const sviFips = new Set(sviRows.map((r) => String(r.FIPS).trim().padStart(5, '0')));
const sviMatched = [...sviFips].filter((fips) => shapeFips.has(fips)).length;
const mb = (path) => (statSync(path).size / 1e6).toFixed(1);
const show = (list) =>
  list.forEach((m) =>
    console.log(`  ${m.id.padEnd(12)} ${m.period.padEnd(9)} ${String(m.counties).padStart(4)}  ${m.p05}-${m.p95}${m.unit}  ${m.short}`)
  );

console.log(`PLACES rows read: ${placesRows.length}`);
console.log(`SVI rows read: ${sviRows.length} (matched to county shapes: ${sviMatched})`);
console.log(`Counties in shapes file: ${shapes.features.length}`);
console.log(`Counties with any data: ${matched}`);
console.log(`Counties with population: ${shapes.features.filter((f) => f.properties.POP != null).length}`);
console.log(
  `Data rows with no matching shape: ${unmatched.length}${unmatched.length ? ` (${unmatched.slice(0, 10).join(', ')}${unmatched.length > 10 ? ', ...' : ''})` : ''}`
);
console.log('');
console.log(`PLACES measures: ${placesList.length} (id, period, counties, 5th-95th percentile)`);
show(placesList);
console.log('');
console.log(`SVI measures: ${sviList.length}`);
show(sviList);
console.log('');
console.log(`Wrote ${OUT_COUNTIES} (${mb(OUT_COUNTIES)} MB)`);
console.log(`Wrote ${OUT_MEASURES}`);
