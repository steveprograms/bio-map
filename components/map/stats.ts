// Statistics shared by the two-variable map and (later) the outcome and exposure scans,
// so the same pair of measures always gets the same numbers everywhere in the app.
// Pure functions over the county table; no map code.
import { measureValue, type CountyIndex } from './countyStats';

export type Cuts = [number, number]; // boundaries between low/middle and middle/high thirds

// Counties that have a value for both measures (pairwise-complete), in matching order
export function pairedValues(index: CountyIndex, xId: string, yId: string) {
  const fips: string[] = [];
  const x: number[] = [];
  const y: number[] = [];
  for (const [code, props] of index.byFips) {
    const xv = measureValue(props, xId);
    const yv = measureValue(props, yId);
    if (xv === null || yv === null) continue;
    fips.push(code);
    x.push(xv);
    y.push(yv);
  }
  return { fips, x, y };
}

// Ranks 1..n, with tied values sharing the average of their ranks
export function ranks(values: number[]): number[] {
  const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1].value === order[start].value) end++;
    const averageRank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) result[order[k].i] = averageRank;
    start = end + 1;
  }
  return result;
}

// Pearson correlation; null when there are fewer than 3 pairs or a variable doesn't vary
export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n) return null;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// Spearman rank correlation: Pearson on ranks. Uses only order, so skewed measures
// (like pounds released) and a few extreme counties don't dominate.
export const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));

// Boundaries that split values into thirds: the largest value in the lowest third, and the
// largest in the middle third (so 9 values split exactly 3 / 3 / 3)
export function tercileCuts(values: number[]): Cuts {
  if (values.length === 0) return [0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return [at(1 / 3), at(2 / 3)];
}

// 0 = low (≤ first cut), 1 = middle (≤ second cut), 2 = high. Must match pairBinExpr in expressions.ts.
export const binOf = (value: number, cuts: Cuts): 0 | 1 | 2 => (value <= cuts[0] ? 0 : value <= cuts[1] ? 1 : 2);

// Position in the 3×3 grid: column (x third) + 3 × row (y third), so 0 = low/low and 8 = high/high
export const cellOf = (xBin: number, yBin: number) => xBin + 3 * yBin;

export interface PairSummary {
  n: number; // counties with both values
  r: number | null; // Spearman rank correlation
  xCuts: Cuts;
  yCuts: Cuts;
  counts: number[]; // counties in each of the 9 cells, indexed by cellOf
}

export function summarizePair(index: CountyIndex, xId: string, yId: string): PairSummary {
  const { x, y } = pairedValues(index, xId, yId);
  const xCuts = tercileCuts(x);
  const yCuts = tercileCuts(y);
  const counts = new Array<number>(9).fill(0);
  for (let i = 0; i < x.length; i++) counts[cellOf(binOf(x[i], xCuts), binOf(y[i], yCuts))]++;
  return { n: x.length, r: spearman(x, y), xCuts, yCuts, counts };
}
