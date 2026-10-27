import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { DATA_SOURCES, HEALTH_COLORS, HEAT_COLORS, LAYER_GROUPS, type LayerKey, type Measure } from '../config';
import { measureStops } from '../expressions';
import { sampleMeasures } from '../test-fixtures';
import { buildLayers, toVisibility } from './index';

const LABEL_FONT = ['Noto Sans Regular'];

function allLayers(
  visible: Record<LayerKey, boolean> = { health: true, tri: true },
  measure: Measure | undefined = sampleMeasures[0]
) {
  const { belowLabels, aboveLabels } = buildLayers({
    visibility: toVisibility(visible),
    labelFont: LABEL_FONT,
    measure,
  });
  return [...belowLabels, ...aboveLabels];
}

describe('map layers', () => {
  it.each(sampleMeasures.map((m) => [m.id, m] as const))(
    'pass MapLibre style validation with %s selected',
    (_id, measure) => {
      const style = {
        version: 8,
        // Any glyphs URL works here; it's required whenever symbol layers have text
        glyphs: 'https://example.com/fonts/{fontstack}/{range}.pbf',
        sources: Object.fromEntries(
          Object.entries(DATA_SOURCES).map(([id, url]) => [id, { type: 'geojson', data: url }])
        ),
        layers: allLayers(undefined, measure),
      };

      const errors = validateStyleMin(style as never);
      expect(errors.map((e) => e.message)).toEqual([]);
    }
  );

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
    const layers = allLayers({ health: true, tri: false });
    const visibilityOf = (id: string) =>
      (layers.find((layer) => layer.id === id) as { layout?: { visibility?: string } }).layout?.visibility;

    for (const id of LAYER_GROUPS.health) expect(visibilityOf(id)).toBe('visible');
    for (const id of LAYER_GROUPS.tri) expect(visibilityOf(id)).toBe('none');
  });

  it('color the health layer by the selected measure', () => {
    const fill = allLayers(undefined, sampleMeasures[1]).find((layer) => layer.id === 'health-fill');
    expect(JSON.stringify(fill)).toContain('"CSMOKING"');
    expect(JSON.stringify(fill)).not.toContain('"CASTHMA"');
  });

  it('leave out the health layers when no measure is available', () => {
    const { belowLabels, aboveLabels } = buildLayers({
      visibility: toVisibility({ health: true, tri: true }),
      labelFont: LABEL_FONT,
    });
    const ids = [...belowLabels, ...aboveLabels].map((layer) => layer.id);
    expect(ids).not.toContain('health-fill');
    expect(ids).toContain('state-borders');
  });
});

describe('measureStops', () => {
  it('spreads the health colors from the 5th to the 95th percentile', () => {
    const stops = measureStops({ p05: 8, p95: 12 });
    expect(stops.map(([value]) => value)).toEqual([8, 9, 10, 11, 12]);
    expect(stops.map(([, color]) => color)).toEqual(HEALTH_COLORS);
  });

  it('keeps stops strictly ascending even when a measure has no spread', () => {
    const values = measureStops({ p05: 5, p95: 5 }).map(([value]) => value);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });
});

describe('heatmap colors', () => {
  // MapLibre's interpolate expression fails at runtime if stops aren't in ascending order
  it('are in ascending order of density', () => {
    const values = HEAT_COLORS.map(([value]) => value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
