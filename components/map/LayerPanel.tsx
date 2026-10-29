'use client';

// The checkbox panel and legends. Pure React (no map code), so it's easy to unit test.
import type { CSSProperties } from 'react';
import {
  HEAT_COLORS,
  LAYER_LABELS,
  MEASURE_PICKER_LABEL,
  OTHER_SECTOR_COLOR,
  SECTOR_COLORS,
  TRI_REPORTING_YEAR,
  formatValue,
  sectorLabel,
  type LayerKey,
  type Measure,
} from './config';
import { colorRange, measureStops } from './expressions';
import { HATCH_CSS } from './hatchPattern';

interface LayerPanelProps {
  visible: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
  measures: Measure[];
  measureId: string;
  onMeasureChange: (measureId: string) => void;
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
  width: 260,
  maxHeight: 'calc(100% - 24px)',
  overflowY: 'auto',
};

const checkboxRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
const rangeLabels: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 };
const legendNote: CSSProperties = { fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.3 };

const gradient = (stops: [number, string][]) =>
  `linear-gradient(to right, ${stops.map(([, color]) => color).join(', ')})`;

export default function LayerPanel({ visible, onToggle, measures, measureId, onMeasureChange }: LayerPanelProps) {
  return (
    <div role="region" aria-label="Map layers" style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Layers</div>

      <label style={checkboxRow}>
        <input type="checkbox" checked={visible.health} onChange={() => onToggle('health')} />
        {LAYER_LABELS.health}
      </label>
      {visible.health && (
        <HealthLegend measures={measures} measureId={measureId} onMeasureChange={onMeasureChange} />
      )}

      <label style={{ ...checkboxRow, marginTop: 6 }}>
        <input type="checkbox" checked={visible.tri} onChange={() => onToggle('tri')} />
        {LAYER_LABELS.tri}
      </label>
      {visible.tri && <TriLegend />}

      <div style={{ ...legendNote, marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
        Click counties on the map to select and compare them.
      </div>
    </div>
  );
}

function HealthLegend({
  measures,
  measureId,
  onMeasureChange,
}: Pick<LayerPanelProps, 'measures' | 'measureId' | 'onMeasureChange'>) {
  const measure = measures.find((m) => m.id === measureId);
  if (!measure) return <div style={legendNote}>Loading measures…</div>;

  const categories = [...new Set(measures.map((m) => m.category))];
  const stops = measureStops(measure);
  const range = colorRange(measure);
  // "≤" and "+" only when some counties fall beyond the ends of the color range
  const low = `${range.low > measure.min ? '≤' : ''}${formatValue(range.low, measure)}`;
  const high = `${formatValue(range.high, measure)}${range.high < measure.max ? '+' : ''}`;

  return (
    <div style={{ margin: '8px 0 10px' }}>
      <select
        aria-label={MEASURE_PICKER_LABEL}
        value={measureId}
        onChange={(e) => onMeasureChange(e.target.value)}
        style={{ width: '100%', fontSize: 12, padding: '3px 4px', marginBottom: 8 }}
      >
        {categories.map((category) => (
          <optgroup key={category} label={category}>
            {measures
              .filter((m) => m.category === category)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.short}
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <div style={{ height: 10, borderRadius: 2, background: gradient(stops) }} />
      <div style={rangeLabels}>
        <span>{low}</span>
        <span>{high}</span>
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
        {measure.name}, {measure.period}. {measure.valueType}; colors span the middle 90% of counties
        {measure.scale === 'log' ? ' on a log scale' : ''}. Source: {measure.source}.
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
        <span>Less</span>
        <span>More released nearby</span>
      </div>
      <div style={{ fontSize: 11, marginTop: 4 }}>
        Zoomed out: where reported air releases cluster, weighted by pounds (log scale). Not measured air quality.
      </div>
      <div style={{ fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        Zoomed in: one circle per facility. Size = its air releases; color = industry:
      </div>
      {sectors.map(([sector, color]) => (
        <div key={sector} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
          {sectorLabel(sector)}
        </div>
      ))}
      <div style={legendNote}>
        Facility-reported stack + fugitive air releases, {TRI_REPORTING_YEAR}. Click a circle for details. Source:
        EPA Toxics Release Inventory.
      </div>
    </div>
  );
}
