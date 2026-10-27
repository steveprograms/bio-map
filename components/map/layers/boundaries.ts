// State and county outlines and labels (always on).
import type { LayerSpecification } from 'maplibre-gl';

export function boundaryLineLayers(): LayerSpecification[] {
  return [
    // County lines: fade in between zoom 5 and 6
    {
      id: 'county-borders',
      type: 'line',
      source: 'counties',
      minzoom: 5,
      paint: {
        'line-color': '#94a3b8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 10, 1],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 1],
      },
    },
    // State lines: always visible, thicker as you zoom in
    {
      id: 'state-borders',
      type: 'line',
      source: 'us-states',
      paint: {
        'line-color': '#475569',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 2],
      },
    },
  ];
}

// labelFont should be a font the base style serves (UsMap reads it from the style)
export function boundaryLabelLayers(labelFont: string[]): LayerSpecification[] {
  return [
    // State labels: abbreviations when zoomed out, full names once there's room
    {
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
    },
    // County labels: only when zoomed in far enough to read them
    {
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
    },
  ];
}
