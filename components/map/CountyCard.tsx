'use client';

// One selected county: its population, the measure shown on the map (with its confidence
// interval when the data has one), and the key measures, each ranked against all US counties.
import type { CSSProperties } from 'react';
import { KEY_MEASURE_IDS, formatValue, type Measure } from './config';
import { countyLabel, measureValue, ordinal, percentileRank, type CountyIndex, type CountyProps } from './countyStats';

interface CountyCardProps {
  fips: string;
  number: number; // position in the selection, shown on the map too
  color: string;
  index: CountyIndex;
  measures: Measure[];
  mapMeasureIds: string[]; // the measure(s) shown on the map: one, or two in two-measure mode
  onRemove: (fips: string) => void;
}

const cardStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '8px 10px',
  marginTop: 8,
  background: 'white',
};

export const badgeStyle = (color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: color,
  color: 'white',
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
});

export default function CountyCard({ fips, number, color, index, measures, mapMeasureIds, onRemove }: CountyCardProps) {
  const props = index.byFips.get(fips);
  const label = countyLabel(props, `County ${fips}`);
  const byId = new Map(measures.map((m) => [m.id, m]));
  const mapMeasures = mapMeasureIds.map((id) => byId.get(id)).filter((m): m is Measure => m !== undefined);
  const keyMeasures = KEY_MEASURE_IDS.filter((id) => !mapMeasureIds.includes(id))
    .map((id) => byId.get(id))
    .filter((m): m is Measure => m !== undefined);
  const population = measureValue(props, 'POP');

  return (
    <article aria-label={label} style={{ ...cardStyle, borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={badgeStyle(color)}>{number}</span>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{label}</span>
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={() => onRemove(fips)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b', lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
        Population {population !== null ? population.toLocaleString('en-US') : 'not available'} · FIPS {fips}
      </div>

      {mapMeasures.length > 0 && (
        <div style={{ marginTop: 8, padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>On the map</div>
          {mapMeasures.map((m) => (
            <MeasureRow key={m.id} measure={m} props={props} index={index} showInterval />
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8 }}>
        Key measures
      </div>
      {keyMeasures.map((m) => (
        <MeasureRow key={m.id} measure={m} props={props} index={index} />
      ))}
    </article>
  );
}

interface MeasureRowProps {
  measure: Measure;
  props: CountyProps | undefined;
  index: CountyIndex;
  showInterval?: boolean;
}

// Name and value, with a bar showing where the county ranks among all US counties
function MeasureRow({ measure, props, index, showInterval = false }: MeasureRowProps) {
  const value = measureValue(props, measure.id);
  const low = measureValue(props, `${measure.id}_lo`);
  const high = measureValue(props, `${measure.id}_hi`);
  const percentile = value === null ? null : percentileRank(index.sorted.get(measure.id) ?? [], value);

  return (
    <div style={{ marginTop: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
        <span>{measure.short}</span>
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {value === null ? 'No data' : formatValue(value, measure)}
        </span>
      </div>
      {showInterval && value !== null && low !== null && high !== null && (
        <div style={{ fontSize: 10, color: '#64748b' }}>
          95% CI {formatValue(low, measure)}–{formatValue(high, measure)}
        </div>
      )}
      {percentile !== null && <PercentileBar percentile={percentile} />}
    </div>
  );
}

export function PercentileBar({ percentile }: { percentile: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
      <div
        style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2, position: 'relative' }}
        aria-hidden="true"
      >
        <div
          style={{
            position: 'absolute',
            left: `calc(${percentile}% - 3px)`,
            top: -2,
            width: 6,
            height: 8,
            borderRadius: 2,
            background: '#d95f0e',
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>{ordinal(percentile)} percentile</span>
    </div>
  );
}
