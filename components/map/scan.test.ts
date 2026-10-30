import { describe, expect, it } from 'vitest';
import { buildCountyIndex } from './countyStats';
import { focusChoices, pairForResult, runScan } from './scan';
import { sampleMeasures } from './test-fixtures';

// 50 made-up counties: smoking tracks asthma closely, toxic releases not at all,
// and social vulnerability is missing for most counties
const features = Array.from({ length: 50 }, (_, i) => ({
  properties: {
    GEOID: String(i).padStart(5, '0'),
    CASTHMA: 8 + i * 0.1,
    CSMOKING: 15 + i * 0.2 + (i % 3),
    TRI_AIR_LBS: (i * 7919) % 50, // a scrambled order
    ...(i < 3 ? { RPL_THEMES: i / 10 } : {}),
  },
}));
const index = buildCountyIndex(features, sampleMeasures);

describe('runScan', () => {
  it('starting from an outcome, tests every exposure and covariate', () => {
    const result = runScan(index, sampleMeasures, 'outcome', 'CASTHMA')!;
    expect(result.focus.id).toBe('CASTHMA');
    expect(result.rows.map((row) => row.measure.id).sort()).toEqual(['CSMOKING', 'TRI_AIR_LBS']);
    // Too few counties have social vulnerability values to test
    expect(result.skipped.map((m) => m.id)).toEqual(['RPL_THEMES']);

    const smoking = result.rows.find((row) => row.measure.id === 'CSMOKING')!;
    const releases = result.rows.find((row) => row.measure.id === 'TRI_AIR_LBS')!;
    expect(smoking.r).toBeGreaterThan(0.9);
    expect(smoking.n).toBe(50);
    expect(smoking.log10q).toBeLessThan(Math.log10(0.05));
    expect(Math.abs(releases.r)).toBeLessThan(0.3);
    expect(releases.log10q).toBeGreaterThan(Math.log10(0.05));
    // q is never smaller than p
    for (const row of result.rows) expect(row.log10q).toBeGreaterThanOrEqual(row.log10p);
  });

  it('starting from an exposure, tests every outcome', () => {
    const result = runScan(index, sampleMeasures, 'exposure', 'TRI_AIR_LBS')!;
    expect(result.rows.map((row) => row.measure.id)).toEqual(['CASTHMA']);
  });

  it('adjusts for covariates, never adjusting a measure for itself', () => {
    const result = runScan(index, sampleMeasures, 'outcome', 'CASTHMA', ['CSMOKING'])!;
    const smoking = result.rows.find((row) => row.measure.id === 'CSMOKING')!;
    const releases = result.rows.find((row) => row.measure.id === 'TRI_AIR_LBS')!;
    expect(smoking.adjustedFor).toEqual([]);
    expect(smoking.r).toBeCloseTo(smoking.rawR!, 10);
    expect(releases.adjustedFor).toEqual(['CSMOKING']);
    expect(releases.rawR).not.toBeNull();
    expect(releases.r).not.toBeCloseTo(releases.rawR!, 5);
  });

  it('ignores adjustment ids it does not know', () => {
    const result = runScan(index, sampleMeasures, 'outcome', 'CASTHMA', ['NOPE'])!;
    expect(result.rows.every((row) => row.adjustedFor.length === 0)).toBe(true);
  });

  it('returns null for an unknown measure', () => {
    expect(runScan(index, sampleMeasures, 'outcome', 'NOPE')).toBeNull();
  });
});

describe('scan helpers', () => {
  it('offers outcomes or exposures to start from', () => {
    expect(focusChoices(sampleMeasures, 'outcome').map((m) => m.id)).toEqual(['CASTHMA']);
    expect(focusChoices(sampleMeasures, 'exposure').map((m) => m.id)).toEqual(['TRI_AIR_LBS']);
  });

  it('always puts the outcome going up on the two-measure map', () => {
    expect(pairForResult('outcome', 'CASTHMA', 'CSMOKING')).toEqual({ yId: 'CASTHMA', xId: 'CSMOKING' });
    expect(pairForResult('exposure', 'TRI_AIR_LBS', 'CASTHMA')).toEqual({ yId: 'CASTHMA', xId: 'TRI_AIR_LBS' });
  });
});
