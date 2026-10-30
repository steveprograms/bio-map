// Settings shared across the map, its layers, the legend panel, and the tests.
// This file has no imports, so it's safe to use anywhere (including Playwright tests).

// Rough bounding box of the continental US: [west, south], [east, north]
export const CONTINENTAL_US: [[number, number], [number, number]] = [
  [-125.0, 24.4],
  [-66.9, 49.5],
];

export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Copied into public/ by scripts/copy-maplibre-worker.mjs (see predev/prebuild)
export const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

// GeoJSON sources: source id -> file in public/
export const DATA_SOURCES = {
  'us-states': '/data/us-states.geojson',
  'us-state-labels': '/data/us-state-labels.geojson',
  'us-county-labels': '/data/us-county-labels.geojson',
  counties: '/data/counties.geojson', // built by scripts/build-counties.mjs
  tri: '/data/tri-facilities.geojson',
} as const;

// ---------- County measures (CDC PLACES, CDC/ATSDR SVI) ----------

// Built by scripts/build-counties.mjs: one entry per measure
export const MEASURES_URL = '/data/measures.json';
export const DEFAULT_MEASURE_ID = 'CASTHMA';

// A measure's role in analyses, set in scripts/build-counties.mjs:
//   outcome   - a health result (asthma, COPD, disability, ...)
//   exposure  - an environmental factor (toxic air releases, ...)
//   covariate - social, behavioral, or access context to adjust for (poverty, smoking, ...)
export const MEASURE_ROLES = ['outcome', 'exposure', 'covariate'] as const;
export type MeasureRole = (typeof MEASURE_ROLES)[number];

export interface Measure {
  id: string; // e.g. CASTHMA or RPL_THEMES; also the property name in counties.geojson
  name: string; // full name, e.g. "Current asthma among adults"
  short: string; // short name for the picker, e.g. "Current Asthma"
  category: string; // picker group, e.g. "Health Outcomes"
  role: MeasureRole; // how analyses treat it: outcome, exposure, or covariate
  source: string; // e.g. "CDC PLACES, 2025 release"
  valueType: string; // e.g. "Age-adjusted prevalence"
  year: number; // latest year the data describes
  period: string; // years shown in the legend, e.g. "2023" or "2018–2022"
  unit: string; // "%", " lbs", or "" (0-1 percentile ranks, counts)
  decimals: number; // decimal places to show
  scale: 'linear' | 'log'; // log for very skewed data, like pounds released
  counties: number; // counties with a value
  min: number;
  max: number;
  p05: number; // 5th percentile across counties
  p95: number; // 95th percentile across counties
}

// Formats a measure's value for display, e.g. "8.6%", "0.05", "450,000 lbs"
export const formatValue = (value: number, measure: Pick<Measure, 'unit' | 'decimals'>) =>
  `${value.toLocaleString('en-US', {
    minimumFractionDigits: measure.decimals,
    maximumFractionDigits: measure.decimals,
  })}${measure.unit}`;

// ---------- County selection and comparison ----------

export const MAX_SELECTED = 6;

// One color per selected county (outline, number, card, and table column), in selection order
export const SELECTION_COLORS = ['#1d4ed8', '#047857', '#7e22ce', '#be123c', '#0f172a', '#0e7490'];

// Shown on every county card and in the compare table's "Key measures" view
export const KEY_MEASURE_IDS = [
  'CASTHMA',
  'COPD',
  'CSMOKING',
  'OBESITY',
  'GHLTH',
  'TRI_AIR_PER_1K',
  'TRI_FACILITIES',
  'PM25_AVG',
  'RPL_THEMES',
  'EP_POV150',
  'EP_UNINSUR',
];

// ---------- Two-measure (bivariate) map ----------

export type CountyMode = 'single' | 'pair';
export interface Pair {
  xId: string; // measure going across (columns), usually an exposure
  yId: string; // measure going up (rows), usually an outcome
}
export const DEFAULT_PAIR: Pair = { xId: 'PM25_AVG', yId: 'CASTHMA' };
export const PAIR_LEVELS = ['Low', 'Middle', 'High'];

// PAIR_COLORS[row][column]: row = third of the "up" measure, column = third of the "across" measure,
// low to high. Low/low is light gray, high/high dark blue.
export const PAIR_COLORS = [
  ['#e8e8e8', '#ace4e4', '#5ac8c8'],
  ['#dfb0d6', '#a5add3', '#5698b9'],
  ['#be64ac', '#8c62aa', '#3b4994'],
];

// Accessible names of the panel controls (also used by tests to find them)
export const COUNTY_MODE_LABELS: Record<CountyMode, string> = { single: 'One measure', pair: 'Two measures' };
export const PAIR_PICKER_LABELS = { y: 'Measure going up', x: 'Measure going across' };

// Sequential colors, light (low) to dark (high), spread from each measure's 5th to 95th percentile
export const HEALTH_COLORS = ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'];

export const TRI_REPORTING_YEAR = 2024;

// ---------- Toggleable layer groups ----------

// Each checkbox in the panel controls one group of map layer ids
export const LAYER_GROUPS = {
  health: ['health-fill', 'health-no-data'],
  tri: ['tri-heat', 'tri-points'],
} as const;

export type LayerKey = keyof typeof LAYER_GROUPS;
export type Visibility = 'visible' | 'none';

// The "health" group now covers every county measure (health and social vulnerability);
// its internal name is kept so layer ids and tests stay stable.
export const LAYER_LABELS: Record<LayerKey, string> = {
  health: 'County data',
  tri: 'TRI facilities: air releases',
};

// Accessible name of the measure dropdown (also used by tests to find it)
export const MEASURE_PICKER_LABEL = 'Choose county measure';

// ---------- TRI colors ----------

// Industry groups to color; any other sector uses OTHER_SECTOR_COLOR
export const SECTOR_COLORS: [string, string][] = [
  ['Chemicals', '#2563eb'],
  ['Petroleum', '#111827'],
  ['Primary Metals', '#7c3aed'],
  ['Fabricated Metals', '#a78bfa'],
  ['Electric Utilities', '#db2777'],
  ['Paper', '#059669'],
  ['Nonmetallic Mineral Product', '#0891b2'],
];
export const OTHER_SECTOR_COLOR = '#9ca3af';

// Shorter names for the legend
export const sectorLabel = (sector: string) =>
  sector === 'Nonmetallic Mineral Product' ? 'Nonmetallic Minerals' : sector;

// Heatmap ramp in purples so it contrasts with the warm health colors. Densities must ascend.
export const HEAT_COLORS: [number, string][] = [
  [0, 'rgba(63, 0, 125, 0)'],
  [0.2, '#dadaeb'],
  [0.4, '#bcbddc'],
  [0.6, '#9e9ac8'],
  [0.8, '#6a51a3'],
  [1, '#3f007d'],
];
