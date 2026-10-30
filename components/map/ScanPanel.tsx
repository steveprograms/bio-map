'use client';

// Scan for associations: test one outcome (or exposure) against many measures at once, then
// show the results as a volcano plot and a sortable table. Clicking a result maps that pair.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ROLE_COLORS,
  ROLE_LABELS,
  SCAN_FDR,
  SCAN_FOCUS_LABELS,
  SCAN_KIND_LABELS,
  SUGGESTED_ADJUSTMENT,
  type Measure,
  type MeasureRole,
  type Pair,
  type ScanKind,
} from './config';
import type { CountyIndex } from './countyStats';
import { placeLabels } from './labelPlacement';
import { adjustmentChoices, focusChoices, pairForResult, runScan, scanSteps, type ScanResult, type ScanRow } from './scan';
import { buildSpatialPairs, type SpatialPairs } from './spatial';
import { formatLog10P } from './stats';

interface ScanPanelProps {
  index: CountyIndex;
  measures: Measure[];
  kind: ScanKind;
  onKindChange: (kind: ScanKind) => void;
  focusId: string;
  onFocusChange: (id: string) => void;
  adjustFor: string[]; // covariate ids to adjust for; empty = unadjusted
  onAdjustForChange: (ids: string[]) => void;
  spatialCorrection: boolean; // correct p and q for spatial autocorrelation
  onSpatialCorrectionChange: (on: boolean) => void;
  onMapPair: (pair: Pair) => void; // show a result on the two-measure map
  onClose: () => void;
}

type SortKey = 'measure' | 'r' | 'rawR' | 'n' | 'q';
type SortState = { key: SortKey; ascending: boolean };

const LOG10_FDR = Math.log10(SCAN_FDR);

// The table of county-pair distances takes a moment to build, so build it once per county index
const spatialPairsCache = new WeakMap<CountyIndex, SpatialPairs | null>();
function spatialPairsFor(index: CountyIndex) {
  if (!spatialPairsCache.has(index)) spatialPairsCache.set(index, buildSpatialPairs(index));
  return spatialPairsCache.get(index) ?? null;
}

const STEP_BUDGET_MS = 30; // work per slice of the spatial correction before letting the page update

// Runs the scan with the spatial correction a few tests at a time. Returns the corrected result
// once it's ready (null until then, or when the correction is off) and the progress so far.
function useSpatialScan(
  enabled: boolean,
  index: CountyIndex,
  measures: Measure[],
  kind: ScanKind,
  focusId: string,
  adjustFor: string[]
) {
  type Progress = { done: number; total: number };
  // Tagged with the inputs it belongs to, so stale results from earlier choices are ignored
  const [state, setState] = useState<{ key: string; result: ScanResult | null; progress: Progress | null }>({
    key: '',
    result: null,
    progress: null,
  });
  const adjustKey = adjustFor.join(',');
  const key = [kind, focusId, adjustKey, measures.length].join('|');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer = setTimeout(() => {
      const pairs = spatialPairsFor(index);
      if (cancelled || !pairs) return;
      const steps = scanSteps(index, measures, kind, focusId, adjustKey ? adjustKey.split(',') : [], pairs);
      const work = () => {
        if (cancelled) return;
        const start = performance.now();
        for (;;) {
          const step = steps.next();
          if (step.done) {
            setState({ key, result: step.value, progress: null });
            return;
          }
          if (performance.now() - start > STEP_BUDGET_MS) {
            setState({ key, result: null, progress: step.value });
            timer = setTimeout(work, 0);
            return;
          }
        }
      };
      work();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, index, measures, kind, focusId, adjustKey, key]);

  if (!enabled) return { result: null, progress: null };
  return state.key === key ? state : { result: null, progress: { done: 0, total: 0 } };
}
const Y_CAP = 300; // -log10 q beyond this is drawn at the top of the plot

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
  width: 'min(1100px, 100%)',
  maxHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: 16,
  overflow: 'hidden',
};

const toggleStyle = (active: boolean, first: boolean): CSSProperties => ({
  fontSize: 12,
  padding: '3px 8px',
  border: '1px solid #cbd5e1',
  borderLeft: first ? '1px solid #cbd5e1' : 'none',
  borderRadius: first ? '4px 0 0 4px' : '0 4px 4px 0',
  background: active ? '#1e293b' : 'white',
  color: active ? 'white' : '#1e293b',
  cursor: 'pointer',
});

const cellStyle: CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 12 };
const noteStyle: CSSProperties = { fontSize: 11, color: '#64748b', lineHeight: 1.4 };

export const significant = (row: Pick<ScanRow, 'log10q'>) => row.log10q < LOG10_FDR;
const formatR = (r: number) => (r >= 0 ? r.toFixed(2) : `−${Math.abs(r).toFixed(2)}`);

export default function ScanPanel({
  index,
  measures,
  kind,
  onKindChange,
  focusId,
  onFocusChange,
  adjustFor,
  onAdjustForChange,
  spatialCorrection,
  onSpatialCorrectionChange,
  onMapPair,
  onClose,
}: ScanPanelProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [choosingAdjustment, setChoosingAdjustment] = useState(false);

  // Escape closes the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choices = focusChoices(measures, kind);
  // Uncorrected results are instant; the spatially corrected ones arrive a moment later
  const quick = useMemo(
    () => runScan(index, measures, kind, focusId, adjustFor),
    [index, measures, kind, focusId, adjustFor]
  );
  const spatialAvailable = index.centroids.size >= 4;
  const correcting = spatialCorrection && spatialAvailable;
  const spatial = useSpatialScan(correcting, index, measures, kind, focusId, adjustFor);
  const result = spatial.result ?? quick;
  const adjusting = adjustFor.length > 0;
  const shortName = (id: string) => measures.find((m) => m.id === id)?.short ?? id;
  const mapResult = (targetId: string) => onMapPair(pairForResult(kind, focusId, targetId));

  const hits = result?.rows.filter(significant).length ?? 0;
  const counties = result && result.rows.length > 0 ? Math.max(...result.rows.map((row) => row.n)) : 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scan for associations"
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>Scan for associations</span>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 12, padding: '3px 10px', borderRadius: 4, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div role="group" aria-label="Scan type" style={{ display: 'flex' }}>
            {(['outcome', 'exposure'] as ScanKind[]).map((k, i) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => onKindChange(k)} style={toggleStyle(kind === k, i === 0)}>
                {SCAN_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <select
            aria-label={SCAN_FOCUS_LABELS[kind]}
            value={focusId}
            onChange={(e) => onFocusChange(e.target.value)}
            style={{ fontSize: 12, padding: '3px 4px', minWidth: 220 }}
          >
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.short}
              </option>
            ))}
          </select>
          {result && (
            <span style={{ fontSize: 12, color: '#475569' }}>
              {result.focus.short} vs. {result.rows.length} {kind === 'outcome' ? 'exposures and covariates' : 'outcomes'}
              {counties > 0 && ` · up to ${counties.toLocaleString('en-US')} counties`} · {hits} with q &lt; {SCAN_FDR}
            </span>
          )}
        </div>

        <AdjustmentControls
          measures={measures}
          adjustFor={adjustFor}
          onChange={onAdjustForChange}
          open={choosingAdjustment}
          onOpenChange={setChoosingAdjustment}
          shortName={shortName}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, marginBottom: 8 }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: spatialAvailable ? 'pointer' : 'default' }}
            title={spatialAvailable ? undefined : 'County locations are not available'}
          >
            <input
              type="checkbox"
              checked={correcting}
              disabled={!spatialAvailable}
              onChange={(e) => onSpatialCorrectionChange(e.target.checked)}
            />
            Correct for spatial autocorrelation
          </label>
          <span style={{ color: '#64748b' }}>
            (Dutilleul&apos;s modified t-test: p and q use an effective number of counties)
          </span>
          {spatial.progress && (
            <span role="status" style={{ color: '#b45309' }}>
              Correcting…{' '}
              {spatial.progress.total > 0 ? `${spatial.progress.done} of ${spatial.progress.total} tests. ` : ''}
              Showing uncorrected results until it&apos;s done.
            </span>
          )}
        </div>

        {!result || result.rows.length === 0 ? (
          <div style={{ fontSize: 13, padding: 20 }}>Nothing to scan for this measure.</div>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', minHeight: 0, flex: 1, overflow: 'auto' }}>
            <div style={{ flex: '0 0 auto' }}>
              <VolcanoPlot
                rows={result.rows}
                focus={result.focus}
                adjusted={adjusting}
                hovered={hovered}
                onHover={setHovered}
                onSelect={mapResult}
              />
            </div>
            <div style={{ flex: '1 1 380px', minWidth: 320, overflow: 'auto', maxHeight: 420 }}>
              <ResultsTable
                rows={result.rows}
                adjusted={adjusting}
                spatial={result.spatial}
                shortName={shortName}
                hovered={hovered}
                onHover={setHovered}
                onSelect={mapResult}
              />
            </div>
          </div>
        )}

        {result && result.skipped.length > 0 && (
          <div style={{ ...noteStyle, marginTop: 6 }}>
            Not tested (too few counties with every value needed): {result.skipped.map((m) => m.short).join(', ')}.
          </div>
        )}
        <div style={{ ...noteStyle, marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
          <strong>How to read this.</strong> Each point is one measure&apos;s Spearman rank correlation with{' '}
          {result?.focus.short ?? 'the chosen measure'}
          {adjusting
            ? ', adjusted for the chosen covariates (partial Spearman: ranks, with what the covariates explain removed by linear regression)'
            : ''}
          , across counties with every value needed. q is the Benjamini–Hochberg false discovery rate across this scan
          {result?.spatial
            ? '; p and q use an effective number of counties (“eff.” in the table) that accounts for nearby counties resembling each other (Dutilleul’s modified t-test, rank-based)'
            : ''}
          .
          Click a point or a measure name to see the pair on the map (the map always shows the unadjusted pair).{' '}
          <strong>Cautions:</strong>{' '}
          {result?.spatial
            ? 'the spatial correction is approximate, so treat q-values near the 0.05 line with care; '
            : 'nearby counties resemble each other (spatial autocorrelation), so without the correction p- and q-values are far too small; '}
          lean on the size of r (about 0.1 small, 0.3 moderate, 0.5 large).{' '}
          {adjusting
            ? 'Adjustment removes only what the chosen covariates capture, and adjusting for something on the causal path (a mediator) can hide a real effect. '
            : 'Not adjusted for covariates; use “Adjust for” to account for likely confounders. '}
          County patterns don&apos;t show individual risk (ecological fallacy), and PLACES estimates are modeled partly from
          demographics, so some measures correlate by construction.
        </div>
      </div>
    </div>
  );
}

// ---------- Adjust for ----------

function AdjustmentControls({
  measures,
  adjustFor,
  onChange,
  open,
  onOpenChange,
  shortName,
}: {
  measures: Measure[];
  adjustFor: string[];
  onChange: (ids: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortName: (id: string) => string;
}) {
  const choices = adjustmentChoices(measures);
  const categories = [...new Set(choices.map((m) => m.category))];
  const suggested = SUGGESTED_ADJUSTMENT.filter((id) => choices.some((m) => m.id === id));
  const toggle = (id: string) =>
    onChange(adjustFor.includes(id) ? adjustFor.filter((a) => a !== id) : [...adjustFor, id]);
  const smallButton: CSSProperties = {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid #cbd5e1',
    background: 'white',
    cursor: 'pointer',
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ fontWeight: 600 }}>Adjust for:</span>
        <span style={{ color: '#475569' }}>
          {adjustFor.length === 0 ? 'nothing (unadjusted)' : adjustFor.map(shortName).join(', ')}
        </span>
        <button type="button" aria-expanded={open} onClick={() => onOpenChange(!open)} style={smallButton}>
          {open ? 'Done' : 'Choose…'}
        </button>
        {suggested.length > 0 && (
          <button type="button" onClick={() => onChange(suggested)} style={smallButton}>
            Suggested: {suggested.map(shortName).join(', ')}
          </button>
        )}
        {adjustFor.length > 0 && (
          <button type="button" onClick={() => onChange([])} style={smallButton}>
            Clear
          </button>
        )}
      </div>
      {open && (
        <div
          role="group"
          aria-label="Covariates to adjust for"
          style={{
            marginTop: 6,
            padding: 8,
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            maxHeight: 160,
            overflowY: 'auto',
            columnWidth: 210,
            columnGap: 16,
            fontSize: 12,
          }}
        >
          {categories.map((category) => (
            <div key={category} style={{ breakInside: 'avoid', marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{category}</div>
              {choices
                .filter((m) => m.category === category)
                .map((m) => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={adjustFor.includes(m.id)} onChange={() => toggle(m.id)} />
                    {m.short}
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Volcano plot ----------

const PLOT = { width: 460, height: 340, left: 46, right: 14, top: 26, bottom: 40 };

// y-axis ticks for the square-root scale: dense near 0, where most exposures sit
const Y_TICKS = [0, 2, 5, 10, 20, 50, 100, 200, 300];

function VolcanoPlot({
  rows,
  focus,
  adjusted,
  hovered,
  onHover,
  onSelect,
}: {
  rows: ScanRow[];
  focus: Measure;
  adjusted: boolean;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const yValue = (row: ScanRow) => Math.min(-row.log10q, Y_CAP);
  const xMax = Math.max(0.2, Math.ceil(Math.max(...rows.map((row) => Math.abs(row.r))) * 10) / 10);
  const yMax = Math.max(2, ...rows.map(yValue)) * 1.05;
  const plotW = PLOT.width - PLOT.left - PLOT.right;
  const plotH = PLOT.height - PLOT.top - PLOT.bottom;
  const sx = (r: number) => PLOT.left + ((r + xMax) / (2 * xMax)) * plotW;
  // Square-root scale: with thousands of counties the strongest results reach q ≈ 1e-200,
  // which on a linear axis would flatten everything else against the bottom
  const sy = (v: number) => PLOT.top + plotH - Math.sqrt(v / yMax) * plotH;

  const xStep = xMax <= 0.5 ? 0.1 : 0.2;
  const xTicks: number[] = [];
  const xEdge = Math.floor(xMax / xStep + 1e-9) * xStep; // ticks on round numbers, through 0
  for (let v = -xEdge; v <= xEdge + 1e-9; v += xStep) xTicks.push(Math.round(v * 10) / 10);
  const yTicks = (yMax <= 6 ? [0, 0.5, 1, 1.5, 2, 3, 4, 5] : Y_TICKS).filter((v) => v <= yMax);

  const capped = (row: ScanRow) => -row.log10q > Y_CAP;
  const anyCapped = rows.some(capped);

  // Labels: the hovered point first (always shown), then the strongest significant results,
  // each only where it fits without covering another label or point
  const strongest = rows
    .filter(significant)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, 6);
  const hoveredRow = rows.find((row) => row.measure.id === hovered);
  const labelRows = hoveredRow ? [hoveredRow, ...strongest.filter((row) => row !== hoveredRow)] : strongest;
  const labels = placeLabels(
    labelRows.map((row) => ({
      id: row.measure.id,
      x: sx(row.r),
      y: sy(yValue(row)),
      text: row.measure.short,
      force: row === hoveredRow,
    })),
    rows.map((row) => ({ x: sx(row.r), y: sy(yValue(row)) })),
    { left: PLOT.left + 2, top: PLOT.top + 2, right: PLOT.width - PLOT.right - 2, bottom: PLOT.top + plotH - 2 }
  );
  const roles = [...new Set(rows.map((row) => row.measure.role))] as MeasureRole[];
  // Draw the hovered point last so it sits on top
  const drawOrder = [...rows].sort((a, b) => Number(a.measure.id === hovered) - Number(b.measure.id === hovered));

  return (
    <svg
      width={PLOT.width}
      height={PLOT.height}
      role="group"
      aria-label="Volcano plot"
      style={{ fontFamily: 'system-ui, sans-serif', display: 'block' }}
    >
      {/* Role legend */}
      {roles.map((role, i) => (
        <g key={role} transform={`translate(${PLOT.left + i * 92}, 10)`}>
          <circle cx={5} cy={0} r={4.5} fill={ROLE_COLORS[role]} />
          <text x={13} y={4} fontSize={11} fill="#475569">
            {ROLE_LABELS[role]}
          </text>
        </g>
      ))}
      {anyCapped && (
        <text x={PLOT.width - PLOT.right} y={14} fontSize={10} fill="#64748b" textAnchor="end">
          ▲ q &lt; 1e-300, drawn at the top
        </text>
      )}

      {/* Grid and axes */}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={PLOT.left} x2={PLOT.width - PLOT.right} y1={sy(v)} y2={sy(v)} stroke="#f1f5f9" />
          <text x={PLOT.left - 6} y={sy(v) + 3} fontSize={10} fill="#64748b" textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={sx(v)} x2={sx(v)} y1={PLOT.top} y2={PLOT.top + plotH} stroke={v === 0 ? '#cbd5e1' : '#f1f5f9'} />
          <text x={sx(v)} y={PLOT.top + plotH + 14} fontSize={10} fill="#64748b" textAnchor="middle">
            {v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`}
          </text>
        </g>
      ))}
      <rect x={PLOT.left} y={PLOT.top} width={plotW} height={plotH} fill="none" stroke="#cbd5e1" />
      <text x={PLOT.left + plotW / 2} y={PLOT.height - 6} fontSize={11} fill="#334155" textAnchor="middle">
        {adjusted ? 'Partial Spearman r' : 'Spearman r'} with {focus.short}
      </text>
      <text
        transform={`translate(12, ${PLOT.top + plotH / 2}) rotate(-90)`}
        fontSize={11}
        fill="#334155"
        textAnchor="middle"
      >
        −log10 q (square-root scale)
      </text>

      {/* FDR line */}
      <line
        x1={PLOT.left}
        x2={PLOT.width - PLOT.right}
        y1={sy(-LOG10_FDR)}
        y2={sy(-LOG10_FDR)}
        stroke="#94a3b8"
        strokeDasharray="4 3"
      />
      <text x={PLOT.width - PLOT.right - 4} y={sy(-LOG10_FDR) - 4} fontSize={10} fill="#64748b" textAnchor="end">
        q = {SCAN_FDR}
      </text>

      {/* Points */}
      {drawOrder.map((row) => {
        const id = row.measure.id;
        const isHovered = id === hovered;
        const x = sx(row.r);
        const y = sy(yValue(row));
        const name = `${row.measure.short}: r = ${formatR(row.r)}, q = ${formatLog10P(row.log10q)}`;
        const size = isHovered ? 7 : 4.5;
        // Capped points are triangles pointing up: their real height is off the chart
        const common = {
          role: 'button',
          tabIndex: 0,
          'aria-label': name,
          fill: ROLE_COLORS[row.measure.role],
          fillOpacity: significant(row) ? 0.85 : 0.3,
          stroke: isHovered ? '#0f172a' : 'white',
          strokeWidth: isHovered ? 2 : 1,
          style: { cursor: 'pointer' },
          onMouseEnter: () => onHover(id),
          onMouseLeave: () => onHover(null),
          onFocus: () => onHover(id),
          onBlur: () => onHover(null),
          onClick: () => onSelect(id),
          onKeyDown: (e: { key: string }) => (e.key === 'Enter' || e.key === ' ') && onSelect(id),
        };
        const title = <title>{`${name}. Click to map.`}</title>;
        return (
          <g key={id}>
            {capped(row) ? (
              <path
                d={`M${x},${y - size * 1.2} L${x + size * 1.1},${y + size * 0.8} L${x - size * 1.1},${y + size * 0.8} Z`}
                {...common}
              >
                {title}
              </path>
            ) : (
              <circle cx={x} cy={y} r={size} {...common}>
                {title}
              </circle>
            )}
          </g>
        );
      })}

      {/* Labels go on top of every point */}
      {labels.map((label) => (
        <text
          key={label.id}
          x={label.x}
          y={label.y}
          fontSize={10}
          fill="#0f172a"
          textAnchor={label.anchor}
          pointerEvents="none"
          style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3 }}
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}

// ---------- Table ----------

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; adjustedOnly?: boolean }[] = [
  { key: 'measure', label: 'Measure', align: 'left' },
  { key: 'r', label: 'r (95% CI)', align: 'right' },
  { key: 'rawR', label: 'Unadjusted r', align: 'right', adjustedOnly: true },
  { key: 'n', label: 'Counties', align: 'right' },
  { key: 'q', label: 'q', align: 'right' },
];

const compare: Record<SortKey, (a: ScanRow, b: ScanRow) => number> = {
  measure: (a, b) => a.measure.short.localeCompare(b.measure.short),
  r: (a, b) => a.r - b.r,
  rawR: (a, b) => (a.rawR ?? 0) - (b.rawR ?? 0),
  n: (a, b) => a.n - b.n,
  // Ties (common when q is tiny) fall back to the larger |r| first
  q: (a, b) => a.log10q - b.log10q || Math.abs(b.r) - Math.abs(a.r),
};

function ResultsTable({
  rows,
  adjusted,
  spatial,
  shortName,
  hovered,
  onHover,
  onSelect,
}: {
  rows: ScanRow[];
  adjusted: boolean;
  spatial: boolean;
  shortName: (id: string) => string;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortState>({ key: 'q', ascending: true });
  const sorted = [...rows].sort((a, b) => (sort.ascending ? 1 : -1) * compare[sort.key](a, b));

  const columns = COLUMNS.filter((col) => adjusted || !col.adjustedOnly);
  const changeSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, ascending: !current.ascending } : { key, ascending: key === 'measure' || key === 'q' }
    );

  return (
    <table aria-label="Scan results" style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              scope="col"
              aria-sort={sort.key === col.key ? (sort.ascending ? 'ascending' : 'descending') : 'none'}
              style={{ ...cellStyle, textAlign: col.align, borderBottom: '1px solid #cbd5e1' }}
            >
              <button
                type="button"
                onClick={() => changeSort(col.key)}
                style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, fontSize: 12, color: '#1e293b' }}
              >
                {col.label}
                {sort.key === col.key ? (sort.ascending ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          const id = row.measure.id;
          return (
            <tr
              key={id}
              onMouseEnter={() => onHover(id)}
              onMouseLeave={() => onHover(null)}
              style={{ background: id === hovered ? '#f1f5f9' : undefined, color: significant(row) ? '#1e293b' : '#94a3b8' }}
            >
              <th scope="row" style={{ ...cellStyle, textAlign: 'left', fontWeight: 400 }}>
                <span
                  aria-hidden
                  style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ROLE_COLORS[row.measure.role], marginRight: 6 }}
                />
                <button
                  type="button"
                  title={`${row.measure.name} (${row.measure.period}). ${ROLE_LABELS[row.measure.role]}.${
                    adjusted
                      ? ` Adjusted for ${row.adjustedFor.length ? row.adjustedFor.map(shortName).join(', ') : 'nothing'}.`
                      : ''
                  } Click to map.`}
                  onClick={() => onSelect(id)}
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left', fontSize: 12, textDecoration: 'underline dotted' }}
                >
                  {row.measure.short}
                </button>
              </th>
              <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {formatR(row.r)}{' '}
                <span style={{ color: '#94a3b8' }}>
                  ({formatR(row.ciLow)}, {formatR(row.ciHigh)})
                </span>
              </td>
              {adjusted && (
                <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {row.rawR === null ? '–' : formatR(row.rawR)}
                </td>
              )}
              <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {row.n.toLocaleString('en-US')}
                {spatial && (
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>eff. {Math.round(row.nEff).toLocaleString('en-US')}</div>
                )}
              </td>
              <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: significant(row) ? 600 : 400 }}>
                {formatLog10P(row.log10q)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
