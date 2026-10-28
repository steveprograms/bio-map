import { describe, expect, it } from 'vitest';
import { buildCountyIndex, countyLabel, measureValue, ordinal, percentileRank } from './countyStats';
import { sampleCountyFeatures, sampleMeasures } from './test-fixtures';

describe('buildCountyIndex', () => {
  const index = buildCountyIndex(sampleCountyFeatures, sampleMeasures);

  it('looks counties up by FIPS code', () => {
    expect(index.byFips.get('01001')?.NAME).toBe('Autauga');
    expect(index.byFips.size).toBe(3);
  });

  it('keeps each measure\'s values sorted, leaving out counties with no data', () => {
    expect(index.sorted.get('CASTHMA')).toEqual([10.1, 12.6]); // Adair has no asthma estimate
    expect(index.sorted.get('RPL_THEMES')).toEqual([0.42, 0.7, 0.77]);
  });
});

describe('measureValue', () => {
  const props = { CASTHMA: 12.6, NAME: 'Boone', EMPTY: null };

  it('returns numbers', () => expect(measureValue(props, 'CASTHMA')).toBe(12.6));
  it('returns null for missing, empty, or non-numeric fields', () => {
    expect(measureValue(props, 'COPD')).toBeNull();
    expect(measureValue(props, 'EMPTY')).toBeNull();
    expect(measureValue(props, 'NAME')).toBeNull();
    expect(measureValue(undefined, 'CASTHMA')).toBeNull();
  });
});

describe('percentileRank', () => {
  it('is the share of counties with a lower value', () => {
    expect(percentileRank([1, 2, 3, 4], 4)).toBe(88); // 3 below + half of 1 tie = 3.5 of 4
    expect(percentileRank([1, 2, 3, 4], 1)).toBe(13);
  });

  it('counts ties as half, so many zeros land in the middle of the zeros', () => {
    expect(percentileRank([0, 0, 0, 0, 5], 0)).toBe(40);
  });

  it('handles values outside the data and empty data', () => {
    expect(percentileRank([1, 2, 3], 10)).toBe(100);
    expect(percentileRank([1, 2, 3], 0)).toBe(0);
    expect(percentileRank([], 5)).toBe(0);
  });
});

describe('countyLabel', () => {
  it('combines county name and state', () => expect(countyLabel({ NAME: 'Cook', STUSPS: 'IL' })).toBe('Cook, IL'));
  it('uses the name alone when there is no state', () => expect(countyLabel({ NAME: 'Ponce' })).toBe('Ponce'));
  it('falls back when the county is unknown', () => expect(countyLabel(undefined, 'County 99999')).toBe('County 99999'));
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [42, '42nd'],
    [100, '100th'],
  ])('%i -> %s', (n, expected) => expect(ordinal(n)).toBe(expected));
});
