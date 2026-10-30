// Statistics shared by the two-variable map and the outcome and exposure scans,
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

// Counties with a value for every listed measure; one column of values per id, in matching order
export function completeCases(index: CountyIndex, ids: string[]) {
  const fips: string[] = [];
  const columns: number[][] = ids.map(() => []);
  for (const [code, props] of index.byFips) {
    const row = ids.map((id) => measureValue(props, id));
    if (row.some((v) => v === null)) continue;
    fips.push(code);
    row.forEach((v, j) => columns[j].push(v as number));
  }
  return { fips, columns };
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

// ---------- Significance tests (for the scans) ----------

// log of the gamma function (Lanczos approximation, about 15 significant digits)
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
export function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - logGamma(1 - z);
  z -= 1;
  let sum = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) sum += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

// Continued fraction for the incomplete beta function (Numerical Recipes, betacf)
function betaContinuedFraction(x: number, a: number, b: number): number {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < 1e-14) break;
  }
  return h;
}

// Natural log of the regularized incomplete beta function I_x(a, b). Working in logs keeps
// tiny p-values (like 1e-200, common with 3,000 counties) from rounding to zero.
export function logIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return -Infinity;
  if (x >= 1) return 0;
  const logFront = a * Math.log(x) + b * Math.log(1 - x) - (logGamma(a) + logGamma(b) - logGamma(a + b));
  if (x < (a + 1) / (a + b + 2)) return logFront + Math.log(betaContinuedFraction(x, a, b) / a);
  return Math.log1p(-Math.exp(logFront) * (betaContinuedFraction(1 - x, b, a) / b));
}

// log10 of the two-sided p-value for Student's t with df degrees of freedom
export function log10PValueT(t: number, df: number): number {
  if (!Number.isFinite(t)) return -Infinity;
  return logIncompleteBeta(df / (df + t * t), df / 2, 0.5) / Math.LN10;
}

export interface CorrelationTest {
  n: number; // counties with both values
  nEff: number; // effective sample size the test used: n, or less after a spatial correction
  r: number; // Spearman rank correlation
  log10p: number; // log10 of the two-sided p-value (t approximation, nEff - 2 - covariates degrees of freedom)
  ciLow: number; // 95% confidence interval for r (Fisher z, Bonett–Wright standard error)
  ciHigh: number;
}

// p-value and 95% CI for a (partial) correlation r from n pairs, adjusted for k covariates.
// nEff (default n) is the effective sample size; a spatial correction makes it smaller.
function correlationTest(r: number, n: number, k: number, nEff = n): CorrelationTest | null {
  if (n - 2 - k < 2) return null;
  const df = Math.max(1, nEff - 2 - k);
  const rr = Math.min(Math.abs(r), 1 - 1e-15); // keep t finite when r is exactly ±1
  const t = rr * Math.sqrt(df / (1 - rr * rr));
  const z = Math.atanh(rr) * Math.sign(r);
  const se = Math.sqrt((1 + (r * r) / 2) / Math.max(1, df - 1));
  return { n, nEff, r, log10p: log10PValueT(t, df), ciLow: Math.tanh(z - 1.96 * se), ciHigh: Math.tanh(z + 1.96 * se) };
}

// Spearman correlation with its p-value and 95% CI; null when it can't be computed
export function spearmanTest(x: number[], y: number[]): CorrelationTest | null {
  const r = spearman(x, y);
  return r === null ? null : correlationTest(r, x.length, 0);
}

// Given the two vectors actually being correlated (ranks, or ranks with covariates removed),
// returns the effective sample size to test with. See spatial.ts.
export type EffectiveN = (a: number[], b: number[]) => number;

// Least-squares residuals of y on an intercept plus the given columns; null if the columns
// are redundant (one is a combination of the others)
export function residuals(y: number[], columns: number[][]): number[] | null {
  const n = y.length;
  const p = columns.length + 1;
  const xAt = (i: number, j: number) => (j === 0 ? 1 : columns[j - 1][i]);
  // Normal equations (X'X) b = X'y, solved by Gaussian elimination with partial pivoting
  const a = Array.from({ length: p }, () => new Array<number>(p + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      const xij = xAt(i, j);
      for (let k = j; k < p; k++) a[j][k] += xij * xAt(i, k);
      a[j][p] += xij * y[i];
    }
  }
  for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) a[j][k] = a[k][j];
  const scale = Math.max(...a.map((row, j) => Math.abs(row[j])), 1);
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-10 * scale) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= p; c++) a[r][c] -= f * a[col][c];
    }
  }
  const b = a.map((row, j) => row[p] / row[j]);
  return y.map((v, i) => {
    let fit = 0;
    for (let j = 0; j < p; j++) fit += b[j] * xAt(i, j);
    return v - fit;
  });
}

// Partial Spearman correlation: rank every variable, remove what the covariates' ranks explain
// (linear regression), then correlate what's left. With no covariates it's plain Spearman.
export function partialSpearmanTest(
  x: number[],
  y: number[],
  covariates: number[][],
  effectiveN?: EffectiveN
): CorrelationTest | null {
  if (covariates.length === 0 && !effectiveN) return spearmanTest(x, y);
  const rankedCovariates = covariates.map(ranks);
  const rx = covariates.length ? residuals(ranks(x), rankedCovariates) : ranks(x);
  const ry = covariates.length ? residuals(ranks(y), rankedCovariates) : ranks(y);
  if (!rx || !ry) return null;
  const r = pearson(rx, ry);
  if (r === null) return null;
  return correlationTest(r, x.length, covariates.length, effectiveN ? effectiveN(rx, ry) : x.length);
}

// Benjamini–Hochberg false discovery rate: turns log10 p-values into log10 q-values, same order
export function benjaminiHochberg(log10p: number[]): number[] {
  const m = log10p.length;
  const order = log10p.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(m);
  let running = 0; // q can't exceed 1 (log10 q ≤ 0), and never drops going up the list
  for (let k = m - 1; k >= 0; k--) {
    running = Math.min(running, order[k].p + Math.log10(m / (k + 1)));
    q[order[k].i] = running;
  }
  return q;
}

// Formats a probability from its log10, e.g. "0.042", "3.1e-12", "<1e-300"
export function formatLog10P(log10p: number): string {
  if (log10p === -Infinity || log10p < -300) return '<1e-300';
  if (log10p >= -3) return (10 ** log10p).toFixed(3);
  const exponent = Math.floor(log10p);
  let mantissa = 10 ** (log10p - exponent);
  let e = exponent;
  if (Number(mantissa.toFixed(1)) >= 10) {
    mantissa /= 10;
    e += 1;
  }
  return `${mantissa.toFixed(1)}e${e}`;
}
