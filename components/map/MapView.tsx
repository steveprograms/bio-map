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
  LAYER_GROUPS,
  WORKER_URL,
  type LayerKey,
} from './config';
import { HATCH_IMAGE_ID, makeHatchPattern } from './hatchPattern';
import { buildLayers, toVisibility } from './layers';
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

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    asthma: false,
    tri: false,
  });
  const visibleRef = useRef(visible); // lets the load handler read the current toggle state

  useEffect(() => {
    if (!containerRef.current) return;

    setWorkerUrl(WORKER_URL);

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      bounds: CONTINENTAL_US,
      fitBoundsOptions: { padding: 20 },
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') window.__usMap = map;

    map.addControl(new NavigationControl(), 'top-right');

    map.on('load', () => {
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

  const toggle = (key: LayerKey) => setVisible((v) => ({ ...v, [key]: !v[key] }));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* data-loaded flips to "true" once all layers are added (used by end-to-end tests) */}
      <div ref={containerRef} data-testid="map" data-loaded={mapLoaded} style={{ width: '100%', height: '100%' }} />
      <LayerPanel visible={visible} onToggle={toggle} />
    </div>
  );
}
