import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { ASTHMA_STOPS, DATA_SOURCES, HEAT_COLORS, LAYER_GROUPS, type LayerKey } from '../config';
import { buildLayers, toVisibility } from './index';

const LABEL_FONT = ['Noto Sans Regular'];

function allLayers(visible: Record<LayerKey, boolean> = { asthma: true, tri: true }) {
  const { belowLabels, aboveLabels } = buildLayers({ visibility: toVisibility(visible), labelFont: LABEL_FONT });
  return [...belowLabels, ...aboveLabels];
}

describe('map layers', () => {
  it('pass MapLibre style validation (catches bad expressions, filters, and paint values)', () => {
    const style = {
      version: 8,
      // Any glyphs URL works here; it's required whenever symbol layers have text
      glyphs: 'https://example.com/fonts/{fontstack}/{range}.pbf',
      sources: Object.fromEntries(
        Object.entries(DATA_SOURCES).map(([id, url]) => [id, { type: 'geojson', data: url }])
      ),
      layers: allLayers(),
    };

    const errors = validateStyleMin(style as never);
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it('have unique ids', () => {
    const ids = allLayers().map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('include every layer that a checkbox controls', () => {
    const ids = allLayers().map((layer) => layer.id);
    for (const groupIds of Object.values(LAYER_GROUPS)) {
      for (const id of groupIds) expect(ids).toContain(id);
    }
  });

  it('start each toggleable layer with the visibility of its checkbox', () => {
    const layers = allLayers({ asthma: true, tri: false });
    const visibilityOf = (id: string) =>
      (layers.find((layer) => layer.id === id) as { layout?: { visibility?: string } }).layout?.visibility;

    for (const id of LAYER_GROUPS.asthma) expect(visibilityOf(id)).toBe('visible');
    for (const id of LAYER_GROUPS.tri) expect(visibilityOf(id)).toBe('none');
  });
});

describe('color scales', () => {
  // MapLibre's interpolate expression fails at runtime if stops aren't in ascending order
  it.each<[string, [number, string][]]>([
    ['ASTHMA_STOPS', ASTHMA_STOPS],
    ['HEAT_COLORS', HEAT_COLORS],
  ])('%s values are in ascending order', (_name, stops) => {
    const values = stops.map(([value]) => value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
