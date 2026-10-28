// The county table in memory: look up a county by FIPS code, read its values,
// and rank a value against all US counties. Pure functions, so they're easy to test.
import type { Measure } from './config';

export type CountyProps = { [key: string]: unknown };

export interface CountyIndex {
  byFips: Map<string, CountyProps>; // county FIPS -> its properties from counties.geojson
  sorted: Map<string, number[]>; // measure id -> every county's value, ascending
}

export function buildCountyIndex(
  features: Array<{ properties: CountyProps | null }>,
  measures: Measure[]
): CountyIndex {
  const byFips = new Map<string, CountyProps>();
  for (const feature of features) {
    if (feature.properties?.GEOID) byFips.set(String(feature.properties.GEOID), feature.properties);
  }

  const sorted = new Map<string, number[]>();
  for (const measure of measures) {
    const values: number[] = [];
    for (const props of byFips.values()) {
      const value = measureValue(props, measure.id);
      if (value !== null) values.push(value);
    }
    sorted.set(measure.id, values.sort((a, b) => a - b));
  }

  return { byFips, sorted };
}

// A county's value for a measure (or a field like CASTHMA_lo), or null if it has none
export function measureValue(props: CountyProps | undefined, key: string): number | null {
  const value = props?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Percentile rank, 0-100: the share of counties with a lower value, counting ties as half.
// sorted must be ascending.
export function percentileRank(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0;
  const below = firstIndex(sorted, (v) => v >= value);
  const notAbove = firstIndex(sorted, (v) => v > value);
  return Math.round(((below + (notAbove - below) / 2) / sorted.length) * 100);
}

// First index where test(value) is true, by binary search (test must flip once, false -> true)
function firstIndex(sorted: number[], test: (v: number) => boolean): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (test(sorted[mid])) high = mid;
    else low = mid + 1;
  }
  return low;
}

// "Cook, IL"; Puerto Rico municipios have no state abbreviation in the data yet
export function countyLabel(props: CountyProps | undefined, fallback = 'Unknown county'): string {
  if (!props) return fallback;
  const name = String(props.NAME ?? fallback);
  return props.STUSPS ? `${name}, ${props.STUSPS}` : name;
}

// 1 -> "1st", 22 -> "22nd", 13 -> "13th"
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
