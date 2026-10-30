// Spatial autocorrelation correction for correlation tests (Dutilleul's modified t-test).
//
// Nearby counties resemble each other, so 3,000 counties carry far less independent information
// than 3,000 separate observations. Dutilleul (1993) estimates an "effective sample size" from how
// strongly each of the two variables resembles itself at a range of distances (its correlogram):
//   n_eff = 1 + n² / trace(Rx Ry),  trace(Rx Ry) ≈ n + Σ_k W_k ρx(k) ρy(k)
// where W_k is the number of ordered county pairs in distance class k and ρ(k) is the
// Moran-type autocorrelation of a variable among those pairs. The test then uses n_eff - 2
// degrees of freedom instead of n - 2. Same idea as SAM and R's SpatialPack::modified.ttest.
import type { CountyIndex } from './countyStats';

// Distance classes in km: narrow up close, where counties resemble each other most
export const DISTANCE_BREAKS_KM = [40, 80, 120, 160, 240, 320, 480, 640, 960, 1280, 1920, 2560, 3840, Infinity];

export interface SpatialPairs {
  fips: string[]; // counties with a centroid, in a fixed order
  position: Map<string, number>; // FIPS -> its index in fips
  pairClass: Uint8Array; // distance class of every pair i < j, in upper-triangle order
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Great-circle distance in km between two [longitude, latitude] points
export function distanceKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const classOf = (km: number) => {
  let k = 0;
  while (km > DISTANCE_BREAKS_KM[k]) k++;
  return k;
};

// Index of pair (i, j), i < j, in upper-triangle order for n items
const pairIndex = (i: number, j: number, n: number) => i * n - (i * (i + 1)) / 2 + (j - i - 1);

// Distance class of every pair of counties. About 5 million pairs for US counties: build once.
export function buildSpatialPairs(index: CountyIndex): SpatialPairs | null {
  const fips = [...index.centroids.keys()];
  const n = fips.length;
  if (n < 4) return null;
  const points = fips.map((f) => index.centroids.get(f)!);
  const pairClass = new Uint8Array((n * (n - 1)) / 2);
  let p = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairClass[p++] = classOf(distanceKm(points[i], points[j]));
  }
  return { fips, position: new Map(fips.map((f, i) => [f, i])), pairClass };
}

// Effective sample size for correlating a and b, measured at the given counties (same order).
// Counties without a centroid are left out of the correlograms. Never more than n, never under 3.
export function effectiveSampleSize(pairs: SpatialPairs, fips: string[], a: number[], b: number[]): number {
  const n = fips.length;
  const K = DISTANCE_BREAKS_KM.length;
  // Positions of these counties in the pair table, with their values, sorted by position
  const items = fips
    .map((f, i) => ({ pos: pairs.position.get(f), i }))
    .filter((item): item is { pos: number; i: number } => item.pos !== undefined)
    .sort((x, y) => x.pos - y.pos);
  const m = items.length;
  if (m < 4) return n;

  const meanA = items.reduce((s, it) => s + a[it.i], 0) / m;
  const meanB = items.reduce((s, it) => s + b[it.i], 0) / m;
  const pos = Int32Array.from(items, (it) => it.pos);
  const da = Float64Array.from(items, (it) => a[it.i] - meanA);
  const db = Float64Array.from(items, (it) => b[it.i] - meanB);
  let ssA = 0;
  let ssB = 0;
  for (let i = 0; i < m; i++) {
    ssA += da[i] * da[i];
    ssB += db[i] * db[i];
  }
  if (ssA === 0 || ssB === 0) return n;

  const sumA = new Float64Array(K);
  const sumB = new Float64Array(K);
  const count = new Float64Array(K);
  const total = pairs.fips.length;
  for (let i = 0; i < m; i++) {
    const row = pos[i] * total - (pos[i] * (pos[i] + 1)) / 2 - pos[i] - 1; // pairIndex(pos[i], j) = row + pos[j]
    const ai = da[i];
    const bi = db[i];
    for (let j = i + 1; j < m; j++) {
      const k = pairs.pairClass[row + pos[j]];
      sumA[k] += ai * da[j];
      sumB[k] += bi * db[j];
      count[k]++;
    }
  }

  // trace(Rx Ry) ≈ m + Σ 2·count_k·ρa(k)·ρb(k), with ρ(k) = m·S_k / (count_k · SS)
  let trace = m;
  for (let k = 0; k < K; k++) {
    if (count[k] === 0) continue;
    const rhoA = (m * sumA[k]) / (count[k] * ssA);
    const rhoB = (m * sumB[k]) / (count[k] * ssB);
    trace += 2 * count[k] * rhoA * rhoB;
  }
  if (trace <= 0) return n;
  const nEff = 1 + (m * m) / trace;
  return Math.min(n, Math.max(3, nEff));
}

export { pairIndex as _pairIndex }; // for tests
