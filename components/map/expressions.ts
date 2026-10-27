// MapLibre expressions used by the layers.
import type { ExpressionSpecification } from 'maplibre-gl';
import { ASTHMA_STOPS, HEAT_COLORS, OTHER_SECTOR_COLOR, SECTOR_COLORS } from './config';

// TypeScript can't verify the shape of expressions built by spreading arrays,
// so we tell it these are valid expressions. layers.test.ts checks them for real.
const asExpression = (e: unknown[]) => e as unknown as ExpressionSpecification;

export const ASTHMA_COLOR_EXPR = asExpression([
  'interpolate', ['linear'], ['get', 'asthma'], ...ASTHMA_STOPS.flat(),
]);

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
