'use client';

// Side panel with a card for each selected county. Hidden until a county is selected.
import type { CSSProperties } from 'react';
import { MAX_SELECTED, type Measure } from './config';
import type { CountyIndex } from './countyStats';
import CountyCard from './CountyCard';
import { selectionColor } from './layers/selection';

interface SelectionPanelProps {
  selected: string[]; // FIPS codes, in selection order
  index: CountyIndex | null; // null while the county data is loading
  measures: Measure[];
  mapMeasureIds: string[]; // the measure(s) shown on the map
  onRemove: (fips: string) => void;
  onClear: () => void;
  onCompare: () => void;
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 52, // leaves room for the zoom buttons
  width: 300,
  maxHeight: 'calc(100% - 24px)',
  overflowY: 'auto',
  background: '#f1f5f9',
  borderRadius: 8,
  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
  padding: '10px 12px',
  fontFamily: 'system-ui, sans-serif',
  color: '#1e293b',
};

const buttonStyle: CSSProperties = {
  fontSize: 12,
  padding: '3px 8px',
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  background: 'white',
  cursor: 'pointer',
};

export default function SelectionPanel({
  selected,
  index,
  measures,
  mapMeasureIds,
  onRemove,
  onClear,
  onCompare,
}: SelectionPanelProps) {
  if (selected.length === 0) return null;

  return (
    <aside role="region" aria-label="Selected counties" style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
          Selected counties ({selected.length} of {MAX_SELECTED})
        </span>
        <button type="button" onClick={onCompare} style={{ ...buttonStyle, fontWeight: 600 }}>
          Compare
        </button>
        <button type="button" onClick={onClear} style={buttonStyle}>
          Clear
        </button>
      </div>
      {selected.length >= MAX_SELECTED && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          That&apos;s the maximum. Remove a county to add another.
        </div>
      )}

      {index === null ? (
        <div style={{ fontSize: 12, marginTop: 8 }}>Loading county data…</div>
      ) : (
        selected.map((fips, i) => (
          <CountyCard
            key={fips}
            fips={fips}
            number={i + 1}
            color={selectionColor(i)}
            index={index}
            measures={measures}
            mapMeasureIds={mapMeasureIds}
            onRemove={onRemove}
          />
        ))
      )}
    </aside>
  );
}
