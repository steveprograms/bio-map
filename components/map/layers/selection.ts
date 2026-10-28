// County hover and selection: an invisible fill that catches clicks, a hover outline,
// and a colored, numbered outline for each selected county.
import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { SELECTION_COLORS } from '../config';

export const COUNTY_HIT_ID = 'county-hit';
export const COUNTY_HOVER_ID = 'county-hover';
export const COUNTY_SELECTED_CASING_ID = 'county-selected-casing';
export const COUNTY_SELECTED_ID = 'county-selected';
export const COUNTY_SELECTED_LABEL_ID = 'county-selected-label';

const asExpression = (e: unknown[]) => e as unknown as ExpressionSpecification;

export const selectionColor = (index: number) => SELECTION_COLORS[index % SELECTION_COLORS.length];

// Only the selected counties
export const selectedFilter = (selected: string[]) =>
  asExpression(['in', ['get', 'GEOID'], ['literal', selected]]);

// Picks a value per selected county by its position in the selection; MapLibre's "match"
// needs at least one case, so with nothing selected we return the fallback directly
function bySelection(selected: string[], valueFor: (index: number) => string, fallback: string) {
  if (selected.length === 0) return fallback;
  return asExpression(['match', ['get', 'GEOID'], ...selected.flatMap((fips, i) => [fips, valueFor(i)]), fallback]);
}

export const selectedColorExpr = (selected: string[]) => bySelection(selected, selectionColor, '#000000');
export const selectedNumberExpr = (selected: string[]) => bySelection(selected, (i) => String(i + 1), '');

// Drawn above the county fills and borders, beneath the base map's labels
export function selectionLineLayers(selected: string[]): LayerSpecification[] {
  return [
    {
      // Invisible, but still clickable: lets counties be selected even when no county data is shown
      id: COUNTY_HIT_ID,
      type: 'fill',
      source: 'counties',
      paint: { 'fill-color': '#000000', 'fill-opacity': 0 },
    },
    {
      id: COUNTY_HOVER_ID,
      type: 'line',
      source: 'counties',
      paint: {
        'line-color': '#0f172a',
        'line-width': 1.5,
        'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0],
      },
    },
    {
      // White edge under the colored outline so it stands out on any fill color
      id: COUNTY_SELECTED_CASING_ID,
      type: 'line',
      source: 'counties',
      filter: selectedFilter(selected),
      paint: { 'line-color': '#ffffff', 'line-width': 6 },
    },
    {
      id: COUNTY_SELECTED_ID,
      type: 'line',
      source: 'counties',
      filter: selectedFilter(selected),
      paint: { 'line-color': selectedColorExpr(selected), 'line-width': 3 },
    },
  ];
}

// The selection number (1, 2, 3...) at each selected county's label point, above everything
export function selectionLabelLayer(selected: string[], labelFont: string[]): LayerSpecification {
  return {
    id: COUNTY_SELECTED_LABEL_ID,
    type: 'symbol',
    source: 'us-county-labels',
    filter: selectedFilter(selected),
    layout: {
      'text-field': selectedNumberExpr(selected),
      'text-font': labelFont,
      'text-size': 15,
      'text-offset': [0, -1],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': selectedColorExpr(selected),
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
    },
  };
}

// Updates the live map after the selection changes
export function updateSelectionLayers(map: MapLibreMap, selected: string[]) {
  for (const id of [COUNTY_SELECTED_CASING_ID, COUNTY_SELECTED_ID, COUNTY_SELECTED_LABEL_ID]) {
    if (map.getLayer(id)) map.setFilter(id, selectedFilter(selected));
  }
  if (map.getLayer(COUNTY_SELECTED_ID)) {
    map.setPaintProperty(COUNTY_SELECTED_ID, 'line-color', selectedColorExpr(selected));
  }
  if (map.getLayer(COUNTY_SELECTED_LABEL_ID)) {
    map.setLayoutProperty(COUNTY_SELECTED_LABEL_ID, 'text-field', selectedNumberExpr(selected));
    map.setPaintProperty(COUNTY_SELECTED_LABEL_ID, 'text-color', selectedColorExpr(selected));
  }
}
