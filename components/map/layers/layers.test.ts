import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { LayerSpecification } from 'maplibre-gl';
import { DATA_SOURCES, HEALTH_COLORS, HEAT_COLORS, LAYER_GROUPS, type LayerKey, type Measure } from '../config';
import { measureStops } from '../expressions';
import { sampleMeasures } from '../test-fixtures';
import type { PairSummary } from '../stats';
import { countyFillFor, type CountyFill } from './health';
import { buildLayers, toVisibility } from './index';
import { selectedColorExpr, selectedNumberExpr, selectionColor } from './selection';

const LABEL_FONT = ['Noto Sans Regular'];

const single = (measure: Measure | undefined): CountyFill | undefined => measure && { kind: 'single', measure };

// Two measures: Current Asthma going up, Current Smoking going across
const pairFill = (cell: number | null): CountyFill => ({
  kind: 'pair',
  x: sampleMeasures[1],
  y: sampleMeasures[0],
  xCuts: [15, 20],
  yCuts: [9.5, 10.5],
  cell,
});

function allLayers(
  visible: Record<LayerKey, boolean> = { health: true, tri: true },
  fill: CountyFill | undefined = single(sampleMeasures[0]),
  selected: string[] = []
) {
  const { belowLabels, aboveLabels } = buildLayers({
    visibility: toVisibility(visible),
    labelFont: LABEL_FONT,
    fill,
    selected,
  });
  return [...belowLabels, ...aboveLabels];
}

// Checks layers with MapLibre's own style validator; returns the error messages
function validationErrors(layers: LayerSpecification[]) {
  const style = {
    version: 8,
    // Any glyphs URL works here; it's required whenever symbol layers have text
    glyphs: 'https://example.com/fonts/{fontstack}/{range}.pbf',
    sources: Object.fromEntries(
      Object.entries(DATA_SOURCES).map(([id, url]) => [
        id,
        id === 'counties' ? { type: 'geojson', data: url, promoteId: 'GEOID' } : { type: 'geojson', data: url },
      ])
    ),
    layers,
  };
  return validateStyleMin(style as never).map((e) => e.message);
}

describe('map layers', () => {
  it.each(sampleMeasures.map((m) => [m.id, m] as const))(
    'pass MapLibre style validation with %s selected',
    (_id, measure) => {
      expect(validationErrors(allLayers(undefined, single(measure)))).toEqual([]);
    }
  );

  it.each<[string, number | null]>([
    ['every square', null],
    ['one square alone', 4],
  ])('pass MapLibre style validation with two measures, showing %s', (_label, cell) => {
    expect(validationErrors(allLayers(undefined, pairFill(cell)))).toEqual([]);
  });

  it.each<[string, string[]]>([
    ['no counties', []],
    ['one county', ['54005']],
    ['several counties', ['54005', '01001', '21001']],
  ])('pass MapLibre style validation with %s selected', (_label, selected) => {
    expect(validationErrors(allLayers(undefined, undefined, selected))).toEqual([]);
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
    const layers = allLayers({ health: true, tri: false });
    const visibilityOf = (id: string) =>
      (layers.find((layer) => layer.id === id) as { layout?: { visibility?: string } }).layout?.visibility;

    for (const id of LAYER_GROUPS.health) expect(visibilityOf(id)).toBe('visible');
    for (const id of LAYER_GROUPS.tri) expect(visibilityOf(id)).toBe('none');
  });

  it('color the county layer by the selected measure', () => {
    const fill = allLayers(undefined, single(sampleMeasures[1])).find((layer) => layer.id === 'health-fill');
    expect(JSON.stringify(fill)).toContain('"CSMOKING"');
    expect(JSON.stringify(fill)).not.toContain('"CASTHMA"');
  });

  it('color and filter the county layer by both measures in two-measure mode', () => {
    const layers = allLayers(undefined, pairFill(null));
    const fill = JSON.stringify(layers.find((layer) => layer.id === 'health-fill'));
    expect(fill).toContain('"CSMOKING"');
    expect(fill).toContain('"CASTHMA"');
    expect(fill).toContain('#3b4994'); // high/high color
    // Counties missing either value get the hatch
    expect(JSON.stringify(layers.find((layer) => layer.id === 'health-no-data'))).toContain('"any"');
  });

  it('leave out the county data layers when no measure is available, but keep selection', () => {
    const { belowLabels, aboveLabels } = buildLayers({
      visibility: toVisibility({ health: true, tri: true }),
      labelFont: LABEL_FONT,
    });
    const ids = [...belowLabels, ...aboveLabels].map((layer) => layer.id);
    expect(ids).not.toContain('health-fill');
    expect(ids).toContain('state-borders');
    expect(ids).toContain('county-hit');
  });
});

describe('selection expressions', () => {
  it('give each selected county its color and number, in selection order', () => {
    const selected = ['54005', '01001'];
    expect(selectedColorExpr(selected)).toEqual([
      'match', ['get', 'GEOID'], '54005', selectionColor(0), '01001', selectionColor(1), '#000000',
    ]);
    expect(selectedNumberExpr(selected)).toEqual(['match', ['get', 'GEOID'], '54005', '1', '01001', '2', '']);
  });

  it('fall back to a plain value when nothing is selected', () => {
    expect(selectedColorExpr([])).toBe('#000000');
    expect(selectedNumberExpr([])).toBe('');
  });
});

describe('measureStops', () => {
  it('spreads the colors from the 5th to the 95th percentile', () => {
    const stops = measureStops({ p05: 8, p95: 12, scale: 'linear' });
    expect(stops.map(([value]) => value)).toEqual([8, 9, 10, 11, 12]);
    expect(stops.map(([, color]) => color)).toEqual(HEALTH_COLORS);
  });

  it('places log-scale stops on log10(value + 1)', () => {
    const stops = measureStops({ p05: 0, p95: 9999, scale: 'log' });
    expect(stops[0][0]).toBe(0);
    expect(stops[stops.length - 1][0]).toBeCloseTo(4); // log10(10,000)
  });

  it.each(['linear', 'log'] as const)('keeps %s stops strictly ascending when a measure has no spread', (scale) => {
    const values = measureStops({ p05: 5, p95: 5, scale }).map(([value]) => value);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });
});

describe('color expressions', () => {
  it('color log-scale measures by log10(value + 1)', () => {
    const fill = allLayers(undefined, single(sampleMeasures.find((m) => m.scale === 'log'))).find(
      (layer) => layer.id === 'health-fill'
    );
    expect(JSON.stringify(fill)).toContain('["log10",["+",["get","TRI_AIR_LBS"],1]]');
  });
});

describe('heatmap colors', () => {
  // MapLibre's interpolate expression fails at runtime if stops aren't in ascending order
  it('are in ascending order of density', () => {
    const values = HEAT_COLORS.map(([value]) => value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

describe('countyFillFor', () => {
  const summary: PairSummary = { n: 100, r: 0.3, xCuts: [15, 20], yCuts: [9.5, 10.5], counts: new Array(9).fill(0) };
  const view = { mode: 'single' as const, measureId: 'CSMOKING', pair: { xId: 'CSMOKING', yId: 'CASTHMA' }, cell: null };

  it('shows the picked measure in one-measure mode', () => {
    expect(countyFillFor(sampleMeasures, view, null)).toMatchObject({ kind: 'single', measure: { id: 'CSMOKING' } });
  });

  it('uses the thirds from the summary in two-measure mode', () => {
    expect(countyFillFor(sampleMeasures, { ...view, mode: 'pair', cell: 8 }, summary)).toMatchObject({
      kind: 'pair',
      x: { id: 'CSMOKING' },
      y: { id: 'CASTHMA' },
      xCuts: [15, 20],
      yCuts: [9.5, 10.5],
      cell: 8,
    });
  });

  it('falls back to the "up" measure alone until there are enough counties with both values', () => {
    const pairView = { ...view, mode: 'pair' as const };
    expect(countyFillFor(sampleMeasures, pairView, null)).toMatchObject({ kind: 'single', measure: { id: 'CASTHMA' } });
    expect(countyFillFor(sampleMeasures, pairView, { ...summary, n: 2 })).toMatchObject({ kind: 'single' });
  });

  it('is undefined before measures load', () => {
    expect(countyFillFor([], view, null)).toBeUndefined();
  });
});
