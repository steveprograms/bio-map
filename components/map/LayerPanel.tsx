'use client';

// The checkbox panel and legends. Pure React (no map code), so it's easy to unit test.
import type { CSSProperties } from 'react';
import {
  COUNTY_MODE_LABELS,
  HEAT_COLORS,
  LAYER_LABELS,
  MEASURE_PICKER_LABEL,
  OTHER_SECTOR_COLOR,
  PAIR_COLORS,
  PAIR_LEVELS,
  PAIR_PICKER_LABELS,
  SECTOR_COLORS,
  TRI_REPORTING_YEAR,
  formatValue,
  sectorLabel,
  type CountyMode,
  type LayerKey,
  type Measure,
  type MeasureRole,
  type Pair,
} from './config';
import { colorRange, measureStops } from './expressions';
import { HATCH_CSS } from './hatchPattern';
import { cellOf, type PairSummary } from './stats';

interface LayerPanelProps {
  visible: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
  measures: Measure[];
  countyMode: CountyMode;
  onCountyModeChange: (mode: CountyMode) => void;
  measureId: string; // one-measure mode
  onMeasureChange: (measureId: string) => void;
  pair: Pair; // two-measure mode
  onPairChange: (pair: Pair) => void;
  pairCell: number | null; // the legend square shown alone, if any (0-8)
  onPairCellChange: (cell: number | null) => void;
  pairSummary: PairSummary | null;
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
  width: 270,
  maxHeight: 'calc(100% - 24px)',
  overflowY: 'auto',
};

const checkboxRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
const rangeLabels: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 };
const legendNote: CSSProperties = { fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.3 };
const selectStyle: CSSProperties = { width: '100%', fontSize: 12, padding: '3px 4px', marginBottom: 8 };
const pickerLabel: CSSProperties = { fontSize: 11, color: '#475569', marginBottom: 2 };

const gradient = (stops: [number, string][]) =>
  `linear-gradient(to right, ${stops.map(([, color]) => color).join(', ')})`;

export default function LayerPanel(props: LayerPanelProps) {
  const { visible, onToggle, countyMode, onCountyModeChange } = props;

  return (
    <div role="region" aria-label="Map layers" style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Layers</div>

      <label style={checkboxRow}>
        <input type="checkbox" checked={visible.health} onChange={() => onToggle('health')} />
        {LAYER_LABELS.health}
      </label>
      {visible.health && (
        <div style={{ margin: '8px 0 10px' }}>
          <ModeSwitch mode={countyMode} onChange={onCountyModeChange} />
          {countyMode === 'single' ? <SingleLegend {...props} /> : <PairLegend {...props} />}
        </div>
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

function ModeSwitch({ mode, onChange }: { mode: CountyMode; onChange: (mode: CountyMode) => void }) {
  const modes: CountyMode[] = ['single', 'pair'];
  return (
    <div role="group" aria-label="Color counties by" style={{ display: 'flex', marginBottom: 8 }}>
      {modes.map((m, i) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          style={{
            flex: 1,
            fontSize: 12,
            padding: '3px 6px',
            cursor: 'pointer',
            border: '1px solid #cbd5e1',
            borderLeft: i > 0 ? 'none' : '1px solid #cbd5e1',
            borderRadius: i === 0 ? '4px 0 0 4px' : '0 4px 4px 0',
            background: mode === m ? '#1e293b' : 'white',
            color: mode === m ? 'white' : '#1e293b',
          }}
        >
          {COUNTY_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

// A dropdown of all measures grouped by category; categories with the preferred role come first
function MeasureSelect({
  label,
  measures,
  value,
  onChange,
  preferRole,
}: {
  label: string;
  measures: Measure[];
  value: string;
  onChange: (id: string) => void;
  preferRole?: MeasureRole;
}) {
  const roleOf = (category: string) => measures.find((m) => m.category === category)?.role;
  const categories = [...new Set(measures.map((m) => m.category))].sort(
    (a, b) => Number(roleOf(b) === preferRole) - Number(roleOf(a) === preferRole)
  );
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
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
  );
}

function NoDataRow({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 6 }}>
      <span style={{ width: 14, height: 10, background: HATCH_CSS, border: '1px solid #cbd5e1', display: 'inline-block' }} />
      {label}
    </div>
  );
}

function SingleLegend({ measures, measureId, onMeasureChange }: LayerPanelProps) {
  const measure = measures.find((m) => m.id === measureId);
  if (!measure) return <div style={legendNote}>Loading measures…</div>;

  const stops = measureStops(measure);
  const range = colorRange(measure);
  // "≤" and "+" only when some counties fall beyond the ends of the color range
  const low = `${range.low > measure.min ? '≤' : ''}${formatValue(range.low, measure)}`;
  const high = `${formatValue(range.high, measure)}${range.high < measure.max ? '+' : ''}`;

  return (
    <div>
      <MeasureSelect label={MEASURE_PICKER_LABEL} measures={measures} value={measureId} onChange={onMeasureChange} />
      <div style={{ height: 10, borderRadius: 2, background: gradient(stops) }} />
      <div style={rangeLabels}>
        <span>{low}</span>
        <span>{high}</span>
      </div>
      <NoDataRow label="No data" />
      <div style={legendNote}>
        {measure.name}, {measure.period}. {measure.valueType}; colors span the middle 90% of counties
        {measure.scale === 'log' ? ' on a log scale' : ''}. Source: {measure.source}.
      </div>
    </div>
  );
}

function PairLegend({ measures, pair, onPairChange, pairCell, onPairCellChange, pairSummary }: LayerPanelProps) {
  const x = measures.find((m) => m.id === pair.xId);
  const y = measures.find((m) => m.id === pair.yId);
  if (!x || !y) return <div style={legendNote}>Loading measures…</div>;

  const describeCell = (xb: number, yb: number) => `${PAIR_LEVELS[yb]} ${y.short}, ${PAIR_LEVELS[xb]} ${x.short}`;

  return (
    <div>
      <div style={pickerLabel}>Up (usually an outcome)</div>
      <MeasureSelect
        label={PAIR_PICKER_LABELS.y}
        measures={measures}
        value={pair.yId}
        onChange={(yId) => onPairChange({ ...pair, yId })}
        preferRole="outcome"
      />
      <div style={pickerLabel}>Across (usually an exposure)</div>
      <MeasureSelect
        label={PAIR_PICKER_LABELS.x}
        measures={measures}
        value={pair.xId}
        onChange={(xId) => onPairChange({ ...pair, xId })}
        preferRole="exposure"
      />

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 4 }}>
        <div
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 10, color: '#475569', height: 96 }}
        >
          {y.short} →
        </div>
        <div>
          <div role="group" aria-label="Legend squares" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 30px)', gap: 2 }}>
            {[2, 1, 0].flatMap((yb) =>
              [0, 1, 2].map((xb) => {
                const cell = cellOf(xb, yb);
                const chosen = pairCell === cell;
                const count = pairSummary?.counts[cell];
                return (
                  <button
                    key={cell}
                    type="button"
                    aria-label={describeCell(xb, yb)}
                    aria-pressed={chosen}
                    title={`${describeCell(xb, yb)}${count !== undefined ? `: ${count.toLocaleString('en-US')} counties` : ''}. Click to show only these.`}
                    onClick={() => onPairCellChange(chosen ? null : cell)}
                    style={{
                      width: 30,
                      height: 30,
                      padding: 0,
                      border: 'none',
                      cursor: 'pointer',
                      background: PAIR_COLORS[yb][xb],
                      outline: chosen ? '2px solid #0f172a' : 'none',
                      outlineOffset: -2,
                      opacity: pairCell === null || chosen ? 1 : 0.35,
                    }}
                  />
                );
              })
            )}
          </div>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>{x.short} →</div>
        </div>
        <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.5 }}>
          <div>Top right: high on both</div>
          <div>Top left: high {y.short} only</div>
          <div>Bottom right: high {x.short} only</div>
        </div>
      </div>

      {pairCell !== null && (
        <button
          type="button"
          onClick={() => onPairCellChange(null)}
          style={{ fontSize: 11, marginTop: 6, padding: '2px 6px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 4, background: 'white' }}
        >
          Show all squares
        </button>
      )}

      {pairSummary && (
        <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.45 }}>
          <div>
            {pairSummary.r === null ? 'Correlation: not enough data' : `Rank correlation (Spearman) r = ${pairSummary.r.toFixed(2)}`}
          </div>
          <div>{pairSummary.n.toLocaleString('en-US')} counties have both values</div>
          <div style={{ color: '#64748b', marginTop: 2 }}>
            {y.short}: thirds split at {formatValue(pairSummary.yCuts[0], y)} and {formatValue(pairSummary.yCuts[1], y)}
            <br />
            {x.short}: thirds split at {formatValue(pairSummary.xCuts[0], x)} and {formatValue(pairSummary.xCuts[1], x)}
          </div>
        </div>
      )}

      <NoDataRow label="Missing either value" />
      <div style={legendNote}>
        Thirds are among counties with both values. Shows where the measures overlap, not whether one causes the
        other. Sources: {y.source} ({y.period}); {x.source} ({x.period}).
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
