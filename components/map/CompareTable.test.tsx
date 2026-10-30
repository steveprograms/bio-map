import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KEY_MEASURE_IDS } from './config';
import { buildCountyIndex } from './countyStats';
import CompareTable from './CompareTable';
import { sampleCountyFeatures, sampleMeasures } from './test-fixtures';

const index = buildCountyIndex(sampleCountyFeatures, sampleMeasures);

function renderTable(overrides: Partial<Parameters<typeof CompareTable>[0]> = {}) {
  const props = {
    selected: ['54005', '01001'],
    index,
    measures: sampleMeasures,
    mapMeasureIds: ['CASTHMA'],
    onMeasureChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<CompareTable {...props} />);
  return props;
}

const measureRows = () => screen.getAllByRole('row').filter((row) => within(row).queryAllByRole('cell').length > 0);

describe('CompareTable', () => {
  it('has a column per selected county, in selection order', () => {
    renderTable();
    const head = screen.getAllByRole('rowgroup')[0]; // <thead>
    const headers = within(head).getAllByRole('columnheader').map((h) => h.getAttribute('aria-label') ?? h.textContent);
    expect(headers).toEqual(['Measure', 'Boone, WV', 'Autauga, AL']);
  });

  it('starts with key measures plus the measure shown on the map', () => {
    renderTable({ mapMeasureIds: ['CASTHMA'] });
    const expected = sampleMeasures.filter((m) => KEY_MEASURE_IDS.includes(m.id) || m.id === 'CASTHMA');
    expect(expected.length).toBeLessThan(sampleMeasures.length); // so the next test shows a difference
    expect(measureRows()).toHaveLength(expected.length);

    // The map measure is included even when it isn't a key measure
    renderTable({ mapMeasureIds: ['TRI_AIR_LBS'] });
    expect(screen.getAllByRole('button', { name: 'Toxic Air Releases' }).length).toBeGreaterThan(0);
  });

  it('can show every measure', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: `All ${sampleMeasures.length} measures` }));
    expect(measureRows()).toHaveLength(sampleMeasures.length);
  });

  it('shows values with percentiles, and "No data" where missing', () => {
    renderTable({ selected: ['54005', '21001'] });
    const asthma = measureRows().find((row) => within(row).queryByText('Current Asthma'))!;
    expect(within(asthma).getByText('12.6%')).toBeInTheDocument();
    expect(within(asthma).getByText('No data')).toBeInTheDocument();
    expect(within(asthma).getByText('75th pctl')).toBeInTheDocument();
  });

  it('shows a measure on the map when its name is clicked', async () => {
    const user = userEvent.setup();
    const props = renderTable();
    await user.click(screen.getByRole('button', { name: 'Current Smoking' }));
    expect(props.onMeasureChange).toHaveBeenCalledWith('CSMOKING');
  });

  it('closes with the Close button or Escape', async () => {
    const user = userEvent.setup();
    const props = renderTable();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
