import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCAN_FOCUS_LABELS, SCAN_KIND_LABELS, SUGGESTED_ADJUSTMENT } from './config';
import { buildCountyIndex } from './countyStats';
import ScanPanel from './ScanPanel';
import { sampleMeasures } from './test-fixtures';

// Same made-up counties as scan.test.ts: smoking tracks asthma, toxic releases don't
const features = Array.from({ length: 50 }, (_, i) => ({
  properties: {
    GEOID: String(i).padStart(5, '0'),
    CASTHMA: 8 + i * 0.1,
    CSMOKING: 15 + i * 0.2 + (i % 3),
    TRI_AIR_LBS: (i * 7919) % 50,
    ...(i < 3 ? { RPL_THEMES: i / 10 } : {}),
  },
}));
const index = buildCountyIndex(features, sampleMeasures);

function renderScan(overrides: Partial<Parameters<typeof ScanPanel>[0]> = {}) {
  const props = {
    index,
    measures: sampleMeasures,
    kind: 'outcome' as const,
    onKindChange: vi.fn(),
    focusId: 'CASTHMA',
    onFocusChange: vi.fn(),
    adjustFor: [] as string[],
    onAdjustForChange: vi.fn(),
    spatialCorrection: true,
    onSpatialCorrectionChange: vi.fn(),
    onMapPair: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ScanPanel {...props} />);
  return props;
}

const resultRows = () => within(screen.getByRole('table', { name: 'Scan results' })).getAllByRole('row').slice(1);
const rowNames = () => resultRows().map((row) => within(row).getByRole('rowheader').textContent);

describe('ScanPanel', () => {
  it('lists results with the strongest evidence first', () => {
    renderScan();
    expect(rowNames()).toEqual(['Current Smoking', 'Toxic Air Releases']);
    expect(screen.getByText(/Current Asthma vs\. 2 exposures and covariates/)).toBeInTheDocument();
    expect(screen.getByText('Not tested (too few counties with every value needed): Overall SVI.')).toBeInTheDocument();
  });

  it('draws a point per result on the volcano plot', () => {
    renderScan();
    const plot = screen.getByRole('group', { name: 'Volcano plot' });
    expect(within(plot).getAllByRole('button')).toHaveLength(2);
    expect(within(plot).getByRole('button', { name: /^Current Smoking: r = 0\.9/ })).toBeInTheDocument();
  });

  it('sorts by a column when its header is clicked', async () => {
    const user = userEvent.setup();
    renderScan();
    await user.click(screen.getByRole('button', { name: /^Measure/ }));
    expect(rowNames()).toEqual(['Current Smoking', 'Toxic Air Releases']);
    await user.click(screen.getByRole('button', { name: /^Measure/ }));
    expect(rowNames()).toEqual(['Toxic Air Releases', 'Current Smoking']);
    expect(screen.getByRole('columnheader', { name: /Measure/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('maps a result with the outcome going up, from the table or the plot', async () => {
    const user = userEvent.setup();
    const props = renderScan();
    await user.click(within(resultRows()[0]).getByRole('button', { name: 'Current Smoking' }));
    expect(props.onMapPair).toHaveBeenLastCalledWith({ yId: 'CASTHMA', xId: 'CSMOKING' });
    await user.click(screen.getByRole('button', { name: /^Toxic Air Releases: r =/ }));
    expect(props.onMapPair).toHaveBeenLastCalledWith({ yId: 'CASTHMA', xId: 'TRI_AIR_LBS' });
  });

  it('switches scan type and starting measure', async () => {
    const user = userEvent.setup();
    const props = renderScan();
    await user.click(screen.getByRole('button', { name: SCAN_KIND_LABELS.exposure }));
    expect(props.onKindChange).toHaveBeenCalledWith('exposure');
    expect(screen.getByLabelText(SCAN_FOCUS_LABELS.outcome)).toHaveValue('CASTHMA');
  });

  it('in an exposure scan, tests the exposure against outcomes', () => {
    renderScan({ kind: 'exposure', focusId: 'TRI_AIR_LBS' });
    expect(rowNames()).toEqual(['Current Asthma']);
    expect(screen.getByLabelText(SCAN_FOCUS_LABELS.exposure)).toHaveValue('TRI_AIR_LBS');
  });

  it('explains its cautions', () => {
    renderScan();
    expect(screen.getByText(/nearby counties resemble each other \(spatial autocorrelation\)/)).toBeInTheDocument();
  });

  it('closes with the Close button or Escape', async () => {
    const user = userEvent.setup();
    const props = renderScan();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('is unadjusted by default, with no unadjusted-r column', () => {
    renderScan();
    expect(screen.getByText('nothing (unadjusted)')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Unadjusted r/ })).not.toBeInTheDocument();
  });

  it('chooses covariates to adjust for', async () => {
    const user = userEvent.setup();
    const props = renderScan();
    await user.click(screen.getByRole('button', { name: 'Choose…' }));
    const choices = screen.getByRole('group', { name: 'Covariates to adjust for' });
    await user.click(within(choices).getByLabelText('Current Smoking'));
    expect(props.onAdjustForChange).toHaveBeenLastCalledWith(['CSMOKING']);
    // Only covariates are offered
    expect(within(choices).queryByLabelText('Toxic Air Releases')).not.toBeInTheDocument();
  });

  it('offers the suggested set, limited to measures that exist', async () => {
    const user = userEvent.setup();
    const props = renderScan();
    await user.click(screen.getByRole('button', { name: /^Suggested:/ }));
    const available = SUGGESTED_ADJUSTMENT.filter((id) => sampleMeasures.some((m) => m.id === id));
    expect(props.onAdjustForChange).toHaveBeenLastCalledWith(available);
  });

  it('shows adjusted and unadjusted r when adjusting', async () => {
    const user = userEvent.setup();
    const props = renderScan({ adjustFor: ['CSMOKING'] });
    expect(screen.getByText('Current Smoking', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Unadjusted r/ })).toBeInTheDocument();
    expect(screen.getByText(/Partial Spearman r with Current Asthma/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(props.onAdjustForChange).toHaveBeenLastCalledWith([]);
  });

  it('turns the spatial correction off only when county locations are missing', () => {
    renderScan(); // the made-up counties have no outlines
    const toggle = screen.getByLabelText('Correct for spatial autocorrelation');
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText(/^eff\. /)).not.toBeInTheDocument();
  });

  it('shows effective county counts once the spatial correction finishes', async () => {
    // Same counties, laid out on a grid with outlines so they have locations
    const located = features.map((f, i) => {
      const x = -100 + (i % 10) * 0.5;
      const y = 35 + Math.floor(i / 10) * 0.5;
      const ring = [[x - 0.2, y - 0.2], [x + 0.2, y - 0.2], [x + 0.2, y + 0.2], [x - 0.2, y + 0.2], [x - 0.2, y - 0.2]];
      return { ...f, geometry: { type: 'Polygon', coordinates: [ring] } };
    });
    const user = userEvent.setup();
    const props = renderScan({ index: buildCountyIndex(located, sampleMeasures) });
    expect(screen.getByLabelText('Correct for spatial autocorrelation')).toBeChecked();
    expect((await screen.findAllByText(/^eff\. /)).length).toBe(2);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Correct for spatial autocorrelation'));
    expect(props.onSpatialCorrectionChange).toHaveBeenCalledWith(false);
  });
});
