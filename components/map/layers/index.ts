// Builds every map layer in drawing order. To add a new layer:
//   1. write a builder in this folder (see asthma.ts or tri.ts),
//   2. add it to buildLayers below,
//   3. if it should be toggleable, add it to LAYER_GROUPS and LAYER_LABELS in config.ts.
import type { LayerSpecification } from 'maplibre-gl';
import type { LayerKey, Visibility } from '../config';
import { asthmaLayers } from './asthma';
import { boundaryLabelLayers, boundaryLineLayers } from './boundaries';
import { triHeatmapLayer, triPointsLayer } from './tri';

export function toVisibility(visible: Record<LayerKey, boolean>): Record<LayerKey, Visibility> {
  return Object.fromEntries(
    Object.entries(visible).map(([key, on]) => [key, on ? 'visible' : 'none'])
  ) as Record<LayerKey, Visibility>;
}

interface BuildLayersOptions {
  visibility: Record<LayerKey, Visibility>;
  labelFont: string[];
}

export function buildLayers({ visibility, labelFont }: BuildLayersOptions): {
  belowLabels: LayerSpecification[]; // inserted beneath the base map's labels, bottom first
  aboveLabels: LayerSpecification[]; // added on top of everything, bottom first
} {
  return {
    belowLabels: [
      ...asthmaLayers(visibility.asthma),
      ...boundaryLineLayers(),
      triHeatmapLayer(visibility.tri),
    ],
    aboveLabels: [
      ...boundaryLabelLayers(labelFont),
      triPointsLayer(visibility.tri),
    ],
  };
}
