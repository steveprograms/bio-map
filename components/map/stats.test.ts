import { describe, expect, it } from 'vitest';
import { buildCountyIndex } from './countyStats';
import {
  benjaminiHochberg,
  binOf,
  cellOf,
  completeCases,
  formatLog10P,
  log10PValueT,
  partialSpearmanTest,
  residuals,
  pairedValues,
  pearson,
  ranks,
  spearman,
  spearmanTest,
  summarizePair,
  tercileCuts,
} from './stats';
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

describe('significance tests', () => {
  // Reference values from SciPy (scipy.stats.t.sf * 2, scipy.stats.spearmanr)
  it.each([
    [2, 10, 0.073388],
    [1, 1, 0.5],
    [0, 30, 1],
    [10, 100, 9.9017e-17],
  ])('two-sided p for t = %s with %s df', (t, df, expected) => {
    expect(10 ** log10PValueT(t, df) / expected).toBeCloseTo(1, 4);
  });

  it('keeps tiny p-values in log space instead of rounding to 0', () => {
    expect(log10PValueT(40, 3000)).toBeCloseTo(-280.0625, 3);
  });

  it('matches SciPy for a Spearman test', () => {
    const test = spearmanTest([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 1, 4, 3, 6, 5, 8, 7, 10, 9])!;
    expect(test.r).toBeCloseTo(0.939394, 5);
    expect(10 ** test.log10p / 5.484053e-5).toBeCloseTo(1, 4);
    expect(test.ciLow).toBeLessThan(test.r);
    expect(test.ciHigh).toBeGreaterThan(test.r);
    expect(test.ciHigh).toBeLessThan(1);
  });

  it('returns null for too few pairs or no variation, and stays finite for a perfect correlation', () => {
    expect(spearmanTest([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(spearmanTest([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(Number.isFinite(spearmanTest([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])!.log10p)).toBe(true);
  });

  it('adjusts p-values with Benjamini–Hochberg, keeping the input order', () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.005].map(Math.log10)).map((v) => 10 ** v);
    [0.02, 0.04, 0.04, 0.02].forEach((expected, i) => expect(q[i]).toBeCloseTo(expected, 10));
    expect(benjaminiHochberg([Math.log10(0.9), Math.log10(0.8)]).every((v) => v <= 0)).toBe(true); // q ≤ 1
  });

  it.each([
    [Math.log10(0.0421), '0.042'],
    [-12.5, '3.2e-13'],
    [Math.log10(9.99e-5), '1.0e-4'],
    [-400, '<1e-300'],
  ])('formats log10 %s as %s', (log10p, text) => {
    expect(formatLog10P(log10p)).toBe(text);
  });
});

describe('partial Spearman (adjusting for covariates)', () => {
  // A made-up confounder z drives both x and y; with z held fixed they're unrelated
  const z = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const noiseA = [0.3, -0.2, 0.1, -0.4, 0.2, 0.0, -0.1, 0.4, -0.3, 0.1, 0.2, -0.2];
  const noiseB = [-0.1, 0.3, -0.3, 0.2, 0.1, -0.4, 0.4, -0.2, 0.0, 0.3, -0.1, 0.2];
  const x = z.map((v, i) => v + noiseA[i] * 4);
  const y = z.map((v, i) => 2 * v + noiseB[i] * 8);

  it('removes a correlation that a covariate explains', () => {
    expect(spearmanTest(x, y)!.r).toBeGreaterThan(0.8);
    const adjusted = partialSpearmanTest(x, y, [z])!;
    // The strong positive association is gone once z is held fixed (what's left is the noise)
    expect(adjusted.r).toBeLessThan(0.3);
    expect(adjusted.n).toBe(12);
  });

  it('matches NumPy on ranks (residuals from least squares, then Pearson)', () => {
    // Reference: numpy lstsq on [1, rank(z)] residuals of rank(x) and rank(y), then corrcoef
    const adjusted = partialSpearmanTest([1, 3, 2, 5, 4, 6], [2, 1, 4, 3, 6, 5], [[1, 2, 2, 4, 5, 6]])!;
    expect(adjusted.r).toBeCloseTo(-0.8696, 3);
  });

  it('is plain Spearman with no covariates', () => {
    expect(partialSpearmanTest(x, y, [])).toEqual(spearmanTest(x, y));
  });

  it('returns null when a covariate is redundant', () => {
    expect(partialSpearmanTest(x, y, [z, z.map((v) => 2 * v + 1)])).toBeNull();
  });

  it('fits least-squares residuals exactly for a straight line', () => {
    residuals([3, 5, 7, 9], [[1, 2, 3, 4]])!.forEach((r) => expect(r).toBeCloseTo(0, 10));
  });

  it('keeps only counties with every value', () => {
    const index = buildCountyIndex(sampleCountyFeatures, sampleMeasures);
    const { fips, columns } = completeCases(index, ['CASTHMA', 'RPL_THEMES']);
    expect(fips).toEqual(['54005', '01001']);
    expect(columns).toEqual([
      [12.6, 10.1],
      [0.77, 0.42],
    ]);
  });
});
