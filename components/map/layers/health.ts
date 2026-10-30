// County data layer: counties colored by one measure, or by two at once (3×3 grid),
// plus a hatched fill for counties without the data being shown.
import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { CountyMode, Measure, Pair, Visibility } from '../config';
import {
  hasAllValues,
  hasValue,
  lacksAnyValue,
  lacksValue,
  measureColorExpr,
  pairColorExpr,
  pairOpacityExpr,
} from '../expressions';
import { HATCH_IMAGE_ID } from '../hatchPattern';
import type { Cuts, PairSummary } from '../stats';

export const HEALTH_FILL_ID = 'health-fill';
export const HEALTH_NO_DATA_ID = 'health-no-data';

// What the county layer shows
export type CountyFill =
  | { kind: 'single'; measure: Measure }
  | { kind: 'pair'; x: Measure; y: Measure; xCuts: Cuts; yCuts: Cuts; cell: number | null };

// What the panel has chosen for the county layer
export interface CountyView {
  mode: CountyMode;
  measureId: string; // one-measure mode
  pair: Pair; // two-measure mode
  cell: number | null; // legend square shown alone (two-measure mode)
}

// Turns the panel's choices into a CountyFill. Undefined until measures load. Two-measure mode
// falls back to the "up" measure alone when there's no summary yet or too few counties have both.
export function countyFillFor(
  measures: Measure[],
  view: CountyView,
  summary: PairSummary | null
): CountyFill | undefined {
  const byId = (id: string) => measures.find((m) => m.id === id);
  if (view.mode === 'pair') {
    const x = byId(view.pair.xId);
    const y = byId(view.pair.yId);
    if (x && y && summary && summary.n >= 3) {
      return { kind: 'pair', x, y, xCuts: summary.xCuts, yCuts: summary.yCuts, cell: view.cell };
    }
    const fallback = y ?? measures[0];
    return fallback && { kind: 'single', measure: fallback };
  }
  const measure = byId(view.measureId) ?? measures[0];
  return measure && { kind: 'single', measure };
}

// Paint and filters for a CountyFill
export function countyFillStyle(fill: CountyFill): {
  color: ExpressionSpecification;
  opacity: number | ExpressionSpecification;
  hasData: ExpressionSpecification;
  noData: ExpressionSpecification;
} {
  if (fill.kind === 'single') {
    return {
      color: measureColorExpr(fill.measure),
      opacity: 0.8,
      hasData: hasValue(fill.measure.id),
      noData: lacksValue(fill.measure.id),
    };
  }
  const { x, y, xCuts, yCuts, cell } = fill;
  return {
    color: pairColorExpr(x.id, y.id, xCuts, yCuts),
    opacity: pairOpacityExpr(x.id, y.id, xCuts, yCuts, cell),
    hasData: hasAllValues([x.id, y.id]),
    noData: lacksAnyValue([x.id, y.id]),
  };
}

export function healthLayers(visibility: Visibility, fill: CountyFill): LayerSpecification[] {
  const style = countyFillStyle(fill);
  return [
    {
      id: HEALTH_FILL_ID,
      type: 'fill',
      source: 'counties',
      filter: style.hasData,
      layout: { visibility },
      paint: {
        'fill-color': style.color,
        'fill-opacity': style.opacity,
      },
    },
    {
      id: HEALTH_NO_DATA_ID,
      type: 'fill',
      source: 'counties',
      filter: style.noData,
      layout: { visibility },
      paint: {
        'fill-pattern': HATCH_IMAGE_ID,
        'fill-opacity': 0.9,
      },
    },
  ];
}

// Updates the live map when what the county layer shows changes
export function applyCountyFill(map: MapLibreMap, fill: CountyFill) {
  if (!map.getLayer(HEALTH_FILL_ID)) return;
  const style = countyFillStyle(fill);
  map.setPaintProperty(HEALTH_FILL_ID, 'fill-color', style.color);
  map.setPaintProperty(HEALTH_FILL_ID, 'fill-opacity', style.opacity);
  map.setFilter(HEALTH_FILL_ID, style.hasData);
  map.setFilter(HEALTH_NO_DATA_ID, style.noData);
}
