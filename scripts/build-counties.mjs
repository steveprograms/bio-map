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
//   data-raw/nri-counties.csv          FEMA National Risk Index, county table (natural hazard frequencies)
//   data-raw/uscs-county.txt           CDC/NCI U.S. Cancer Statistics, county incidence (BYAREA_COUNTY.TXT)
//   data-raw/pesticides-county.txt     USGS Pesticide National Synthesis Project, county use estimates (EPest)
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
const NRI_CSV = 'data-raw/nri-counties.csv';
const USCS_TXT = 'data-raw/uscs-county.txt';
const PESTICIDE_TXT = 'data-raw/pesticides-county.txt';
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

// ---------- FEMA National Risk Index: natural hazard frequencies ----------

// The NRI county table has, for each of 18 natural hazards, an "annualized frequency" (<HAZARD>_AFREQ):
// how often the hazard occurs per year in the county, from FEMA's historical records and models.
// We use the frequencies only, as exposures. The NRI's risk scores and expected losses are left out on
// purpose: the risk score multiplies in FEMA's own social vulnerability index (which would duplicate
// our SVI covariates), and expected losses are in dollars of property, so wealthier counties score higher.
// Units differ by hazard (see https://hazards.fema.gov/nri/annualized-frequency).
const NRI_SOURCE = 'FEMA National Risk Index';
const NRI_HAZARDS = [
  // [field prefix, measure id, short name, full name, what one unit is, unit shown, decimals, multiply by]
  ['HWAV', 'NRI_HEAT_FREQ', 'Heat Waves', 'Heat wave frequency', 'Heat-wave event-days per year', ' days', 2, 1],
  ['CWAV', 'NRI_COLD_FREQ', 'Cold Waves', 'Cold wave frequency', 'Cold-wave event-days per year', ' days', 2, 1],
  ['DRGT', 'NRI_DROUGHT_FREQ', 'Drought', 'Drought frequency', 'Drought event-days per year', ' days', 1, 1],
  ['WFIR', 'NRI_WILDFIRE_FREQ', 'Wildfire', 'Wildfire likelihood', 'Annual chance of wildfire (burn probability), in percent', '%', 3, 100],
  ['IFLD', 'NRI_FLOOD_FREQ', 'Inland Flooding', 'Inland flooding frequency', 'Annualized frequency as FEMA defines it for inland flooding', '', 2, 1],
  ['HRCN', 'NRI_HURRICANE_FREQ', 'Hurricanes', 'Hurricane frequency', 'Hurricane events per year', '', 3, 1],
  ['TRND', 'NRI_TORNADO_FREQ', 'Tornadoes', 'Tornado frequency', 'Tornado events per year', '', 3, 1],
  ['WNTW', 'NRI_WINTER_FREQ', 'Winter Weather', 'Winter weather frequency', 'Winter weather event-days per year', ' days', 1, 1],
];
const nriMeasureIds = NRI_HAZARDS.map(([, id]) => id);
const nriRows = readCsv(NRI_CSV);
const nriVersions = new Set(nriRows.map((r) => r.NRI_VER).filter(Boolean));
const nriVersion = [...nriVersions].join(', ') || 'unknown version';
const nriMissingColumns = [];

for (const [prefix, id, short, name, valueType, unit, decimals, factor] of NRI_HAZARDS) {
  const column = `${prefix}_AFREQ`;
  if (!(column in (nriRows[0] ?? {}))) {
    nriMissingColumns.push(column);
    continue;
  }
  measures.set(id, {
    id,
    name,
    short,
    category: 'Environment: Natural Hazards',
    role: 'exposure',
    source: `${NRI_SOURCE} (${nriVersion})`,
    valueType,
    year: 2024, // release year; not shown in the app (the legend shows the version from the file)
    period: `NRI ${nriVersion}`,
    unit,
    decimals,
    scale: 'linear',
    values: [],
  });
  const values = new Map();
  for (const r of nriRows) {
    // Hurricanes: FEMA leaves counties hurricanes don't reach blank, which means 0, not unknown
    const value = num(r[column]) ?? (prefix === 'HRCN' ? 0 : null);
    if (value === null) continue;
    values.set(String(r.STCOFIPS).trim().padStart(5, '0'), value * factor);
  }
  const round = (v) => Math.round(v * 10 ** decimals) / 10 ** decimals;
  for (const [fips, value] of withCtRegions(values)) addValue(id, fips, round(value));
}

// ---------- Cancer incidence: U.S. Cancer Statistics (CDC and NCI) ----------

// The official federal cancer statistics: new cases diagnosed per 100,000 people per year, age-adjusted,
// from cancer registries (counted cases, not survey estimates). We use the most recent 5-year average,
// all races, for a selection of cancer sites. Counties with too few cases are suppressed by CDC to protect
// privacy and keep rates stable; those stay missing ("No data"), never zero.
//
// The file is delimited text with a header row. Columns are found by name, so their order doesn't matter;
// the build prints what it found so the selection below can be checked against the real file.
const USCS_SOURCE = 'CDC and NCI U.S. Cancer Statistics';
const CANCER_SITES = [
  // [measure id, short name, full name, pattern for the SITE column, sex to use]
  ['CANCER_ALL', 'All Cancers', 'All cancer sites combined, new cases', /^all cancer sites/i, 'both'],
  ['CANCER_LUNG', 'Lung Cancer', 'Lung and bronchus cancer, new cases', /^lung and bronchus/i, 'both'],
  ['CANCER_COLORECTAL', 'Colorectal Cancer', 'Colon and rectum cancer, new cases', /^colon and rectum/i, 'both'],
  ['CANCER_BREAST', 'Breast Cancer (Female)', 'Female breast cancer, new cases among women', /breast/i, 'female'],
  ['CANCER_PROSTATE', 'Prostate Cancer', 'Prostate cancer, new cases among men', /^prostate/i, 'male'],
  ['CANCER_BLADDER', 'Bladder Cancer', 'Urinary bladder cancer, new cases', /^urinary bladder/i, 'both'],
  ['CANCER_KIDNEY', 'Kidney Cancer', 'Kidney and renal pelvis cancer, new cases', /^kidney/i, 'both'],
  ['CANCER_NHL', 'Non-Hodgkin Lymphoma', 'Non-Hodgkin lymphoma, new cases', /^non-hodgkin/i, 'both'],
  ['CANCER_LEUKEMIA', 'Leukemia', 'Leukemias, new cases', /^leukemia/i, 'both'],
  ['CANCER_MELANOMA', 'Melanoma', 'Melanoma of the skin, new cases', /^melanoma/i, 'both'],
  ['CANCER_THYROID', 'Thyroid Cancer', 'Thyroid cancer, new cases', /^thyroid/i, 'both'],
];
const cancerMeasureIds = CANCER_SITES.map(([id]) => id);

const uscsText = readFileSync(USCS_TXT, 'utf8').replace(/^\uFEFF/, '');
const uscsDelimiter = ['|', '\t', ','].find((d) => uscsText.slice(0, uscsText.indexOf('\n')).includes(d)) ?? '|';
const uscsRows = parse(uscsText, {
  delimiter: uscsDelimiter,
  columns: (header) => header.map((h) => h.trim().toUpperCase()),
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
});
const uscsColumns = Object.keys(uscsRows[0] ?? {});
const uscsMissing = ['AREA', 'AGE_ADJUSTED_RATE', 'EVENT_TYPE', 'RACE', 'SEX', 'SITE', 'YEAR'].filter((c) => !uscsColumns.includes(c));
if (uscsMissing.length) {
  throw new Error(`${USCS_TXT} is missing columns: ${uscsMissing.join(', ')}. Columns found: ${uscsColumns.join(', ')}`);
}

// A county's FIPS code: a FIPS column if there is one, otherwise the 5 digits in parentheses in AREA,
// e.g. "AL: Autauga County (01001)"
const uscsFips = (r) => {
  const fromColumn = String(r.FIPS ?? r.COUNTY_FIPS ?? '').trim();
  if (/^\d{4,5}$/.test(fromColumn)) return fromColumn.padStart(5, '0');
  const match = String(r.AREA).match(/\((\d{5})\)/);
  return match ? match[1] : null;
};
const isAllRaces = (race) => /^all races/i.test(race.trim());
const sexMatches = (sex, want) =>
  want === 'female' ? /^female$/i.test(sex.trim()) : want === 'male' ? /^male$/i.test(sex.trim()) : /male and female|both/i.test(sex);

// The most recent 5-year period, e.g. "2019-2023"
const incidenceRows = uscsRows.filter((r) => /incidence/i.test(r.EVENT_TYPE) && isAllRaces(r.RACE));
const periods = [...new Set(incidenceRows.map((r) => String(r.YEAR).trim()).filter((y) => /^\d{4}\s*-\s*\d{4}$/.test(y)))];
const uscsPeriod = periods.sort((a, b) => Number(a.slice(-4)) - Number(b.slice(-4))).at(-1);
if (!uscsPeriod) throw new Error(`No 5-year incidence period found in ${USCS_TXT}. YEAR values look like: ${[...new Set(uscsRows.slice(0, 50).map((r) => r.YEAR))].join(', ')}`);
const uscsPeriodLabel = uscsPeriod.replace(/\s*-\s*/, '\u2013');
const uscsSites = [...new Set(incidenceRows.map((r) => r.SITE.trim()))].sort();
const cancerReport = []; // for the summary: which SITE each measure matched, and suppressed counts

for (const [id, short, name, pattern, sex] of CANCER_SITES) {
  const site = uscsSites.find((s) => pattern.test(s) && !/childhood|in situ/i.test(s));
  if (!site) {
    cancerReport.push(`  WARNING: no SITE matched ${id} (${pattern})`);
    continue;
  }
  measures.set(id, {
    id,
    name,
    short,
    category: 'Health Outcomes: Cancer Incidence',
    role: 'outcome',
    source: `${USCS_SOURCE} (diagnoses through ${uscsPeriod.slice(-4)})`,
    valueType: `Age-adjusted new cases per 100,000 ${sex === 'female' ? 'women' : sex === 'male' ? 'men' : 'people'} per year, ${uscsPeriodLabel} average`,
    year: Number(uscsPeriod.slice(-4)),
    period: uscsPeriodLabel,
    unit: '',
    decimals: 1,
    scale: 'linear',
    values: [],
  });

  const values = new Map();
  const limits = new Map();
  let suppressed = 0;
  for (const r of incidenceRows) {
    if (r.SITE.trim() !== site || String(r.YEAR).trim() !== uscsPeriod || !sexMatches(r.SEX, sex)) continue;
    const fips = uscsFips(r);
    if (!fips) continue;
    const rate = num(r.AGE_ADJUSTED_RATE); // suppressed or unavailable rates (~, ., +, blank) become null
    if (rate === null) {
      suppressed++;
      continue;
    }
    values.set(fips, rate);
    limits.set(fips, [num(r.AGE_ADJUSTED_CI_LOWER), num(r.AGE_ADJUSTED_CI_UPPER)]);
  }
  if (values.size === 0) {
    measures.delete(id);
    cancerReport.push(`  WARNING: ${id} matched SITE "${site}" but no county has a rate (${suppressed} suppressed); left out`);
    continue;
  }
  for (const [fips, rate] of withCtRegions(values)) {
    const [low, high] = limits.get(fips) ?? [null, null];
    addValue(id, fips, Math.round(rate * 10) / 10, low, high);
  }
  cancerReport.push(`  ${id.padEnd(18)} SITE "${site}", sex ${sex}: ${values.size} counties with a rate, ${suppressed} suppressed`);
}

// ---------- Pesticide use: USGS Pesticide National Synthesis Project ----------

// Estimated agricultural pesticide use per county and compound, in kilograms, from USDA crop acreage and
// farm surveys (estimates, not measurements). Lower 48 states only. We show kilograms applied per square
// mile of county land, so large counties don't rank high just for their size.
//
// USGS gives two estimates: EPest-low (mostly surveyed use; counties without survey data count as no use)
// and EPest-high (also estimates use where surveys are missing). We use EPest-high so unsurveyed farm
// counties aren't shown as zero; change PESTICIDE_ESTIMATE to 'LOW' to use the other one.
// The file lists only counties with estimated use, so a lower-48 county that isn't listed gets 0.
const PESTICIDE_ESTIMATE = 'HIGH';
const PESTICIDE_COMPOUNDS = [
  // [measure id, short name, full name, pattern for the COMPOUND column (all matches are summed)]
  ['PEST_GLYPHOSATE', 'Glyphosate', 'Glyphosate (herbicide) applied on farms', /^glyphosate$/i],
  ['PEST_ATRAZINE', 'Atrazine', 'Atrazine (herbicide) applied on farms', /^atrazine$/i],
  ['PEST_24D', '2,4-D', '2,4-D (herbicide) applied on farms', /^2,4-d$/i],
  ['PEST_DICAMBA', 'Dicamba', 'Dicamba (herbicide) applied on farms', /^dicamba$/i],
  ['PEST_METOLACHLOR', 'Metolachlor', 'Metolachlor and S-metolachlor (herbicide) applied on farms', /^(s-)?metolachlor(-s)?( & metolachlor-s)?$/i],
  ['PEST_PARAQUAT', 'Paraquat', 'Paraquat (herbicide) applied on farms', /^paraquat$/i],
  ['PEST_CHLORPYRIFOS', 'Chlorpyrifos', 'Chlorpyrifos (insecticide) applied on farms', /^chlorpyrifos$/i],
];
const PEST_TOTAL_ID = 'PEST_TOTAL';
const pesticideMeasureIds = [...PESTICIDE_COMPOUNDS.map(([id]) => id), PEST_TOTAL_ID];

const pestText = readFileSync(PESTICIDE_TXT, 'utf8').replace(/^\uFEFF/, '');
const pestDelimiter = ['\t', '|', ','].find((d) => pestText.slice(0, pestText.indexOf('\n')).includes(d)) ?? '\t';
const pestRows = parse(pestText, {
  delimiter: pestDelimiter,
  columns: (header) => header.map((h) => h.trim().toUpperCase()),
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
});
const pestColumns = Object.keys(pestRows[0] ?? {});
const pestColumn = (pattern, what) => {
  const column = pestColumns.find((c) => pattern.test(c));
  if (!column) throw new Error(`${PESTICIDE_TXT}: no ${what} column. Columns found: ${pestColumns.join(', ')}`);
  return column;
};
const PEST_COL = {
  compound: pestColumn(/^COMPOUND/, 'compound'),
  state: pestColumn(/^STATE_?FIPS/, 'state FIPS'),
  county: pestColumn(/^COUNTY_?FIPS/, 'county FIPS'),
  kg: pestColumn(new RegExp(`EPEST.*${PESTICIDE_ESTIMATE}|${PESTICIDE_ESTIMATE}.*KG`), `EPest-${PESTICIDE_ESTIMATE.toLowerCase()}`),
  year: pestColumns.find((c) => /^YEAR$/.test(c)),
};
const pestYears = [...new Set(pestRows.map((r) => Number(r[PEST_COL.year])).filter(Boolean))].sort();
const pestYear = pestYears.at(-1) ?? null;
const pestPeriod = String(pestYear ?? '');
const pestCompoundNames = [...new Set(pestRows.map((r) => String(r[PEST_COL.compound]).trim()))].sort();

// Land area in square miles, from the SVI file (it uses the same county codes as our shapes)
const landArea = new Map();
for (const r of sviRows) {
  const area = num(r.AREA_SQMI);
  if (area) landArea.set(String(r.FIPS).trim().padStart(5, '0'), area);
}
if (landArea.size === 0) throw new Error(`${SVI_CSV} has no AREA_SQMI column, needed for pesticide use per square mile`);
const isLower48 = (fips) => !['02', '15'].includes(fips.slice(0, 2)) && Number(fips.slice(0, 2)) <= 56;

// Kilograms per county and compound, newest year only
const kgByCountyCompound = new Map(); // county FIPS -> Map(compound -> kg)
for (const r of pestRows) {
  if (pestYear && Number(r[PEST_COL.year]) !== pestYear) continue;
  const kg = num(r[PEST_COL.kg]);
  if (kg === null) continue;
  const fips = `${String(r[PEST_COL.state]).trim().padStart(2, '0')}${String(r[PEST_COL.county]).trim().padStart(3, '0')}`;
  const compound = String(r[PEST_COL.compound]).trim().toUpperCase();
  const compounds = kgByCountyCompound.get(fips) ?? new Map();
  compounds.set(compound, (compounds.get(compound) ?? 0) + kg);
  kgByCountyCompound.set(fips, compounds);
}

// Some compounds also appear as a combined entry, e.g. "METOLACHLOR & METOLACHLOR-S" beside METOLACHLOR and
// METOLACHLOR-S. Adding all three could count the same use twice, so in a county with a combined entry we use
// it and drop its parts; elsewhere the parts are used.
let combinedWithParts = 0;
for (const compounds of kgByCountyCompound.values()) {
  for (const name of [...compounds.keys()].filter((n) => n.includes(' & '))) {
    const parts = name.split(' & ').map((part) => part.trim());
    if (parts.some((part) => compounds.has(part))) combinedWithParts++;
    parts.forEach((part) => compounds.delete(part));
  }
}

// Kilograms per county for each measure (the total sums every compound in the file)
const pestKg = new Map(pesticideMeasureIds.map((id) => [id, new Map()]));
const addKg = (id, fips, kg) => pestKg.get(id).set(fips, (pestKg.get(id).get(fips) ?? 0) + kg);
for (const [fips, compounds] of kgByCountyCompound) {
  for (const [compound, kg] of compounds) {
    addKg(PEST_TOTAL_ID, fips, kg);
    for (const [id, , , pattern] of PESTICIDE_COMPOUNDS) if (pattern.test(compound)) addKg(id, fips, kg);
  }
}

// Connecticut: the file uses the old counties. Kilograms are amounts, so each old county's total is split
// among planning regions by its share of population in each (the closest share we have to farmland).
const ctOldPopulation = new Map();
for (const regionWeights of ct.weights.values())
  for (const [old, pop] of regionWeights) ctOldPopulation.set(old, (ctOldPopulation.get(old) ?? 0) + pop);
function withCtRegionsKg(kgByFips) {
  const result = new Map([...kgByFips].filter(([fips]) => !isOldCtCounty(fips)));
  for (const [region, regionWeights] of ct.weights) {
    if (result.has(region)) continue;
    let kg = 0;
    for (const [old, pop] of regionWeights) kg += (kgByFips.get(old) ?? 0) * (pop / ctOldPopulation.get(old));
    result.set(region, kg);
  }
  return result;
}

const pestReport = [];
const pestDecimals = 2;
const PEST_TOTAL = [PEST_TOTAL_ID, 'All Pesticides (Estimated)', 'All pesticide compounds USGS estimated, applied on farms'];
for (const [id, short, name] of [...PESTICIDE_COMPOUNDS, PEST_TOTAL]) {
  const listed = pestKg.get(id).size;
  if (listed === 0) {
    pestReport.push(`  WARNING: ${id} matched no compound in the file; left out`);
    continue;
  }
  const kgByFips = withCtRegionsKg(pestKg.get(id));
  measures.set(id, {
    id,
    name,
    short,
    category: 'Environment: Pesticides',
    role: 'exposure',
    source: `USGS Pesticide National Synthesis Project${pestYear >= 2018 ? ' (preliminary estimates)' : ''}`,
    valueType: `Estimated agricultural use (EPest-${PESTICIDE_ESTIMATE.toLowerCase()}), kg per square mile of land per year`,
    year: pestYear,
    period: pestPeriod,
    unit: ' kg/sq mi',
    decimals: pestDecimals,
    scale: 'linear',
    values: [],
  });
  let zeros = 0;
  for (const [fips, area] of landArea) {
    if (!isLower48(fips)) continue;
    const kg = kgByFips.get(fips) ?? 0;
    if (kg === 0) zeros++;
    addValue(id, fips, Math.round((kg / area) * 10 ** pestDecimals) / 10 ** pestDecimals);
  }
  pestReport.push(`  ${id.padEnd(18)} counties listed in the file: ${listed}; lower-48 counties with no listed use (set to 0): ${zeros}`);
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
const nriList = all.filter((m) => nriMeasureIds.includes(m.id)).map(summarize);
const cancerList = all.filter((m) => cancerMeasureIds.includes(m.id)).map(summarize);
const pesticideList = all.filter((m) => pesticideMeasureIds.includes(m.id)).map(summarize);
const sviList = all // keep SVI's own order
  .filter((m) => ![...placesMeasureIds, ...triMeasureIds, ...airMeasureIds, ...nriMeasureIds, ...cancerMeasureIds, ...pesticideMeasureIds].includes(m.id))
  .map(summarize);
const measureList = [...placesList, ...cancerList, ...triList, ...airList, ...nriList, ...pesticideList, ...sviList];

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
console.log(`Natural hazard measures: ${nriList.length} (FEMA NRI ${nriVersion}; rows read: ${nriRows.length})`);
if (nriMissingColumns.length) console.log(`  WARNING: columns not found in ${NRI_CSV}: ${nriMissingColumns.join(', ')}`);
show(nriList);
console.log('');
console.log(`Cancer incidence measures: ${cancerList.length} (U.S. Cancer Statistics, ${uscsPeriod}; rows read: ${uscsRows.length}; delimiter "${uscsDelimiter === '\t' ? 'tab' : uscsDelimiter}")`);
console.log(`  Columns: ${uscsColumns.join(', ')}`);
cancerReport.forEach((line) => console.log(line));
show(cancerList);
console.log(`  Cancer sites in the file: ${uscsSites.join('; ')}`);
console.log('');
console.log(`Pesticide measures: ${pesticideList.length} (USGS EPest-${PESTICIDE_ESTIMATE.toLowerCase()}, year ${pestPeriod}; rows read: ${pestRows.length}; compounds in the file: ${pestCompoundNames.length})`);
console.log(`  Columns: ${pestColumns.join(', ')}`);
console.log(`  Counties where a combined entry (e.g. "METOLACHLOR & METOLACHLOR-S") replaced its separate parts: ${combinedWithParts}`);
pestReport.forEach((line) => console.log(line));
show(pesticideList);
console.log(`  Compounds in the file: ${pestCompoundNames.join('; ')}`);
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
