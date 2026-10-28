import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LAYER_LABELS, MEASURE_PICKER_LABEL, SECTOR_COLORS, sectorLabel, type LayerKey } from './config';
import { sampleMeasures } from './test-fixtures';
import LayerPanel from './LayerPanel';

const allOff = { health: false, tri: false };

// Renders the panel with sensible defaults; override any prop per test
function renderPanel(
  props: Partial<{
    visible: Record<LayerKey, boolean>;
    onToggle: (key: LayerKey) => void;
    measures: typeof sampleMeasures;
    measureId: string;
    onMeasureChange: (id: string) => void;
  }> = {}
) {
  return render(
    <LayerPanel
      visible={props.visible ?? allOff}
      onToggle={props.onToggle ?? (() => {})}
      measures={props.measures ?? sampleMeasures}
      measureId={props.measureId ?? 'CASTHMA'}
      onMeasureChange={props.onMeasureChange ?? (() => {})}
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
