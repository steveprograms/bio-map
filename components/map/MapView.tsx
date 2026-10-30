'use client';

// Creates the MapLibre map, adds the data sources and layers, and wires up the panels.
// Layer definitions live in ./layers, colors and settings in ./config.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';

import {
  BASE_STYLE_URL,
  CONTINENTAL_US,
  DATA_SOURCES,
  DEFAULT_MEASURE_ID,
  DEFAULT_PAIR,
  DEFAULT_SCAN_FOCUS,
  LAYER_GROUPS,
  MAX_SELECTED,
  MEASURES_URL,
  WORKER_URL,
  type CountyMode,
  type LayerKey,
  type Measure,
  type Pair,
  type ScanKind,
} from './config';
import { buildCountyIndex, type CountyIndex } from './countyStats';
import { HATCH_IMAGE_ID, makeHatchPattern } from './hatchPattern';
import { buildLayers, toVisibility } from './layers';
import { applyCountyFill, countyFillFor, type CountyView } from './layers/health';
import { COUNTY_HIT_ID, updateSelectionLayers } from './layers/selection';
import { TRI_POINTS_LAYER_ID } from './layers/tri';
import { triPopupHtml } from './popup';
import { summarizePair } from './stats';
import CompareTable from './CompareTable';
import LayerPanel from './LayerPanel';
import ScanPanel from './ScanPanel';
import { focusChoices } from './scan';
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

  // What the county layer shows: one measure, or two at once (with an optional legend square alone)
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [countyMode, setCountyMode] = useState<CountyMode>('single');
  const [measureId, setMeasureId] = useState(DEFAULT_MEASURE_ID);
  const [pair, setPair] = useState<Pair>(DEFAULT_PAIR);
  const [pairCell, setPairCell] = useState<number | null>(null);

  // The county table in memory (for cards and comparisons) and the selected counties
  const [countyIndex, setCountyIndex] = useState<CountyIndex | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedRef = useRef(selected);
  const [comparing, setComparing] = useState(false);

  // Scans: open or not, which kind, and the measure each kind starts from (kept while closed)
  const [scanOpen, setScanOpen] = useState(false);
  const [scanKind, setScanKind] = useState<ScanKind>('outcome');
  const [scanFocus, setScanFocus] = useState<Record<ScanKind, string>>(DEFAULT_SCAN_FOCUS);
  const [scanAdjust, setScanAdjust] = useState<string[]>([]); // covariates to adjust for
  const [scanSpatial, setScanSpatial] = useState(true); // correct for spatial autocorrelation

  // Thirds, counts, and correlation for the two-measure map (recomputed when the pair changes)
  const pairSummary = useMemo(
    () => (countyIndex ? summarizePair(countyIndex, pair.xId, pair.yId) : null),
    [countyIndex, pair]
  );
  const view: CountyView = { mode: countyMode, measureId, pair, cell: pairCell };
  const fill = countyFillFor(measures, view, pairSummary);
  // The measure(s) the county layer is showing, for the cards and compare table
  const mapMeasureIds = fill?.kind === 'pair' ? [fill.y.id, fill.x.id] : fill ? [fill.measure.id] : [];

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

      // Start with the default measure; the effect below switches to whatever the panel shows
      const firstMeasure = measureList.find((m) => m.id === DEFAULT_MEASURE_ID) ?? measureList[0];

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
        fill: firstMeasure && { kind: 'single', measure: firstMeasure },
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

  // Recolor the county layer whenever the panel's choices change. JSON comparison skips
  // re-renders that don't change what's drawn.
  const fillKey = JSON.stringify(fill);
  useEffect(() => {
    const map = mapRef.current;
    if (map && fill) applyCountyFill(map, fill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillKey, mapLoaded]);

  // Redraw the selection outlines and numbers whenever the selection changes
  useEffect(() => {
    selectedRef.current = selected;
    const map = mapRef.current;
    if (map) updateSelectionLayers(map, selected);
  }, [selected]);

  const toggle = (key: LayerKey) => setVisible((v) => ({ ...v, [key]: !v[key] }));

  // From the compare table: show a measure on the map by itself (and turn the county layer on)
  const showMeasure = (id: string) => {
    setMeasureId(id);
    setCountyMode('single');
    setVisible((v) => ({ ...v, health: true }));
  };

  // A new pair gets new thirds, so any legend square shown alone no longer applies
  const changePair = (next: Pair) => {
    setPair(next);
    setPairCell(null);
  };

  // From a scan result: close the scan and show the pair on the two-measure map
  const mapScanPair = (next: Pair) => {
    changePair(next);
    setCountyMode('pair');
    setVisible((v) => ({ ...v, health: true }));
    setScanOpen(false);
  };

  // The scan's starting measure, falling back to the first one of the right role
  const scanFocusId = focusChoices(measures, scanKind).some((m) => m.id === scanFocus[scanKind])
    ? scanFocus[scanKind]
    : (focusChoices(measures, scanKind)[0]?.id ?? '');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* data-loaded flips to "true" once all layers are added (used by end-to-end tests) */}
      <div ref={containerRef} data-testid="map" data-loaded={mapLoaded} style={{ width: '100%', height: '100%' }} />
      <LayerPanel
        visible={visible}
        onToggle={toggle}
        measures={measures}
        countyMode={countyMode}
        onCountyModeChange={setCountyMode}
        measureId={measureId}
        onMeasureChange={setMeasureId}
        pair={pair}
        onPairChange={changePair}
        pairCell={pairCell}
        onPairCellChange={setPairCell}
        pairSummary={pairSummary}
        onOpenScan={() => {
          setComparing(false);
          setScanOpen(true);
        }}
        scanReady={countyIndex !== null && measures.length > 0}
      />
      <SelectionPanel
        selected={selected}
        index={countyIndex}
        measures={measures}
        mapMeasureIds={mapMeasureIds}
        onRemove={(fips) => setSelected((current) => current.filter((f) => f !== fips))}
        onClear={() => setSelected([])}
        onCompare={() => setComparing(true)}
      />
      {comparing && countyIndex && selected.length > 0 && (
        <CompareTable
          selected={selected}
          index={countyIndex}
          measures={measures}
          mapMeasureIds={mapMeasureIds}
          onMeasureChange={showMeasure}
          onClose={() => setComparing(false)}
        />
      )}
      {scanOpen && countyIndex && (
        <ScanPanel
          index={countyIndex}
          measures={measures}
          kind={scanKind}
          onKindChange={setScanKind}
          focusId={scanFocusId}
          onFocusChange={(id) => setScanFocus((current) => ({ ...current, [scanKind]: id }))}
          adjustFor={scanAdjust}
          onAdjustForChange={setScanAdjust}
          spatialCorrection={scanSpatial}
          onSpatialCorrectionChange={setScanSpatial}
          onMapPair={mapScanPair}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}
