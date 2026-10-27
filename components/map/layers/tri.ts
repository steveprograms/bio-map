// EPA Toxics Release Inventory: heatmap when zoomed out, clickable circles when zoomed in.
import type { LayerSpecification } from 'maplibre-gl';
import type { Visibility } from '../config';
import { HEAT_COLOR_EXPR, LOG_AIR, SECTOR_COLOR_EXPR, radiusByAir } from '../expressions';

export const TRI_POINTS_LAYER_ID = 'tri-points';

// Fades out by zoom 9, as the circles fade in
export function triHeatmapLayer(visibility: Visibility): LayerSpecification {
  return {
    id: 'tri-heat',
    type: 'heatmap',
    source: 'tri',
    maxzoom: 9,
    filter: ['>', ['get', 'air_lbs'], 0],
    layout: { visibility },
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], LOG_AIR, 0, 0, 3, 0.1, 4.7, 0.4, 6, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 9, 2],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 9, 20],
      'heatmap-color': HEAT_COLOR_EXPR,
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.85, 9, 0],
    },
  };
}

// Sized by air releases, colored by industry. Added last so they sit on top and are clickable.
export function triPointsLayer(visibility: Visibility): LayerSpecification {
  return {
    id: TRI_POINTS_LAYER_ID,
    type: 'circle',
    source: 'tri',
    minzoom: 6,
    layout: { visibility },
    paint: {
      'circle-color': SECTOR_COLOR_EXPR,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, radiusByAir(0.6), 12, radiusByAir(1.4)],
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7.5, 0.85],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 0.6,
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7.5, 1],
    },
  };
}
