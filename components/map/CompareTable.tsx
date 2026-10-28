'use client';

// Side-by-side comparison of the selected counties: one column per county, one row per measure.
import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import { KEY_MEASURE_IDS, formatValue, type Measure } from './config';
import { countyLabel, measureValue, ordinal, percentileRank, type CountyIndex } from './countyStats';
import { badgeStyle } from './CountyCard';
import { selectionColor } from './layers/selection';

interface CompareTableProps {
  selected: string[];
  index: CountyIndex;
  measures: Measure[];
  measureId: string; // the measure shown on the map; always included
  onMeasureChange: (measureId: string) => void;
  onClose: () => void;
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
  color: '#1e293b',
};

const dialogStyle: CSSProperties = {
  background: 'white',
  borderRadius: 10,
  boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
  width: 'min(1000px, 100%)',
  maxHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: 16,
};

const cellStyle: CSSProperties = { padding: '5px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 12 };

const toggleStyle = (active: boolean): CSSProperties => ({
  fontSize: 12,
  padding: '3px 8px',
  border: '1px solid #cbd5e1',
  background: active ? '#1e293b' : 'white',
  color: active ? 'white' : '#1e293b',
  cursor: 'pointer',
});

export default function CompareTable({ selected, index, measures, measureId, onMeasureChange, onClose }: CompareTableProps) {
  const [showAll, setShowAll] = useState(false);

  // Escape closes the comparison
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = showAll ? measures : measures.filter((m) => KEY_MEASURE_IDS.includes(m.id) || m.id === measureId);
  const categories = [...new Set(rows.map((m) => m.category))];

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compare counties"
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>Compare counties</span>
          <div role="group" aria-label="Measures to show" style={{ display: 'flex' }}>
            <button
              type="button"
              aria-pressed={!showAll}
              onClick={() => setShowAll(false)}
              style={{ ...toggleStyle(!showAll), borderRadius: '4px 0 0 4px' }}
            >
              Key measures
            </button>
            <button
              type="button"
              aria-pressed={showAll}
              onClick={() => setShowAll(true)}
              style={{ ...toggleStyle(showAll), borderRadius: '0 4px 4px 0', borderLeft: 'none' }}
            >
              All {measures.length} measures
            </button>
          </div>
          <button type="button" onClick={onClose} style={{ ...toggleStyle(false), borderRadius: 4 }}>
            Close
          </button>
        </div>

        <div style={{ overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...cellStyle, textAlign: 'left', position: 'sticky', top: 0, background: 'white' }}>
                  Measure
                </th>
                {selected.map((fips, i) => {
                  const label = countyLabel(index.byFips.get(fips), `County ${fips}`);
                  return (
                    <th
                      key={fips}
                      scope="col"
                      aria-label={label}
                      style={{ ...cellStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'white' }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={badgeStyle(selectionColor(i))}>{i + 1}</span>
                        {label}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <Fragment key={category}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={selected.length + 1}
                      style={{ ...cellStyle, textAlign: 'left', background: '#f8fafc', fontSize: 11, color: '#475569' }}
                    >
                      {category}
                    </th>
                  </tr>
                  {rows
                    .filter((m) => m.category === category)
                    .map((m) => (
                      <tr key={m.id} style={m.id === measureId ? { outline: '2px solid #fe9929' } : undefined}>
                        <th scope="row" style={{ ...cellStyle, textAlign: 'left', fontWeight: 400 }}>
                          <button
                            type="button"
                            title={`${m.name} (${m.period}). Click to show on the map.`}
                            onClick={() => onMeasureChange(m.id)}
                            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#1e293b', textAlign: 'left', fontSize: 12 }}
                          >
                            {m.short}
                          </button>
                        </th>
                        {selected.map((fips) => (
                          <ValueCell key={fips} measure={m} fips={fips} index={index} />
                        ))}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 10, color: '#64748b', marginTop: 10, lineHeight: 1.4 }}>
          Percentile = share of US counties with a lower value. Shading follows the value, so darker means higher whether
          or not higher is worse. Click a measure to show it on the map. Hover a measure for its full name and years.
        </div>
      </div>
    </div>
  );
}

function ValueCell({ measure, fips, index }: { measure: Measure; fips: string; index: CountyIndex }) {
  const props = index.byFips.get(fips);
  const value = measureValue(props, measure.id);
  if (value === null) {
    return <td style={{ ...cellStyle, textAlign: 'right', color: '#94a3b8' }}>No data</td>;
  }

  const percentile = percentileRank(index.sorted.get(measure.id) ?? [], value);
  const low = measureValue(props, `${measure.id}_lo`);
  const high = measureValue(props, `${measure.id}_hi`);
  const interval = low !== null && high !== null ? `95% CI ${formatValue(low, measure)}–${formatValue(high, measure)}` : undefined;

  return (
    <td
      title={interval}
      style={{ ...cellStyle, textAlign: 'right', background: `rgba(254, 153, 41, ${((percentile / 100) * 0.45).toFixed(2)})` }}
    >
      <div style={{ fontWeight: 600 }}>{formatValue(value, measure)}</div>
      <div style={{ fontSize: 10, color: '#475569' }}>{ordinal(percentile)} pctl</div>
    </td>
  );
}
