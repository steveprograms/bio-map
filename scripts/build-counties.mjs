// Builds the county data the map uses:
//   public/data/counties.geojson  county shapes + every measure as properties
//   public/data/measures.json     what each measure is, where it comes from, and its value range
//
// Inputs:
//   public/data/us-counties.geojson    Census county shapes (from the mapshaper step)
//   data-raw/places-county-all.csv     CDC PLACES county data, all measures, age-adjusted
//   data-raw/svi-2022-county.csv       CDC/ATSDR Social Vulnerability Index 2022, US counties
//   public/data/tri-facilities.geojson EPA TRI facilities, tagged with county_fips (see "npm run data")
//   data-raw/pm25-county-year*.csv     CDC Tracking Network modeled PM2.5, summarized per county and year
//   data-raw/ozone-county-year*.csv    CDC Tracking Network modeled ozone, summarized per county and year
//   data-raw/ct-towns-2020.json        Connecticut town populations with their old counties (2020 Census)
//   data-raw/ct-towns-2022.json        Connecticut towns with their planning regions (2022 Census data)
//
// Each dataset adds measures to the same county table.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const SHAPES = 'public/data/us-counties.geojson';
const PLACES_CSV = 'data-raw/places-county-all.csv';
const SVI_CSV = 'data-raw/svi-2022-county.csv';
const TRI_GEOJSON = 'public/data/tri-facilities.geojson';
const CT_TOWNS_2020 = 'data-raw/ct-towns-2020.json';
const CT_TOWNS_2022 = 'data-raw/ct-towns-2022.json';
const AIR_FILES = {
  pm25: { means: 'data-raw/pm25-county-year.csv', highDays: 'data-raw/pm25-county-year-high.csv' },
  ozone: { means: 'data-raw/ozone-county-year.csv', highDays: 'data-raw/ozone-county-year-high.csv' },
};
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

// Each measure's role in analyses: an "outcome" (a health result), an "exposure" (an
// environmental factor), or a "covariate" (social, behavioral, or access context to adjust for).
// PLACES roles follow the PLACES category; anything unlisted is treated as a covariate.
const PLACES_OUTCOME_CATEGORIES = ['Health Outcomes', 'Health Status', 'Disability'];

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
      role: PLACES_OUTCOME_CATEGORIES.includes(r.category) ? 'outcome' : 'covariate',
      source: 'CDC PLACES, 2025 release',
      valueType: 'Age-adjusted prevalence',
      year: Number(r.year),
      period: r.year,
      unit: r.data_value_unit || '%',
      decimals: 1,
      scale: 'linear',
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
    role: 'covariate',
    source: SVI_SOURCE,
    valueType: 'Percentile rank among US counties (higher = more vulnerable)',
    year: 2022,
    period: SVI_PERIOD,
    unit: '',
    decimals: 2,
    scale: 'linear',
    values: [],
  });
}
for (const [id, short, name] of SVI_INDICATORS) {
  measures.set(id, {
    id,
    name,
    short,
    category: 'Social Vulnerability: Indicators',
    role: 'covariate',
    source: SVI_SOURCE,
    valueType: 'Percent, American Community Survey 5-year estimate',
    year: 2022,
    period: SVI_PERIOD,
    unit: '%',
    decimals: 1,
    scale: 'linear',
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

// ---------- EPA Toxics Release Inventory, summed per county ----------

const shapes = JSON.parse(readFileSync(SHAPES, 'utf8'));
const shapeFips = new Set(shapes.features.map((f) => f.properties.GEOID));

const tri = JSON.parse(readFileSync(TRI_GEOJSON, 'utf8'));
if (!tri.features.some((f) => f.properties.county_fips)) {
  throw new Error(
    `${TRI_GEOJSON} has no county_fips yet. Run the mapshaper join step first (it's part of "npm run data").`
  );
}

const TRI_SOURCE = 'EPA Toxics Release Inventory, 2024';
const triMeasure = (id, short, name, valueType, unit, decimals) =>
  measures.set(id, {
    id,
    name,
    short,
    category: 'Environment: Toxics Release Inventory',
    role: 'exposure',
    source: TRI_SOURCE,
    valueType,
    year: 2024,
    period: '2024',
    unit,
    decimals,
    scale: 'log', // a few counties release millions of pounds; most release little or none
    values: [],
  });
triMeasure('TRI_AIR_LBS', 'Toxic Air Releases', 'Reported toxic air releases (stack + fugitive)', 'Total pounds reported by TRI facilities in the county', ' lbs', 0);
triMeasure('TRI_AIR_PER_1K', 'Toxic Air Releases per 1,000 Residents', 'Reported toxic air releases per 1,000 residents', 'Pounds per 1,000 residents (population: ACS 2018–2022)', ' lbs', 1);
triMeasure('TRI_FACILITIES', 'TRI Facilities', 'Facilities reporting to the Toxics Release Inventory', 'Number of facilities in the county', '', 0);
const triMeasureIds = ['TRI_AIR_LBS', 'TRI_AIR_PER_1K', 'TRI_FACILITIES'];

const triByCounty = new Map(); // county FIPS -> { air, facilities }
let triUnassigned = 0;
for (const f of tri.features) {
  const fips = f.properties.county_fips;
  if (!fips) {
    triUnassigned++;
    continue;
  }
  const totals = triByCounty.get(fips) ?? { air: 0, facilities: 0 };
  totals.air += Number(f.properties.air_lbs) || 0;
  totals.facilities += 1;
  triByCounty.set(fips, totals);
}

// Every county gets a value: no TRI facility means 0 pounds reported, not missing data
for (const fips of shapeFips) {
  const { air, facilities } = triByCounty.get(fips) ?? { air: 0, facilities: 0 };
  addValue('TRI_AIR_LBS', fips, Math.round(air));
  addValue('TRI_FACILITIES', fips, facilities);
  const population = byCounty.get(fips)?.POP;
  if (population) addValue('TRI_AIR_PER_1K', fips, Math.round((air / population) * 1000 * 10) / 10);
}

// ---------- Connecticut: old counties -> planning regions ----------

// In 2022 Connecticut replaced its 8 counties (09001-09015) with 9 planning regions (09110-09190).
// Our county shapes use the regions; some datasets still use the old counties. Towns kept their
// codes and each sits in exactly one old county and one region, so town populations give
// population weights for translating old-county values to regions.

// Census API files are a header row followed by data rows
const readCensusJson = (path) => {
  const [header, ...rows] = JSON.parse(readFileSync(path, 'utf8'));
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i]])));
};

const ct = (() => {
  const regionOfTown = new Map(
    readCensusJson(CT_TOWNS_2022).map((r) => [r['county subdivision'], `09${r.county}`])
  );
  const weights = new Map(); // region FIPS -> Map(old county FIPS -> population)
  let towns = 0;
  const unmatchedTowns = [];
  for (const r of readCensusJson(CT_TOWNS_2020)) {
    const population = Number(r.P1_001N);
    if (!population) continue; // skips "county subdivisions not defined"
    const region = regionOfTown.get(r['county subdivision']);
    if (!region) {
      unmatchedTowns.push(r['county subdivision']);
      continue;
    }
    towns++;
    const regionWeights = weights.get(region) ?? new Map();
    const oldCounty = `09${r.county}`;
    regionWeights.set(oldCounty, (regionWeights.get(oldCounty) ?? 0) + population);
    weights.set(region, regionWeights);
  }
  return { weights, towns, unmatchedTowns };
})();

const isOldCtCounty = (fips) => /^090(0[1-9]|1[0-5])$/.test(fips);

// A planning region's value: the population-weighted average of its old counties' values.
// valueOf(oldCountyFips) returns a number, or null when that county has no value.
function ctRegionValue(region, valueOf) {
  let sum = 0;
  let population = 0;
  for (const [oldCounty, weight] of ct.weights.get(region) ?? []) {
    const value = valueOf(oldCounty);
    if (value === null || value === undefined) continue;
    sum += value * weight;
    population += weight;
  }
  return population ? sum / population : null;
}

// Copies of a { county FIPS -> value } map with Connecticut translated: old counties are
// replaced by planning regions (regions that already have a value keep it)
function withCtRegions(valuesByFips) {
  const result = new Map([...valuesByFips].filter(([fips]) => !isOldCtCounty(fips)));
  for (const region of ct.weights.keys()) {
    if (result.has(region)) continue;
    const value = ctRegionValue(region, (old) => valuesByFips.get(old) ?? null);
    if (value !== null) result.set(region, value);
  }
  return result;
}

// ---------- Modeled air quality (CDC Tracking Network, EPA Downscaler model) ----------

// The downloads hold one row per county per year: the average of that year's daily
// population-weighted predictions, how many days that covers, and (in the *-high file)
// how many days were above the threshold. Here we average across the years.
const AIR_SOURCE = 'CDC Environmental Public Health Tracking Network (EPA Downscaler model)';
const airFips = (r) => `${String(r.statefips).padStart(2, '0')}${String(r.countyfips).padStart(3, '0')}`;

const AIR_MEASURES = [
  {
    pollutant: 'pm25',
    avgId: 'PM25_AVG',
    highId: 'PM25_HIGH_DAYS',
    avgShort: 'PM2.5 (Annual Average)',
    avgName: 'Fine particulate matter (PM2.5), annual average',
    highShort: 'PM2.5 High Days',
    highName: 'Days per year with modeled PM2.5 above 35 µg/m³',
    unit: ' µg/m³',
  },
  {
    pollutant: 'ozone',
    avgId: 'O3_AVG',
    highId: 'O3_HIGH_DAYS',
    avgShort: 'Ozone (Average Daily Level)',
    avgName: 'Ozone, average daily modeled level',
    highShort: 'Ozone High Days',
    highName: 'Days per year with modeled ozone above 70 ppb',
    unit: ' ppb',
  },
];
const airMeasureIds = AIR_MEASURES.flatMap((a) => [a.avgId, a.highId]);
const airYears = new Set();
const airRowCounts = {};

for (const air of AIR_MEASURES) {
  const means = readCsv(AIR_FILES[air.pollutant].means);
  const highs = readCsv(AIR_FILES[air.pollutant].highDays);
  airRowCounts[air.pollutant] = { means: means.length, highDays: highs.length };

  // county FIPS -> { weighted sum of daily values, total days, years seen }
  const totals = new Map();
  for (const r of means) {
    const mean = num(r.mean);
    const days = num(r.days);
    if (mean === null || !days) continue;
    airYears.add(String(r.year));
    const t = totals.get(airFips(r)) ?? { sum: 0, days: 0, years: 0 };
    t.sum += mean * days;
    t.days += days;
    t.years += 1;
    totals.set(airFips(r), t);
  }
  // county FIPS -> total high days across the years (counties with none aren't listed)
  const highDays = new Map();
  for (const r of highs) highDays.set(airFips(r), (highDays.get(airFips(r)) ?? 0) + (num(r.high_days) ?? 0));

  const common = {
    category: 'Environment: Air Quality',
    role: 'exposure',
    source: AIR_SOURCE,
    year: 2022,
    period: '2020–2022',
  };
  measures.set(air.avgId, {
    ...common,
    id: air.avgId,
    name: air.avgName,
    short: air.avgShort,
    valueType: 'Modeled daily level, population-weighted within the county, averaged over 2020–2022',
    unit: air.unit,
    decimals: 1,
    scale: 'linear',
    values: [], // each measure needs its own list
  });
  measures.set(air.highId, {
    ...common,
    id: air.highId,
    name: air.highName,
    short: air.highShort,
    valueType: 'Average days per year over 2020–2022, from population-weighted daily county values',
    unit: ' days',
    decimals: 1,
    scale: 'log', // most counties have none or few; a few have many
    values: [], // each measure needs its own list
  });

  // Per-county values, then Connecticut's old counties translated to planning regions
  const averages = new Map();
  const highPerYear = new Map();
  for (const [fips, t] of totals) {
    averages.set(fips, t.sum / t.days);
    highPerYear.set(fips, (highDays.get(fips) ?? 0) / t.years);
  }
  for (const [fips, value] of withCtRegions(averages)) addValue(air.avgId, fips, Math.round(value * 10) / 10);
  for (const [fips, value] of withCtRegions(highPerYear)) addValue(air.highId, fips, Math.round(value * 10) / 10);
}

// ---------- Join onto the county shapes ----------

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
const triList = all.filter((m) => triMeasureIds.includes(m.id)).map(summarize);
const airList = all.filter((m) => airMeasureIds.includes(m.id)).map(summarize);
const sviList = all // keep SVI's own order
  .filter((m) => ![...placesMeasureIds, ...triMeasureIds, ...airMeasureIds].includes(m.id))
  .map(summarize);
const measureList = [...placesList, ...triList, ...airList, ...sviList];

writeFileSync(OUT_COUNTIES, JSON.stringify(shapes));
writeFileSync(OUT_MEASURES, JSON.stringify(measureList, null, 2));

// ---------- Report ----------

const unmatched = [...byCounty.keys()].filter((fips) => !shapeFips.has(fips));
const sviFips = new Set(sviRows.map((r) => String(r.FIPS).trim().padStart(5, '0')));
const sviMatched = [...sviFips].filter((fips) => shapeFips.has(fips)).length;
const mb = (path) => (statSync(path).size / 1e6).toFixed(1);
const show = (list) =>
  list.forEach((m) =>
    console.log(`  ${m.id.padEnd(15)} ${m.period.padEnd(9)} ${String(m.counties).padStart(4)}  ${m.p05}-${m.p95}${m.unit}  ${m.short}`)
  );

console.log(`PLACES rows read: ${placesRows.length}`);
console.log(`SVI rows read: ${sviRows.length} (matched to county shapes: ${sviMatched})`);
console.log(`TRI facilities: ${tri.features.length} (outside any county: ${triUnassigned}; counties with a facility: ${[...triByCounty.keys()].filter((f) => shapeFips.has(f)).length})`);
console.log(
  `Connecticut crosswalk: ${ct.towns} towns placed in ${ct.weights.size} planning regions` +
    (ct.unmatchedTowns.length ? `; towns with no region: ${ct.unmatchedTowns.join(', ')}` : '')
);
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
console.log(`TRI measures: ${triList.length}`);
show(triList);
console.log('');
console.log(
  `Air quality measures: ${airList.length} (years: ${[...airYears].sort().join(', ')}; rows read: ${JSON.stringify(airRowCounts)})`
);
show(airList);
console.log('');
console.log(`SVI measures: ${sviList.length}`);
show(sviList);
console.log('');
console.log(`Wrote ${OUT_COUNTIES} (${mb(OUT_COUNTIES)} MB)`);
console.log(`Wrote ${OUT_MEASURES}`);
console.log('');
console.log('Roles by category (check these look right):');
const roleRows = new Map();
for (const m of measureList) roleRows.set(`${m.role.padEnd(10)} ${m.category}`, (roleRows.get(`${m.role.padEnd(10)} ${m.category}`) ?? 0) + 1);
for (const [row, count] of roleRows) console.log(`  ${row} (${count})`);
