import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_SELECTED } from './config';
import { buildCountyIndex } from './countyStats';
import SelectionPanel from './SelectionPanel';
import { sampleCountyFeatures, sampleMeasures } from './test-fixtures';

const index = buildCountyIndex(sampleCountyFeatures, sampleMeasures);

function renderPanel(overrides: Partial<Parameters<typeof SelectionPanel>[0]> = {}) {
  const props = {
    selected: ['54005', '21001'],
    index,
    measures: sampleMeasures,
    measureId: 'CASTHMA',
    onRemove: vi.fn(),
    onClear: vi.fn(),
    onCompare: vi.fn(),
    ...overrides,
  };
  render(<SelectionPanel {...props} />);
  return props;
}

describe('SelectionPanel', () => {
  it('shows nothing until a county is selected', () => {
    renderPanel({ selected: [] });
    expect(screen.queryByRole('region', { name: 'Selected counties' })).not.toBeInTheDocument();
  });

  it('shows a numbered card per selected county, in selection order', () => {
    renderPanel();
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['Boone, WV', 'Adair, KY']);
    expect(within(cards[0]).getByText('1')).toBeInTheDocument();
    expect(within(cards[1]).getByText('2')).toBeInTheDocument();
    expect(screen.getByText(`Selected counties (2 of ${MAX_SELECTED})`)).toBeInTheDocument();
  });

  it('shows the map measure with its value, confidence interval, and percentile', () => {
    renderPanel();
    const boone = screen.getByRole('article', { name: 'Boone, WV' });
    expect(within(boone).getByText(/Population 21,457/)).toBeInTheDocument();
    expect(within(boone).getByText('12.6%')).toBeInTheDocument();
    expect(within(boone).getByText('95% CI 11.0%–14.4%')).toBeInTheDocument();
    // Boone is above Autauga (of the 2 counties with data) for both asthma and smoking
    expect(within(boone).getAllByText('75th percentile')).toHaveLength(2);
  });

  it('says "No data" when a county has no value', () => {
    renderPanel();
    const adair = screen.getByRole('article', { name: 'Adair, KY' });
    expect(within(adair).getAllByText('No data').length).toBeGreaterThan(0);
  });

  it('lists key measures on each card', () => {
    renderPanel();
    const boone = screen.getByRole('article', { name: 'Boone, WV' });
    expect(within(boone).getByText('Current Smoking')).toBeInTheDocument();
    expect(within(boone).getByText('0.77')).toBeInTheDocument(); // Overall SVI
  });

  it('wires up remove, clear, and compare', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Remove Boone, WV' }));
    expect(props.onRemove).toHaveBeenCalledWith('54005');

    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(props.onCompare).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(props.onClear).toHaveBeenCalled();
  });

  it('says when the maximum is reached', () => {
    renderPanel({ selected: Array.from({ length: MAX_SELECTED }, (_, i) => `0000${i}`) });
    expect(screen.getByText(/maximum/)).toBeInTheDocument();
  });

  it('says the data is loading before it arrives', () => {
    renderPanel({ index: null });
    expect(screen.getByText('Loading county data…')).toBeInTheDocument();
  });
});
