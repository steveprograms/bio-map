'use client';

// The checkbox panel and legends. Pure React (no map code), so it's easy to unit test.
import type { CSSProperties } from 'react';
import {
  ASTHMA_DATA_YEAR,
  ASTHMA_STOPS,
  HEAT_COLORS,
  LAYER_LABELS,
  OTHER_SECTOR_COLOR,
  SECTOR_COLORS,
  TRI_REPORTING_YEAR,
  sectorLabel,
  type LayerKey,
} from './config';
import { HATCH_CSS } from './hatchPattern';

interface LayerPanelProps {
  visible: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  background: 'white',
  borderRadius: 8,
  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
  padding: '10px 12px',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  color: '#1e293b',
  width: 240,
  maxHeight: 'calc(100% - 24px)',
  overflowY: 'auto',
};

const checkboxRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
const rangeLabels: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 };
const legendNote: CSSProperties = { fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.3 };

const gradient = (stops: [number, string][]) =>
  `linear-gradient(to right, ${stops.map(([, color]) => color).join(', ')})`;

export default function LayerPanel({ visible, onToggle }: LayerPanelProps) {
  return (
    <div role="region" aria-label="Map layers" style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Layers</div>

      <label style={checkboxRow}>
        <input type="checkbox" checked={visible.asthma} onChange={() => onToggle('asthma')} />
        {LAYER_LABELS.asthma}
      </label>
      {visible.asthma && <AsthmaLegend />}

      <label style={{ ...checkboxRow, marginTop: 6 }}>
        <input type="checkbox" checked={visible.tri} onChange={() => onToggle('tri')} />
        {LAYER_LABELS.tri}
      </label>
      {visible.tri && <TriLegend />}
    </div>
  );
}

function AsthmaLegend() {
  return (
    <div style={{ margin: '8px 0 10px' }}>
      <div style={{ height: 10, borderRadius: 2, background: gradient(ASTHMA_STOPS) }} />
      <div style={rangeLabels}>
        <span>≤{ASTHMA_STOPS[0][0]}%</span>
        <span>{ASTHMA_STOPS[ASTHMA_STOPS.length - 1][0]}%+</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 6 }}>
        <span
          style={{
            width: 14,
            height: 10,
            background: HATCH_CSS,
            border: '1px solid #cbd5e1',
            display: 'inline-block',
          }}
        />
        No data
      </div>
      <div style={legendNote}>
        Age-adjusted % of adults with current asthma, {ASTHMA_DATA_YEAR}. Source: CDC PLACES, 2025 release.
      </div>
    </div>
  );
}

function TriLegend() {
  const sectors: [string, string][] = [...SECTOR_COLORS, ['Other', OTHER_SECTOR_COLOR]];

  return (
    <div style={{ marginTop: 8 }}>
      {/* Skip the first heat color: it's fully transparent */}
      <div style={{ height: 10, borderRadius: 2, background: gradient(HEAT_COLORS.slice(1)) }} />
      <div style={rangeLabels}>
        <span>Lower</span>
        <span>Higher concentration</span>
      </div>
      <div style={{ fontSize: 11, marginTop: 8, marginBottom: 4 }}>Facilities (zoom in; size = air releases):</div>
      {sectors.map(([sector, color]) => (
        <div key={sector} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
          {sectorLabel(sector)}
        </div>
      ))}
      <div style={legendNote}>
        Reported stack + fugitive air releases, {TRI_REPORTING_YEAR}. Click a facility for details. Source: EPA
        Toxics Release Inventory.
      </div>
    </div>
  );
}
