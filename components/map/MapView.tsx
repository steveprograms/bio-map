'use client';

// Creates the MapLibre map, adds the data sources and layers, and wires up the layer panel.
// Layer definitions live in ./layers, colors and settings in ./config.
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  BASE_STYLE_URL,
  CONTINENTAL_US,
  DATA_SOURCES,
  DEFAULT_MEASURE_ID,
  LAYER_GROUPS,
  MEASURES_URL,
  WORKER_URL,
  type LayerKey,
  type Measure,
} from './config';
import { hasValue, lacksValue, measureColorExpr } from './expressions';
import { HATCH_IMAGE_ID, makeHatchPattern } from './hatchPattern';
import { buildLayers, toVisibility } from './layers';
import { HEALTH_FILL_ID, HEALTH_NO_DATA_ID } from './layers/health';
import { TRI_POINTS_LAYER_ID } from './layers/tri';
import { triPopupHtml } from './popup';
import LayerPanel from './LayerPanel';

// In development, the map is exposed as window.__usMap so end-to-end tests
// (and you, in the browser console) can inspect it. Not set in production.
declare global {
  interface Window {
    __usMap?: MapLibreMap;
  }
}

// A style's text-font can be a plain list of font names or a MapLibre expression;
// we can only reuse it for our labels when it's a plain list
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

// Loads the list of health measures; returns an empty list (and logs why) if it fails
async function loadMeasures(): Promise<Measure[]> {
  try {
    const response = await fetch(MEASURES_URL);
    if (!response.ok) throw new Error(`${MEASURES_URL} returned ${response.status}`);
    return (await response.json()) as Measure[];
  } catch (error) {
    console.error('Could not load health measures:', error);
    return [];
  }
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    health: false,
    tri: false,
  });
  const visibleRef = useRef(visible); // lets the load handler read the current toggle state

  const [measures, setMeasures] = useState<Measure[]>([]);
  const [measureId, setMeasureId] = useState(DEFAULT_MEASURE_ID);
  const measureIdRef = useRef(measureId); // same idea as visibleRef

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    setWorkerUrl(WORKER_URL);
    const measuresPromise = loadMeasures(); // start downloading while the map loads

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      bounds: CONTINENTAL_US,
      fitBoundsOptions: { padding: 20 },
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') window.__usMap = map;

    map.addControl(new NavigationControl(), 'top-right');

    map.on('load', async () => {
      const loadedMeasures = await measuresPromise;
      if (cancelled) return; // the component was unmounted while we waited

      setMeasures(loadedMeasures);
      const measure =
        loadedMeasures.find((m) => m.id === measureIdRef.current) ?? loadedMeasures[0];
      if (measure && measure.id !== measureIdRef.current) setMeasureId(measure.id);

      // Our layers go beneath the base map's labels so city names stay readable
      const firstSymbolId = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

      // Reuse the base style's font so our labels render with fonts the style actually serves
      const baseFont = firstSymbolId ? map.getLayoutProperty(firstSymbolId, 'text-font') : undefined;
      const labelFont: string[] = isStringArray(baseFont) ? baseFont : ['Noto Sans Regular'];

      for (const [id, url] of Object.entries(DATA_SOURCES)) {
        map.addSource(id, { type: 'geojson', data: url });
      }

      // pixelRatio 2 keeps the hatch pattern crisp on high-res screens
      map.addImage(HATCH_IMAGE_ID, makeHatchPattern(), { pixelRatio: 2 });

      const { belowLabels, aboveLabels } = buildLayers({
        visibility: toVisibility(visibleRef.current),
        labelFont,
        measure,
      });
      belowLabels.forEach((layer) => map.addLayer(layer, firstSymbolId));
      aboveLabels.forEach((layer) => map.addLayer(layer));

      // Facility popup on click
      map.on('click', TRI_POINTS_LAYER_ID, (e) => {
        const properties = e.features?.[0]?.properties;
        if (!properties) return;
        new Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(triPopupHtml(properties)).addTo(map);
      });

      // Pointer cursor when hovering a facility
      map.on('mouseenter', TRI_POINTS_LAYER_ID, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', TRI_POINTS_LAYER_ID, () => (map.getCanvas().style.cursor = ''));

      setMapLoaded(true);
    });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      if (window.__usMap === map) delete window.__usMap;
    };
  }, []);

  // Show or hide each layer group whenever a checkbox changes
  useEffect(() => {
    visibleRef.current = visible;
    const map = mapRef.current;
    if (!map) return;
    const visibility = toVisibility(visible);
    for (const key of Object.keys(LAYER_GROUPS) as LayerKey[]) {
      for (const id of LAYER_GROUPS[key]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility[key]);
      }
    }
  }, [visible]);

  // Recolor the health layer whenever a different measure is picked
  useEffect(() => {
    measureIdRef.current = measureId;
    const map = mapRef.current;
    const measure = measures.find((m) => m.id === measureId);
    if (!map || !measure || !map.getLayer(HEALTH_FILL_ID)) return;
    map.setPaintProperty(HEALTH_FILL_ID, 'fill-color', measureColorExpr(measure));
    map.setFilter(HEALTH_FILL_ID, hasValue(measure.id));
    map.setFilter(HEALTH_NO_DATA_ID, lacksValue(measure.id));
  }, [measureId, measures]);

  const toggle = (key: LayerKey) => setVisible((v) => ({ ...v, [key]: !v[key] }));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* data-loaded flips to "true" once all layers are added (used by end-to-end tests) */}
      <div ref={containerRef} data-testid="map" data-loaded={mapLoaded} style={{ width: '100%', height: '100%' }} />
      <LayerPanel
        visible={visible}
        onToggle={toggle}
        measures={measures}
        measureId={measureId}
        onMeasureChange={setMeasureId}
      />
    </div>
  );
}
