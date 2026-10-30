import { describe, expect, it } from 'vitest';
import type { Measure } from './config';
import { buildCountyIndex, centroidOf } from './countyStats';
import { runScan } from './scan';
import { DISTANCE_BREAKS_KM, buildSpatialPairs, distanceKm, effectiveSampleSize } from './spatial';
import { ranks } from './stats';
import { sampleMeasures } from './test-fixtures';

// A 20 × 20 grid of made-up counties about 50 km apart, with repeatable pseudo-random noise
let seed = 42;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
const square = (x: number, y: number) => [
  [
    [x - 0.2, y - 0.2],
    [x + 0.2, y - 0.2],
    [x + 0.2, y + 0.2],
    [x - 0.2, y + 0.2],
    [x - 0.2, y - 0.2],
  ],
];
const grid = Array.from({ length: 400 }, (_, i) => ({ x: -100 + (i % 20) * 0.5, y: 35 + Math.floor(i / 20) * 0.5 }));
// Two unrelated measures that both rise from southwest to northeast (a shared regional trend),
// and pure noise with no spatial pattern
const features = grid.map(({ x, y }, i) => ({
  properties: {
    GEOID: String(i).padStart(5, '0'),
    CASTHMA: x + y + noise() * 2,
    TRI_AIR_LBS: x + y + noise() * 2,
    CSMOKING: noise(),
  },
  geometry: { type: 'Polygon', coordinates: square(x, y) },
}));
const index = buildCountyIndex(features, sampleMeasures);
const pairs = buildSpatialPairs(index)!;
const fips = [...index.byFips.keys()];

describe('geometry helpers', () => {
  it('measures great-circle distance', () => {
    expect(distanceKm([-74.006, 40.7128], [-118.2437, 34.0522])).toBeCloseTo(3936, -1); // New York to Los Angeles
  });

  it('finds the center of polygons, and nothing for other shapes', () => {
    expect(centroidOf({ type: 'Polygon', coordinates: square(-90, 40) })).toEqual([
      expect.closeTo(-90, 10),
      expect.closeTo(40, 10),
    ]);
    const multi = centroidOf({ type: 'MultiPolygon', coordinates: [square(-90, 40), square(-80, 40)] })!;
    expect(multi[0]).toBeCloseTo(-85, 10);
    expect(centroidOf({ type: 'Point', coordinates: [-90, 40] })).toBeNull();
    expect(centroidOf(null)).toBeNull();
  });

  it('stores a centroid per county with geometry', () => {
    expect(index.centroids.size).toBe(400);
    expect(buildCountyIndex(features.map(({ properties }) => ({ properties })), sampleMeasures).centroids.size).toBe(0);
  });
});

describe('buildSpatialPairs', () => {
  it('assigns every pair of counties a distance class', () => {
    expect(pairs.fips).toHaveLength(400);
    expect(pairs.pairClass).toHaveLength((400 * 399) / 2);
    expect(Math.max(...pairs.pairClass)).toBeLessThan(DISTANCE_BREAKS_KM.length);
    expect(pairs.pairClass[0]).toBe(1); // first two counties are about 45 km apart: the 40–80 km class
  });

  it('needs at least 4 counties with locations', () => {
    expect(buildSpatialPairs(buildCountyIndex([], sampleMeasures))).toBeNull();
  });
});

describe('effectiveSampleSize', () => {
  const values = (id: string) => fips.map((f) => index.byFips.get(f)![id] as number);

  it('stays near n when there is no spatial pattern', () => {
    const nEff = effectiveSampleSize(pairs, fips, ranks(values('CSMOKING')), ranks(grid.map(() => noise())));
    expect(nEff).toBeGreaterThan(300);
    expect(nEff).toBeLessThanOrEqual(400);
  });

  it('is far smaller than n when both measures follow a regional trend', () => {
    const nEff = effectiveSampleSize(pairs, fips, ranks(values('CASTHMA')), ranks(values('TRI_AIR_LBS')));
    expect(nEff).toBeLessThan(40);
    expect(nEff).toBeGreaterThanOrEqual(3);
  });
});

describe('runScan with the spatial correction', () => {
  it('reports the effective sample size and a much larger p-value for a shared trend', () => {
    const plain = runScan(index, sampleMeasures, 'outcome', 'CASTHMA')!;
    const corrected = runScan(index, sampleMeasures, 'outcome', 'CASTHMA', [], pairs)!;
    const row = (result: typeof plain, id: string) => result.rows.find((r) => r.measure.id === id)!;

    expect(plain.spatial).toBe(false);
    expect(corrected.spatial).toBe(true);
    expect(row(plain, 'TRI_AIR_LBS').nEff).toBe(400);
    expect(row(corrected, 'TRI_AIR_LBS').nEff).toBeLessThan(40);
    // Same correlation, far weaker evidence
    expect(row(corrected, 'TRI_AIR_LBS').r).toBeCloseTo(row(plain, 'TRI_AIR_LBS').r, 10);
    expect(row(corrected, 'TRI_AIR_LBS').log10p).toBeGreaterThan(row(plain, 'TRI_AIR_LBS').log10p + 50);
  });

  it('ignores counties without a location', () => {
    const measures: Measure[] = sampleMeasures;
    const someWithout = features.map((f, i) => (i < 100 ? { properties: f.properties } : f));
    const partial = buildCountyIndex(someWithout, measures);
    const result = runScan(partial, measures, 'outcome', 'CASTHMA', [], buildSpatialPairs(partial))!;
    const tri = result.rows.find((r) => r.measure.id === 'TRI_AIR_LBS')!;
    expect(tri.n).toBe(400);
    expect(tri.nEff).toBeLessThan(400);
  });
});
