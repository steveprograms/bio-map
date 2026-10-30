// Outcome and exposure scans: test one measure against many, with false discovery rate control.
// Pure functions over the county table; ScanPanel.tsx draws the results.
import type { Measure, MeasureRole, Pair, ScanKind } from './config';
import type { CountyIndex } from './countyStats';
import { effectiveSampleSize, type SpatialPairs } from './spatial';
import { benjaminiHochberg, completeCases, partialSpearmanTest, spearman, type CorrelationTest } from './stats';

// Which measures each scan starts from, and which it tests against
export const SCAN_ROLES: Record<ScanKind, { focus: MeasureRole; targets: MeasureRole[] }> = {
  outcome: { focus: 'outcome', targets: ['exposure', 'covariate'] },
  exposure: { focus: 'exposure', targets: ['outcome'] },
};

export const focusChoices = (measures: Measure[], kind: ScanKind) =>
  measures.filter((m) => m.role === SCAN_ROLES[kind].focus);

// Measures a scan can adjust for
export const adjustmentChoices = (measures: Measure[]) => measures.filter((m) => m.role === 'covariate');

export interface ScanRow extends CorrelationTest {
  measure: Measure;
  log10q: number; // Benjamini–Hochberg q-value across this scan's tests, as log10
  rawR: number | null; // plain Spearman r on the same counties, to compare with the adjusted r
  adjustedFor: string[]; // covariate ids actually used for this row (never the pair itself)
}

export interface ScanResult {
  focus: Measure;
  spatial: boolean; // whether p and q use the spatial autocorrelation correction
  rows: ScanRow[]; // in measure order; the panel sorts them
  skipped: Measure[]; // targets with too few counties with both values
}

// adjustFor: covariate ids to adjust for (partial Spearman). Each test uses the counties that have
// every value it needs, and a row's own measure is never adjusted for itself.
// spatial: when given, p and q use Dutilleul's effective sample size (see spatial.ts).
//
// A generator so the panel can run the slow, spatially corrected version a few tests at a time
// without freezing the page: it yields the number of tests done after each one. runScan runs it all at once.
export function* scanSteps(
  index: CountyIndex,
  measures: Measure[],
  kind: ScanKind,
  focusId: string,
  adjustFor: string[] = [],
  spatial: SpatialPairs | null = null
): Generator<{ done: number; total: number }, ScanResult | null> {
  const focus = measures.find((m) => m.id === focusId);
  if (!focus) return null;
  const targets = measures.filter((m) => m.id !== focus.id && SCAN_ROLES[kind].targets.includes(m.role));

  const known = new Set(measures.map((m) => m.id));
  const tests: { measure: Measure; test: CorrelationTest; rawR: number | null; adjustedFor: string[] }[] = [];
  const skipped: Measure[] = [];
  for (const [done, measure] of targets.entries()) {
    const adjustedFor = adjustFor.filter((id) => known.has(id) && id !== measure.id && id !== focus.id);
    const {
      fips,
      columns: [x, y, ...covariates],
    } = completeCases(index, [measure.id, focus.id, ...adjustedFor]);
    const effectiveN = spatial ? (a: number[], b: number[]) => effectiveSampleSize(spatial, fips, a, b) : undefined;
    const test = partialSpearmanTest(x, y, covariates, effectiveN);
    if (test) tests.push({ measure, test, rawR: adjustedFor.length ? spearman(x, y) : test.r, adjustedFor });
    else skipped.push(measure);
    yield { done: done + 1, total: targets.length };
  }

  const q = benjaminiHochberg(tests.map(({ test }) => test.log10p));
  return {
    focus,
    spatial: spatial !== null,
    rows: tests.map(({ measure, test, rawR, adjustedFor }, i) => ({ measure, ...test, log10q: q[i], rawR, adjustedFor })),
    skipped,
  };
}

export function runScan(...args: Parameters<typeof scanSteps>): ScanResult | null {
  const steps = scanSteps(...args);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

// The two-measure map for one scan result: the outcome goes up, the other measure across
export const pairForResult = (kind: ScanKind, focusId: string, targetId: string): Pair =>
  kind === 'outcome' ? { yId: focusId, xId: targetId } : { yId: targetId, xId: focusId };
