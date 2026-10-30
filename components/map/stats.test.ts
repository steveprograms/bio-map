import { describe, expect, it } from 'vitest';
import { buildCountyIndex } from './countyStats';
import { binOf, cellOf, pairedValues, pearson, ranks, spearman, summarizePair, tercileCuts } from './stats';
import { sampleCountyFeatures, sampleMeasures } from './test-fixtures';

describe('ranks', () => {
  it('ranks from 1, giving ties the average of their ranks', () => {
    expect(ranks([30, 10, 20])).toEqual([3, 1, 2]);
    expect(ranks([5, 1, 5, 9])).toEqual([2.5, 1, 2.5, 4]);
    expect(ranks([0, 0, 0])).toEqual([2, 2, 2]);
  });
});

describe('pearson and spearman', () => {
  it('are 1 for a perfect increasing relationship and -1 for decreasing', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
  });

  it('spearman ignores how extreme values are, only their order', () => {
    // Monotonic but very skewed: Spearman sees a perfect relationship, Pearson doesn't
    const x = [1, 2, 3, 4, 5];
    const y = [1, 2, 3, 4, 1_000_000];
    expect(spearman(x, y)).toBeCloseTo(1);
    expect(pearson(x, y)!).toBeLessThan(0.8);
  });

  it('is null with fewer than 3 pairs or no variation', () => {
    expect(spearman([1, 2], [3, 4])).toBeNull();
    expect(spearman([1, 2, 3], [5, 5, 5])).toBeNull();
  });
});

describe('tercileCuts and binOf', () => {
  it('split values into thirds', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const cuts = tercileCuts(values);
    expect(cuts).toEqual([3, 6]);
    expect(values.map((v) => binOf(v, cuts))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('put values equal to a cut in the lower third', () => {
    expect(binOf(3, [3, 6])).toBe(0);
    expect(binOf(6, [3, 6])).toBe(1);
  });

  it('keep many zeros together in the low third', () => {
    const cuts = tercileCuts([0, 0, 0, 0, 0, 0, 10, 20, 30]);
    expect(cuts).toEqual([0, 0]);
    expect(binOf(0, cuts)).toBe(0);
    expect(binOf(10, cuts)).toBe(2);
  });
});

describe('cellOf', () => {
  it('numbers the grid from low/low (0) to high/high (8)', () => {
    expect(cellOf(0, 0)).toBe(0);
    expect(cellOf(2, 0)).toBe(2); // high x, low y
    expect(cellOf(0, 2)).toBe(6); // low x, high y
    expect(cellOf(2, 2)).toBe(8);
  });
});

describe('pairedValues and summarizePair', () => {
  const index = buildCountyIndex(sampleCountyFeatures, sampleMeasures);

  it('use only counties with both values', () => {
    // Adair, KY has SVI but no asthma estimate
    const paired = pairedValues(index, 'RPL_THEMES', 'CASTHMA');
    expect(paired.fips.sort()).toEqual(['01001', '54005']);
    expect(pairedValues(index, 'RPL_THEMES', 'TRI_AIR_LBS').fips).toHaveLength(3);
  });

  it('count every paired county in exactly one cell', () => {
    const summary = summarizePair(index, 'RPL_THEMES', 'TRI_AIR_LBS');
    expect(summary.n).toBe(3);
    expect(summary.counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
