import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  COUNTY_MODE_LABELS,
  LAYER_LABELS,
  MEASURE_PICKER_LABEL,
  PAIR_PICKER_LABELS,
  SECTOR_COLORS,
  sectorLabel,
  type CountyMode,
  type LayerKey,
  type Pair,
} from './config';
import type { PairSummary } from './stats';
import { sampleMeasures } from './test-fixtures';
import LayerPanel from './LayerPanel';

const allOff = { health: false, tri: false };

// Renders the panel with sensible defaults; override any prop per test
function renderPanel(
  props: Partial<{
    visible: Record<LayerKey, boolean>;
    onToggle: (key: LayerKey) => void;
    measures: typeof sampleMeasures;
    countyMode: CountyMode;
    onCountyModeChange: (mode: CountyMode) => void;
    measureId: string;
    onMeasureChange: (id: string) => void;
    pair: Pair;
    onPairChange: (pair: Pair) => void;
    pairCell: number | null;
    onPairCellChange: (cell: number | null) => void;
    pairSummary: PairSummary | null;
  }> = {}
) {
  return render(
    <LayerPanel
      visible={props.visible ?? allOff}
      onToggle={props.onToggle ?? (() => {})}
      measures={props.measures ?? sampleMeasures}
      countyMode={props.countyMode ?? 'single'}
      onCountyModeChange={props.onCountyModeChange ?? (() => {})}
      measureId={props.measureId ?? 'CASTHMA'}
      onMeasureChange={props.onMeasureChange ?? (() => {})}
      pair={props.pair ?? { xId: 'TRI_AIR_LBS', yId: 'CASTHMA' }}
      onPairChange={props.onPairChange ?? (() => {})}
      pairCell={props.pairCell ?? null}
      onPairCellChange={props.onPairCellChange ?? (() => {})}
      pairSummary={props.pairSummary === undefined ? null : props.pairSummary}
    />
  );
}

describe('LayerPanel', () => {
  it('shows an unchecked checkbox for each layer by default', () => {
    renderPanel();

    expect(screen.getByLabelText(LAYER_LABELS.health)).not.toBeChecked();
    expect(screen.getByLabelText(LAYER_LABELS.tri)).not.toBeChecked();
  });

  it('reports which layer was toggled', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderPanel({ onToggle });

    await user.click(screen.getByLabelText(LAYER_LABELS.health));
    expect(onToggle).toHaveBeenLastCalledWith('health');

    await user.click(screen.getByLabelText(LAYER_LABELS.tri));
    expect(onToggle).toHaveBeenLastCalledWith('tri');
  });

  it('hides legends and the measure picker for layers that are off', () => {
    renderPanel();

    expect(screen.queryByLabelText(MEASURE_PICKER_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
    expect(screen.queryByText('Chemicals')).not.toBeInTheDocument();
  });
});

describe('LayerPanel health measure', () => {
  const healthOn = { health: true, tri: false };

  it('shows the selected measure with its legend', () => {
    renderPanel({ visible: healthOn });

    expect(screen.getByLabelText(LAYER_LABELS.health)).toBeChecked();
    expect(screen.getByLabelText(MEASURE_PICKER_LABEL)).toHaveValue('CASTHMA');
    expect(screen.getByText('≤8.6%')).toBeInTheDocument();
    expect(screen.getByText('12.4%+')).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText(/Current asthma among adults, 2023/)).toBeInTheDocument();
  });

  it('lists every measure in the picker', () => {
    renderPanel({ visible: healthOn });

    for (const measure of sampleMeasures) {
      expect(screen.getByRole('option', { name: measure.short })).toBeInTheDocument();
    }
  });

  it('reports the measure the user picks', async () => {
    const user = userEvent.setup();
    const onMeasureChange = vi.fn();
    renderPanel({ visible: healthOn, onMeasureChange });

    await user.selectOptions(screen.getByLabelText(MEASURE_PICKER_LABEL), 'CSMOKING');
    expect(onMeasureChange).toHaveBeenCalledWith('CSMOKING');
  });

  it('updates the legend for a different measure', () => {
    renderPanel({ visible: healthOn, measureId: 'CSMOKING' });

    expect(screen.getByText('≤10.2%')).toBeInTheDocument();
    expect(screen.getByText('26.5%+')).toBeInTheDocument();
    expect(screen.getByText(/Current cigarette smoking among adults/)).toBeInTheDocument();
  });

  it('shows 0–1 percentile ranks with two decimals and their own source', () => {
    renderPanel({ visible: healthOn, measureId: 'RPL_THEMES' });

    expect(screen.getByText('≤0.05')).toBeInTheDocument();
    expect(screen.getByText('0.95+')).toBeInTheDocument();
    expect(screen.getByText(/Overall social vulnerability, 2018–2022/)).toBeInTheDocument();
    expect(screen.getByText(/Social Vulnerability Index 2022/)).toBeInTheDocument();
  });

  it('shows pound amounts with thousands separators and notes a log scale', () => {
    renderPanel({ visible: healthOn, measureId: 'TRI_AIR_LBS' });

    // The lowest county is 0, so there is no "≤" on the low end
    expect(screen.getByText('0 lbs')).toBeInTheDocument();
    expect(screen.getByText('450,000 lbs+')).toBeInTheDocument();
    expect(screen.getByText(/on a log scale/)).toBeInTheDocument();
  });

  it('groups measures by category in the picker', () => {
    renderPanel({ visible: healthOn });

    const groups = document.querySelectorAll('optgroup');
    expect([...groups].map((g) => g.label)).toEqual([...new Set(sampleMeasures.map((m) => m.category))]);
  });

  it('says measures are loading before they arrive', () => {
    renderPanel({ visible: healthOn, measures: [] });

    expect(screen.getByText('Loading measures…')).toBeInTheDocument();
  });
});

describe('LayerPanel TRI legend', () => {
  it('shows every industry group when TRI is on', () => {
    renderPanel({ visible: { health: false, tri: true } });

    for (const [sector] of SECTOR_COLORS) {
      expect(screen.getByText(sectorLabel(sector))).toBeInTheDocument();
    }
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText(/Toxics Release Inventory/)).toBeInTheDocument();
  });
});

describe('LayerPanel two measures', () => {
  const healthOn = { health: true, tri: false };
  const summary: PairSummary = {
    n: 2950,
    r: 0.18,
    xCuts: [1200, 45000],
    yCuts: [9.6, 10.4],
    counts: [400, 320, 280, 330, 340, 320, 250, 330, 380],
  };
  const renderPair = (props: Parameters<typeof renderPanel>[0] = {}) =>
    renderPanel({ visible: healthOn, countyMode: 'pair', pairSummary: summary, ...props });

  it('switches between one and two measures', async () => {
    const user = userEvent.setup();
    const onCountyModeChange = vi.fn();
    renderPanel({ visible: healthOn, onCountyModeChange });

    const modes = screen.getByRole('group', { name: 'Color counties by' });
    expect(within(modes).getByRole('button', { name: COUNTY_MODE_LABELS.single })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(modes).getByRole('button', { name: COUNTY_MODE_LABELS.pair }));
    expect(onCountyModeChange).toHaveBeenCalledWith('pair');
  });

  it('shows a picker for each direction instead of the single picker', () => {
    renderPair();

    expect(screen.queryByLabelText(MEASURE_PICKER_LABEL)).not.toBeInTheDocument();
    expect(screen.getByLabelText(PAIR_PICKER_LABELS.y)).toHaveValue('CASTHMA');
    expect(screen.getByLabelText(PAIR_PICKER_LABELS.x)).toHaveValue('TRI_AIR_LBS');
  });

  it('lists outcomes first going up and exposures first going across', () => {
    renderPair();

    const firstGroup = (label: string) => screen.getByLabelText(label).querySelector('optgroup')?.label;
    expect(firstGroup(PAIR_PICKER_LABELS.y)).toBe('Health Outcomes');
    const exposure = sampleMeasures.find((m) => m.role === 'exposure')!;
    expect(firstGroup(PAIR_PICKER_LABELS.x)).toBe(exposure.category);
  });

  it('reports a new pair when either picker changes', async () => {
    const user = userEvent.setup();
    const onPairChange = vi.fn();
    renderPair({ onPairChange });

    await user.selectOptions(screen.getByLabelText(PAIR_PICKER_LABELS.y), 'CSMOKING');
    expect(onPairChange).toHaveBeenLastCalledWith({ xId: 'TRI_AIR_LBS', yId: 'CSMOKING' });
    await user.selectOptions(screen.getByLabelText(PAIR_PICKER_LABELS.x), 'RPL_THEMES');
    expect(onPairChange).toHaveBeenLastCalledWith({ xId: 'RPL_THEMES', yId: 'CASTHMA' });
  });

  it('draws a 3×3 legend, high-high in the top right', () => {
    renderPair();

    const squares = within(screen.getByRole('group', { name: 'Legend squares' })).getAllByRole('button');
    expect(squares).toHaveLength(9);
    expect(squares[0]).toHaveAccessibleName('High Current Asthma, Low Toxic Air Releases');
    expect(squares[2]).toHaveAccessibleName('High Current Asthma, High Toxic Air Releases');
    expect(squares[6]).toHaveAccessibleName('Low Current Asthma, Low Toxic Air Releases');
    expect(squares[2]).toHaveAttribute('title', expect.stringContaining('380 counties'));
  });

  it('shows one square alone when clicked, and all again on a second click', async () => {
    const user = userEvent.setup();
    const onPairCellChange = vi.fn();
    const { unmount } = renderPair({ onPairCellChange });

    await user.click(screen.getByRole('button', { name: 'High Current Asthma, High Toxic Air Releases' }));
    expect(onPairCellChange).toHaveBeenLastCalledWith(8);
    unmount();

    renderPair({ onPairCellChange, pairCell: 8 });
    const chosen = screen.getByRole('button', { name: 'High Current Asthma, High Toxic Air Releases' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    await user.click(chosen);
    expect(onPairCellChange).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole('button', { name: 'Show all squares' }));
    expect(onPairCellChange).toHaveBeenCalledTimes(3);
  });

  it('shows the correlation, county count, and where the thirds split', () => {
    renderPair();

    expect(screen.getByText('Rank correlation (Spearman) r = 0.18')).toBeInTheDocument();
    expect(screen.getByText('2,950 counties have both values')).toBeInTheDocument();
    expect(screen.getByText(/Current Asthma: thirds split at 9.6% and 10.4%/)).toBeInTheDocument();
    expect(screen.getByText(/Toxic Air Releases: thirds split at 1,200 lbs and 45,000 lbs/)).toBeInTheDocument();
    expect(screen.getByText('Missing either value')).toBeInTheDocument();
    expect(screen.getByText(/not whether one causes the other/)).toBeInTheDocument();
  });

  it('says when there is too little data for a correlation', () => {
    renderPair({ pairSummary: { ...summary, n: 2, r: null } });

    expect(screen.getByText('Correlation: not enough data')).toBeInTheDocument();
  });
});
