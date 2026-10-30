// Checks the real built data file, public/data/measures.json (rebuild it with: npm run data).
// Catches problems a data rebuild could introduce, before they reach the map.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MEASURE_ID, KEY_MEASURE_IDS, MEASURE_ROLES, type Measure } from './config';

const measures = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/measures.json'), 'utf8')
) as Measure[];
const ids = measures.map((m) => m.id);

describe('public/data/measures.json', () => {
  it('has unique measure ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every measure a valid role', () => {
    for (const m of measures) expect(MEASURE_ROLES, `${m.id} has role "${m.role}"`).toContain(m.role);
  });

  it('has at least one outcome and one exposure, so scans have something to test', () => {
    const roles = new Set(measures.map((m) => m.role));
    expect(roles).toContain('outcome');
    expect(roles).toContain('exposure');
  });

  it('includes the default measure and every key measure', () => {
    expect(ids).toContain(DEFAULT_MEASURE_ID);
    for (const id of KEY_MEASURE_IDS) expect(ids, `key measure ${id}`).toContain(id);
  });

  it('has consistent value ranges for every measure', () => {
    for (const m of measures) {
      expect(m.counties, m.id).toBeGreaterThan(0);
      expect(m.min, m.id).toBeLessThanOrEqual(m.p05);
      expect(m.p05, m.id).toBeLessThanOrEqual(m.p95);
      expect(m.p95, m.id).toBeLessThanOrEqual(m.max);
    }
  });

  it('has display information for every measure', () => {
    for (const m of measures) {
      expect(m.name && m.short && m.category && m.source && m.period, m.id).toBeTruthy();
      expect(['linear', 'log'], m.id).toContain(m.scale);
      expect(Number.isInteger(m.decimals), m.id).toBe(true);
    }
  });
});
