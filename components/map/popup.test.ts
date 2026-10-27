import { describe, expect, it } from 'vitest';
import { escapeHtml, formatLbs, triPopupHtml } from './popup';

describe('escapeHtml', () => {
  it('escapes characters that have meaning in HTML', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;'
    );
  });

  it('turns null and undefined into an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('formatLbs', () => {
  it('adds thousands separators', () => {
    expect(formatLbs(1234567)).toBe('1,234,567');
  });

  it('accepts numbers stored as strings', () => {
    expect(formatLbs('2500')).toBe('2,500');
  });

  it('shows missing or invalid values as 0', () => {
    expect(formatLbs(undefined)).toBe('0');
    expect(formatLbs('not a number')).toBe('0');
  });
});

describe('triPopupHtml', () => {
  const facility = {
    name: 'Acme <Chemical> Co',
    city: 'Baton Rouge',
    state: 'LA',
    sector: 'Chemicals',
    air_lbs: 1234567,
    onsite_lbs: 2000000,
    top_air_chems: 'Ammonia; Methanol',
  };

  it('shows the facility name with HTML escaped', () => {
    const html = triPopupHtml(facility);
    expect(html).toContain('Acme &lt;Chemical&gt; Co');
    expect(html).not.toContain('<Chemical>');
  });

  it('shows location, sector, and release amounts', () => {
    const html = triPopupHtml(facility);
    expect(html).toContain('Baton Rouge, LA');
    expect(html).toContain('Chemicals');
    expect(html).toContain('1,234,567 lbs');
    expect(html).toContain('2,000,000 lbs');
  });

  it('lists top air chemicals when there are any', () => {
    expect(triPopupHtml(facility)).toContain('Ammonia; Methanol');
  });

  it('leaves out the chemicals line when there are none', () => {
    expect(triPopupHtml({ ...facility, top_air_chems: '' })).not.toContain('Top air chemicals');
  });
});
