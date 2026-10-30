// MapLibre expressions used by the layers.
import type { ExpressionSpecification } from 'maplibre-gl';
import { HEALTH_COLORS, HEAT_COLORS, OTHER_SECTOR_COLOR, PAIR_COLORS, SECTOR_COLORS, type Measure } from './config';
import type { Cuts } from './stats';

// TypeScript can't verify the shape of expressions built by spreading arrays,
// so we tell it these are valid expressions. layers.test.ts checks them for real.
const asExpression = (e: unknown[]) => e as unknown as ExpressionSpecification;

// ---------- Health measures ----------

// The range the colors span, in the measure's own units: its 5th to 95th percentile.
// Counties outside that range get the end colors, so a few extremes don't wash out the rest.
export function colorRange(measure: Pick<Measure, 'p05' | 'p95'>) {
  // MapLibre needs strictly ascending stops, so guard against a measure with no spread
  return { low: measure.p05, high: measure.p95 > measure.p05 ? measure.p95 : measure.p05 + 1 };
}

// Log scales color by log10(value + 1), so 0 stays 0 and each step up is ten times more
const toColorScale = (value: number, scale: Measure['scale']) =>
  scale === 'log' ? Math.log10(value + 1) : value;

// Color stops: HEALTH_COLORS spread evenly across the color range (on the measure's scale)
export function measureStops(measure: Pick<Measure, 'p05' | 'p95' | 'scale'>): [number, string][] {
  const { low, high } = colorRange(measure);
  const start = toColorScale(low, measure.scale);
  const step = (toColorScale(high, measure.scale) - start) / (HEALTH_COLORS.length - 1);
  return HEALTH_COLORS.map((color, i) => [start + i * step, color]);
}

export const measureColorExpr = (measure: Measure) => {
  const input = measure.scale === 'log' ? ['log10', ['+', ['get', measure.id], 1]] : ['get', measure.id];
  return asExpression(['interpolate', ['linear'], input, ...measureStops(measure).flat()]);
};

// Filters: counties that have a value for the measure, and counties that don't
export const hasValue = (measureId: string) => asExpression(['!=', ['get', measureId], null]);
export const lacksValue = (measureId: string) => asExpression(['==', ['get', measureId], null]);

// ---------- Two measures (bivariate) ----------

// A county's third (0 low, 1 middle, 2 high) on one measure. Must match binOf in stats.ts.
export const pairBinExpr = (measureId: string, cuts: Cuts) =>
  asExpression(['case', ['<=', ['get', measureId], cuts[0]], 0, ['<=', ['get', measureId], cuts[1]], 1, 2]);

// Wraps an expression that can use "cell": the county's square in the 3×3 grid (0-8, same as cellOf)
const withCell = (xId: string, yId: string, xCuts: Cuts, yCuts: Cuts, body: unknown[]) =>
  asExpression([
    'let', 'xb', pairBinExpr(xId, xCuts), 'yb', pairBinExpr(yId, yCuts),
    ['let', 'cell', ['+', ['var', 'xb'], ['*', 3, ['var', 'yb']]], body],
  ]);

export const pairColorExpr = (xId: string, yId: string, xCuts: Cuts, yCuts: Cuts) =>
  withCell(xId, yId, xCuts, yCuts, [
    'match', ['var', 'cell'],
    ...PAIR_COLORS.flatMap((row, yb) => row.flatMap((color, xb) => [xb + 3 * yb, color])),
    '#000000',
  ]);

// With a legend square chosen, its counties stay solid and the rest fade
export const pairOpacityExpr = (xId: string, yId: string, xCuts: Cuts, yCuts: Cuts, cell: number | null) =>
  cell === null ? 0.85 : withCell(xId, yId, xCuts, yCuts, ['case', ['==', ['var', 'cell'], cell], 0.9, 0.12]);

export const hasAllValues = (ids: string[]) =>
  asExpression(['all', ...ids.map((id) => ['!=', ['get', id], null])]);
export const lacksAnyValue = (ids: string[]) =>
  asExpression(['any', ...ids.map((id) => ['==', ['get', id], null])]);

// ---------- TRI ----------

export const HEAT_COLOR_EXPR = asExpression([
  'interpolate', ['linear'], ['heatmap-density'], ...HEAT_COLORS.flat(),
]);

export const SECTOR_COLOR_EXPR = asExpression([
  'match', ['get', 'sector'], ...SECTOR_COLORS.flat(), OTHER_SECTOR_COLOR,
]);

// log10 of air releases (lbs); max(..., 1) avoids log10(0)
export const LOG_AIR: ExpressionSpecification = ['log10', ['max', ['get', 'air_lbs'], 1]];

// Circle radius by air releases, scaled up or down for zoom level
export const radiusByAir = (scale: number) =>
  [
    'interpolate', ['linear'], LOG_AIR,
    0, 2 * scale,   // 0-1 lbs
    3, 3 * scale,   // ~1,000 lbs (median)
    4.7, 6 * scale, // ~50,000 lbs (90th percentile)
    6, 11 * scale,  // ~1,000,000 lbs (99th+)
    7.3, 16 * scale // ~20,000,000 lbs (max)
  ] as ExpressionSpecification;
