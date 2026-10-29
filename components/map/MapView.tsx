'use client';

// Creates the MapLibre map, adds the data sources and layers, and wires up the panels.
// Layer definitions live in ./layers, colors and settings in ./config.
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';

import {
  BASE_STYLE_URL,
  CONTINENTAL_US,
  DATA_SOURCES,
  DEFAULT_MEASURE_ID,
  LAYER_GROUPS,
  MAX_SELECTED,
  MEASURES_URL,
  WORKER_URL,
  type LayerKey,
  type Measure,
} from './config';
import { buildCountyIndex, type CountyIndex } from './countyStats';
import { hasValue, lacksValue, measureColorExpr } from './expressions';
import { HATCH_IMAGE_ID, makeHatchPattern } from './hatchPattern';
import { buildLayers, toVisibility } from './layers';
import { HEALTH_FILL_ID, HEALTH_NO_DATA_ID } from './layers/health';
import { COUNTY_HIT_ID, updateSelectionLayers } from './layers/selection';
import { TRI_POINTS_LAYER_ID } from './layers/tri';
import { triPopupHtml } from './popup';
import CompareTable from './CompareTable';
import LayerPanel from './LayerPanel';
import SelectionPanel from './SelectionPanel';

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

// Fetches a JSON file; returns null (and logs why) if it fails
async function loadJson<T>(url: string, what: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return (await response.json()) as T;
  } catch (error) {
    console.error(`Could not load ${what}:`, error);
    return null;
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

  // The county table in memory (for cards and comparisons) and the selected counties
  const [countyIndex, setCountyIndex] = useState<CountyIndex | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedRef = useRef(selected);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    setWorkerUrl(WORKER_URL);
    // Start downloading while the map loads. The county file is loaded once here and handed
    // to the map, so the cards and the map share the same copy.
    const dataPromise = Promise.all([
      loadJson<Measure[]>(MEASURES_URL, 'measures'),
      loadJson<GeoJSON.FeatureCollection>(DATA_SOURCES.counties, 'county data'),
    ]);

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      bounds: CONTINENTAL_US,
      fitBoundsOptions: { padding: 20 },
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') window.__usMap = map;

    map.addControl(new NavigationControl(), 'top-right');

    // Adds a county to the selection, or removes it if it's already selected
    const toggleCounty = (fips: string) =>
      setSelected((current) => {
        if (current.includes(fips)) return current.filter((f) => f !== fips);
        return current.length >= MAX_SELECTED ? current : [...current, fips];
      });

    map.on('load', async () => {
      const [loadedMeasures, counties] = await dataPromise;
      if (cancelled) return; // the component was unmounted while we waited

      const measureList = loadedMeasures ?? [];
      setMeasures(measureList);
      if (counties) setCountyIndex(buildCountyIndex(counties.features, measureList));

      const measure = measureList.find((m) => m.id === measureIdRef.current) ?? measureList[0];
      if (measure && measure.id !== measureIdRef.current) setMeasureId(measure.id);

      // Our layers go beneath the base map's labels so city names stay readable
      const firstSymbolId = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

      // Reuse the base style's font so our labels render with fonts the style actually serves
      const baseFont = firstSymbolId ? map.getLayoutProperty(firstSymbolId, 'text-font') : undefined;
      const labelFont: string[] = isStringArray(baseFont) ? baseFont : ['Noto Sans Regular'];

      for (const [id, url] of Object.entries(DATA_SOURCES)) {
        if (id === 'counties') {
          // promoteId makes each county's GEOID its feature id, which hover highlighting needs
          map.addSource(id, { type: 'geojson', data: counties ?? url, promoteId: 'GEOID' });
        } else {
          map.addSource(id, { type: 'geojson', data: url });
        }
      }

      // pixelRatio 2 keeps the hatch pattern crisp on high-res screens
      map.addImage(HATCH_IMAGE_ID, makeHatchPattern(), { pixelRatio: 2 });

      const { belowLabels, aboveLabels } = buildLayers({
        visibility: toVisibility(visibleRef.current),
        labelFont,
        measure,
        selected: selectedRef.current,
      });
      belowLabels.forEach((layer) => map.addLayer(layer, firstSymbolId));
      aboveLabels.forEach((layer) => map.addLayer(layer));

      // Click: a facility opens its popup. Otherwise, if a popup is open, the click only closes it
      // (so closing a popup never selects a county by accident). Otherwise the county under the
      // cursor is selected or unselected.
      let openPopup: Popup | null = null;
      map.on('click', (e) => {
        if (map.getLayer(TRI_POINTS_LAYER_ID)) {
          const facility = map.queryRenderedFeatures(e.point, { layers: [TRI_POINTS_LAYER_ID] })[0];
          if (facility) {
            openPopup?.remove();
            const popup = new Popup({ maxWidth: '280px', className: 'tri-popup', closeOnClick: false })
              .setLngLat(e.lngLat)
              .setHTML(triPopupHtml(facility.properties ?? {}))
              .addTo(map);
            popup.on('close', () => {
              if (openPopup === popup) openPopup = null;
            });
            openPopup = popup;
            return;
          }
        }
        if (openPopup) {
          openPopup.remove();
          return;
        }
        const county = map.queryRenderedFeatures(e.point, { layers: [COUNTY_HIT_ID] })[0];
        if (county?.id !== undefined) toggleCounty(String(county.id));
      });

      // Hover: outline the county under the cursor
      let hoveredId: string | number | undefined;
      const setHovered = (id: string | number | undefined) => {
        if (hoveredId !== undefined) map.setFeatureState({ source: 'counties', id: hoveredId }, { hover: false });
        hoveredId = id;
        if (id !== undefined) map.setFeatureState({ source: 'counties', id }, { hover: true });
      };
      map.on('mousemove', COUNTY_HIT_ID, (e) => {
        const id = e.features?.[0]?.id;
        if (id !== hoveredId) setHovered(id);
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', COUNTY_HIT_ID, () => {
        setHovered(undefined);
        map.getCanvas().style.cursor = '';
      });

      // Mark the map ready once everything is drawn, including the county data, so clicks
      // can find counties (end-to-end tests wait for this)
      map.once('idle', () => {
        if (!cancelled) setMapLoaded(true);
      });    
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

  // Recolor the county layer whenever a different measure is picked
  useEffect(() => {
    measureIdRef.current = measureId;
    const map = mapRef.current;
    const measure = measures.find((m) => m.id === measureId);
    if (!map || !measure || !map.getLayer(HEALTH_FILL_ID)) return;
    map.setPaintProperty(HEALTH_FILL_ID, 'fill-color', measureColorExpr(measure));
    map.setFilter(HEALTH_FILL_ID, hasValue(measure.id));
    map.setFilter(HEALTH_NO_DATA_ID, lacksValue(measure.id));
  }, [measureId, measures]);

  // Redraw the selection outlines and numbers whenever the selection changes
  useEffect(() => {
    selectedRef.current = selected;
    const map = mapRef.current;
    if (map) updateSelectionLayers(map, selected);
  }, [selected]);

  const toggle = (key: LayerKey) => setVisible((v) => ({ ...v, [key]: !v[key] }));

  // From the compare table: show a measure on the map (and turn the county layer on)
  const showMeasure = (id: string) => {
    setMeasureId(id);
    setVisible((v) => ({ ...v, health: true }));
  };

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
      <SelectionPanel
        selected={selected}
        index={countyIndex}
        measures={measures}
        measureId={measureId}
        onRemove={(fips) => setSelected((current) => current.filter((f) => f !== fips))}
        onClear={() => setSelected([])}
        onCompare={() => setComparing(true)}
      />
      {comparing && countyIndex && selected.length > 0 && (
        <CompareTable
          selected={selected}
          index={countyIndex}
          measures={measures}
          measureId={measureId}
          onMeasureChange={showMeasure}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}
