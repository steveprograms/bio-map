import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LAYER_LABELS, SECTOR_COLORS, sectorLabel } from './config';
import LayerPanel from './LayerPanel';

const allOff = { asthma: false, tri: false };

describe('LayerPanel', () => {
  it('shows an unchecked checkbox for each layer by default', () => {
    render(<LayerPanel visible={allOff} onToggle={() => {}} />);

    expect(screen.getByLabelText(LAYER_LABELS.asthma)).not.toBeChecked();
    expect(screen.getByLabelText(LAYER_LABELS.tri)).not.toBeChecked();
  });

  it('reports which layer was toggled', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<LayerPanel visible={allOff} onToggle={onToggle} />);

    await user.click(screen.getByLabelText(LAYER_LABELS.asthma));
    expect(onToggle).toHaveBeenLastCalledWith('asthma');

    await user.click(screen.getByLabelText(LAYER_LABELS.tri));
    expect(onToggle).toHaveBeenLastCalledWith('tri');
  });

  it('hides legends for layers that are off', () => {
    render(<LayerPanel visible={allOff} onToggle={() => {}} />);

    expect(screen.queryByText('No data')).not.toBeInTheDocument();
    expect(screen.queryByText('Chemicals')).not.toBeInTheDocument();
  });

  it('shows the asthma legend when asthma is on', () => {
    render(<LayerPanel visible={{ asthma: true, tri: false }} onToggle={() => {}} />);

    expect(screen.getByLabelText(LAYER_LABELS.asthma)).toBeChecked();
    expect(screen.getByText('≤8%')).toBeInTheDocument();
    expect(screen.getByText('14%+')).toBeInTheDocument();
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText(/CDC PLACES/)).toBeInTheDocument();
  });

  it('shows every industry group in the TRI legend when TRI is on', () => {
    render(<LayerPanel visible={{ asthma: false, tri: true }} onToggle={() => {}} />);

    for (const [sector] of SECTOR_COLORS) {
      expect(screen.getByText(sectorLabel(sector))).toBeInTheDocument();
    }
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText(/Toxics Release Inventory/)).toBeInTheDocument();
  });
});
