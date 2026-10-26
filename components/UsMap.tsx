'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Rough bounding box of the continental US: [west, south], [east, north]
const CONTINENTAL_US: [[number, number], [number, number]] = [
  [-125.0, 24.4],
  [-66.9, 49.5],
];

// ---------- Asthma layer settings ----------

// Asthma color ramp: [value, color] pairs, light (low) to dark (high)
const ASTHMA_STOPS: [number, string][] = [
  [8, '#fff7bc'],
  [10, '#fec44f'],
  [12, '#ec7014'],
  [14, '#8c2d04'],
];

// Draws a small diagonal-stripe tile used to mark counties with no data
function makeHatchPattern(size = 16): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Three offset lines so the stripes join up seamlessly when the tile repeats
  for (const offset of [-size, 0, size]) {
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
  }
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

// CSS version of the hatch pattern, for the legend swatch
const HATCH_CSS = 'repeating-linear-gradient(-45deg, #94a3b8 0 1.5px, #ffffff 1.5px 4px)';

// ---------- TRI (EPA Toxics Release Inventory) layer settings ----------

// Industry groups to color; any other sector falls back to OTHER_SECTOR_COLOR
const SECTOR_COLORS: [string, string][] = [
  ['Chemicals', '#2563eb'],
  ['Petroleum', '#111827'],
  ['Primary Metals', '#7c3aed'],
  ['Fabricated Metals', '#a78bfa'],
  ['Electric Utilities', '#db2777'],
  ['Paper', '#059669'],
  ['Nonmetallic Mineral Product', '#0891b2'],
];
const OTHER_SECTOR_COLOR = '#9ca3af';

// log10 of air releases (lbs); max(…, 1) avoids log10(0)
const LOG_AIR: ExpressionSpecification = ['log10', ['max', ['get', 'air_lbs'], 1]];

// Circle radius by air releases, scaled up or down for zoom level
const radiusByAir = (scale: number) =>
  [
    'interpolate', ['linear'], LOG_AIR,
    0, 2 * scale,   // 0–1 lbs
    3, 3 * scale,   // ~1,000 lbs (median)
    4.7, 6 * scale, // ~50,000 lbs (90th percentile)
    6, 11 * scale,  // ~1,000,000 lbs (99th+)
    7.3, 16 * scale // ~20,000,000 lbs (max)
  ] as ExpressionSpecification;

// Heatmap ramp in purples so it contrasts with the warm asthma colors
const HEAT_COLORS: [number, string][] = [
  [0, 'rgba(63, 0, 125, 0)'],
  [0.2, '#dadaeb'],
  [0.4, '#bcbddc'],
  [0.6, '#9e9ac8'],
  [0.8, '#6a51a3'],
  [1, '#3f007d'],
];

// ---------- Layer groups for the toggle panel ----------

const LAYER_GROUPS = {
  asthma: ['asthma-fill', 'asthma-no-data'],
  tri: ['tri-heat', 'tri-points'],
} as const;
type LayerKey = keyof typeof LAYER_GROUPS;

// Escapes text from the data before putting it in popup HTML
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

export default function UsMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    asthma: false,
    tri: false,
  });
  const visibleRef = useRef(visible); // lets the load handler read the current toggle state

  useEffect(() => {
    if (!containerRef.current) return;

    setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

    const map = new MapLibreMap({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      bounds: CONTINENTAL_US,
      fitBoundsOptions: { padding: 20 },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl(), 'top-right');

    map.on('load', () => {
      const vis = (key: LayerKey) => (visibleRef.current[key] ? 'visible' : 'none');

      // Insert our layers beneath the base map's labels so city names stay readable
      const firstSymbolId = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

      // Reuse the base style's font so our labels render with fonts the style actually serves
      const baseFont = firstSymbolId ? map.getLayoutProperty(firstSymbolId, 'text-font') : undefined;
      const labelFont = Array.isArray(baseFont) ? baseFont : ['Noto Sans Regular'];

      map.addSource('us-states', { type: 'geojson', data: '/data/us-states.geojson' });
      map.addSource('us-counties', { type: 'geojson', data: '/data/us-counties.geojson' });
      map.addSource('us-state-labels', { type: 'geojson', data: '/data/us-state-labels.geojson' });
      map.addSource('us-county-labels', { type: 'geojson', data: '/data/us-county-labels.geojson' });
      map.addSource('county-asthma', { type: 'geojson', data: '/data/us-counties-asthma.geojson' });
      map.addSource('tri', { type: 'geojson', data: '/data/tri-facilities.geojson' });

      // Register the hatch pattern (pixelRatio 2 keeps it crisp on high-res screens)
      map.addImage('no-data-hatch', makeHatchPattern(), { pixelRatio: 2 });

      // --- Asthma choropleth (bottom of our stack) ---

      map.addLayer(
        {
          id: 'asthma-fill',
          type: 'fill',
          source: 'county-asthma',
          filter: ['!=', ['get', 'asthma'], null],
          layout: { visibility: vis('asthma') },
          paint: {
            'fill-color': ['interpolate', ['linear'], ['get', 'asthma'], ...ASTHMA_STOPS.flat()],
            'fill-opacity': 0.8,
          },
        },
        firstSymbolId
      );

      map.addLayer(
        {
          id: 'asthma-no-data',
          type: 'fill',
          source: 'county-asthma',
          filter: ['==', ['get', 'asthma'], null],
          layout: { visibility: vis('asthma') },
          paint: {
            'fill-pattern': 'no-data-hatch',
            'fill-opacity': 0.9,
          },
        },
        firstSymbolId
      );

      // --- Boundaries ---

      // County lines: fade in between zoom 5 and 6
      map.addLayer(
        {
          id: 'county-borders',
          type: 'line',
          source: 'us-counties',
          minzoom: 5,
          paint: {
            'line-color': '#94a3b8',
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 10, 1],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 1],
          },
        },
        firstSymbolId
      );

      // State lines: always visible, thicker as you zoom in
      map.addLayer(
        {
          id: 'state-borders',
          type: 'line',
          source: 'us-states',
          paint: {
            'line-color': '#475569',
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 2],
          },
        },
        firstSymbolId
      );

      // --- TRI heatmap: zoomed-out view, fades out by zoom 9 ---

      map.addLayer(
        {
          id: 'tri-heat',
          type: 'heatmap',
          source: 'tri',
          maxzoom: 9,
          filter: ['>', ['get', 'air_lbs'], 0],
          layout: { visibility: vis('tri') },
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], LOG_AIR, 0, 0, 3, 0.1, 4.7, 0.4, 6, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 9, 2],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 9, 20],
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...HEAT_COLORS.flat()],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.85, 9, 0],
          },
        },
        firstSymbolId
      );

      // --- Labels ---

      // State labels: abbreviations when zoomed out, full names once there's room
      map.addLayer({
        id: 'state-labels',
        type: 'symbol',
        source: 'us-state-labels',
        layout: {
          'text-field': ['step', ['zoom'], ['get', 'STUSPS'], 4.5, ['get', 'NAME']],
          'text-font': labelFont,
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 14],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
        },
        paint: {
          'text-color': '#334155',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      // County labels: only when zoomed in far enough to read them
      map.addLayer({
        id: 'county-labels',
        type: 'symbol',
        source: 'us-county-labels',
        minzoom: 7,
        layout: {
          'text-field': ['get', 'NAME'],
          'text-font': labelFont,
          'text-size': 11,
        },
        paint: {
          'text-color': '#64748b',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      });

      // --- TRI facility circles: top of the stack so they're clickable ---

      map.addLayer({
        id: 'tri-points',
        type: 'circle',
        source: 'tri',
        minzoom: 6,
        layout: { visibility: vis('tri') },
        paint: {
          'circle-color': ['match', ['get', 'sector'], ...SECTOR_COLORS.flat(), OTHER_SECTOR_COLOR],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, radiusByAir(0.6), 12, radiusByAir(1.4)],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7.5, 0.85],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 0.6,
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7.5, 1],
        },
      });

      // Popup with facility details on click
      map.on('click', 'tri-points', (e) => {
        const p = e.features?.[0]?.properties;
        if (!p) return;
        const air = Number(p.air_lbs).toLocaleString();
        const onsite = Number(p.onsite_lbs).toLocaleString();
        new Popup({ maxWidth: '280px' })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4;">
               <div style="font-weight: 600; font-size: 13px;">${esc(p.name)}</div>
               <div style="color: #64748b;">${esc(p.city)}, ${esc(p.state)} · ${esc(p.sector)}</div>
               <div style="margin-top: 6px;"><b>Air releases:</b> ${air} lbs</div>
               <div><b>All on-site releases:</b> ${onsite} lbs</div>
               ${p.top_air_chems ? `<div style="margin-top: 4px;"><b>Top air chemicals:</b> ${esc(p.top_air_chems)}</div>` : ''}
               <div style="margin-top: 6px; color: #94a3b8; font-size: 11px;">EPA TRI, 2024</div>
             </div>`
          )
          .addTo(map);
      });

      // Pointer cursor when hovering a facility
      map.on('mouseenter', 'tri-points', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'tri-points', () => (map.getCanvas().style.cursor = ''));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Show or hide each layer group whenever a checkbox changes
  useEffect(() => {
    visibleRef.current = visible;
    const map = mapRef.current;
    if (!map) return;
    for (const [key, ids] of Object.entries(LAYER_GROUPS)) {
      for (const id of ids) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visible[key as LayerKey] ? 'visible' : 'none');
        }
      }
    }
  }, [visible]);

  const toggle = (key: LayerKey) => setVisible((v) => ({ ...v, [key]: !v[key] }));

  const asthmaGradient = `linear-gradient(to right, ${ASTHMA_STOPS.map(([, c]) => c).join(', ')})`;
  const heatGradient = `linear-gradient(to right, ${HEAT_COLORS.slice(1).map(([, c]) => c).join(', ')})`;

  const legendNote = { fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.3 };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Layer panel */}
      <div
        style={{
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
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Layers</div>

        {/* Asthma */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={visible.asthma} onChange={() => toggle('asthma')} />
          Adult asthma (county)
        </label>

        {visible.asthma && (
          <div style={{ margin: '8px 0 10px' }}>
            <div style={{ height: 10, borderRadius: 2, background: asthmaGradient }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 }}>
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
              Age-adjusted % of adults with current asthma, 2023. Source: CDC PLACES, 2025 release.
            </div>
          </div>
        )}

        {/* TRI */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 6 }}>
          <input type="checkbox" checked={visible.tri} onChange={() => toggle('tri')} />
          Toxic air releases (EPA TRI)
        </label>

        {visible.tri && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 10, borderRadius: 2, background: heatGradient }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 }}>
              <span>Lower</span>
              <span>Higher concentration</span>
            </div>
            <div style={{ fontSize: 11, marginTop: 8, marginBottom: 4 }}>
              Facilities (zoom in; size = air releases):
            </div>
            {[...SECTOR_COLORS, ['Other', OTHER_SECTOR_COLOR] as [string, string]].map(([name, color]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span
                  style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }}
                />
                {name === 'Nonmetallic Mineral Product' ? 'Nonmetallic Minerals' : name}
              </div>
            ))}
            <div style={legendNote}>
              Reported stack + fugitive air releases, 2024. Click a facility for details. Source: EPA Toxics
              Release Inventory.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}