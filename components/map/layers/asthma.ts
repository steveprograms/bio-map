// Asthma choropleth: counties colored by rate, plus a hatched fill for counties with no data.
import type { LayerSpecification } from 'maplibre-gl';
import type { Visibility } from '../config';
import { ASTHMA_COLOR_EXPR } from '../expressions';
import { HATCH_IMAGE_ID } from '../hatchPattern';

export function asthmaLayers(visibility: Visibility): LayerSpecification[] {
  return [
    {
      id: 'asthma-fill',
      type: 'fill',
      source: 'county-asthma',
      filter: ['!=', ['get', 'asthma'], null],
      layout: { visibility },
      paint: {
        'fill-color': ASTHMA_COLOR_EXPR,
        'fill-opacity': 0.8,
      },
    },
    {
      id: 'asthma-no-data',
      type: 'fill',
      source: 'county-asthma',
      filter: ['==', ['get', 'asthma'], null],
      layout: { visibility },
      paint: {
        'fill-pattern': HATCH_IMAGE_ID,
        'fill-opacity': 0.9,
      },
    },
  ];
}
