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
  'us-counties': '/data/us-counties.geojson',
  'us-state-labels': '/data/us-state-labels.geojson',
  'us-county-labels': '/data/us-county-labels.geojson',
  'county-asthma': '/data/us-counties-asthma.geojson',
  tri: '/data/tri-facilities.geojson',
} as const;

// Years the data describes (shown in legends and popups)
export const ASTHMA_DATA_YEAR = 2023;
export const TRI_REPORTING_YEAR = 2024;

// ---------- Toggleable layer groups ----------

// Each checkbox in the panel controls one group of map layer ids
export const LAYER_GROUPS = {
  asthma: ['asthma-fill', 'asthma-no-data'],
  tri: ['tri-heat', 'tri-points'],
} as const;

export type LayerKey = keyof typeof LAYER_GROUPS;
export type Visibility = 'visible' | 'none';

export const LAYER_LABELS: Record<LayerKey, string> = {
  asthma: 'Adult asthma (county)',
  tri: 'Toxic air releases (EPA TRI)',
};

// ---------- Asthma colors ----------

// [value, color] pairs, light (low) to dark (high). Values must ascend.
export const ASTHMA_STOPS: [number, string][] = [
  [8, '#fff7bc'],
  [10, '#fec44f'],
  [12, '#ec7014'],
  [14, '#8c2d04'],
];

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

// Heatmap ramp in purples so it contrasts with the warm asthma colors. Densities must ascend.
export const HEAT_COLORS: [number, string][] = [
  [0, 'rgba(63, 0, 125, 0)'],
  [0.2, '#dadaeb'],
  [0.4, '#bcbddc'],
  [0.6, '#9e9ac8'],
  [0.8, '#6a51a3'],
  [1, '#3f007d'],
];
