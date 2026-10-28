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

export interface Measure {
  id: string; // e.g. CASTHMA or RPL_THEMES; also the property name in counties.geojson
  name: string; // full name, e.g. "Current asthma among adults"
  short: string; // short name for the picker, e.g. "Current Asthma"
  category: string; // picker group, e.g. "Health Outcomes"
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
  tri: 'Toxic air releases (EPA TRI)',
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
