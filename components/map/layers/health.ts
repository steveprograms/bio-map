// Health measure choropleth: counties colored by the selected PLACES measure,
// plus a hatched fill for counties with no data for that measure.
import type { LayerSpecification } from 'maplibre-gl';
import type { Measure, Visibility } from '../config';
import { hasValue, lacksValue, measureColorExpr } from '../expressions';
import { HATCH_IMAGE_ID } from '../hatchPattern';

export const HEALTH_FILL_ID = 'health-fill';
export const HEALTH_NO_DATA_ID = 'health-no-data';

export function healthLayers(visibility: Visibility, measure: Measure): LayerSpecification[] {
  return [
    {
      id: HEALTH_FILL_ID,
      type: 'fill',
      source: 'counties',
      filter: hasValue(measure.id),
      layout: { visibility },
      paint: {
        'fill-color': measureColorExpr(measure),
        'fill-opacity': 0.8,
      },
    },
    {
      id: HEALTH_NO_DATA_ID,
      type: 'fill',
      source: 'counties',
      filter: lacksValue(measure.id),
      layout: { visibility },
      paint: {
        'fill-pattern': HATCH_IMAGE_ID,
        'fill-opacity': 0.9,
      },
    },
  ];
}
