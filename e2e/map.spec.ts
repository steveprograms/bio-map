// End-to-end tests: run the real app in a real browser.
// These need an internet connection, since the base map comes from OpenFreeMap.
import { expect, test, type Page } from '@playwright/test';
import {
  DATA_SOURCES,
  LAYER_GROUPS,
  LAYER_LABELS,
  MEASURE_PICKER_LABEL,
  MEASURES_URL,
  WORKER_URL,
  type LayerKey,
} from '../components/map/config';

// Opens the home page and waits until all our layers have been added
async function openLoadedMap(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('map')).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
}

// Reads a layer's visibility from the live map (exposed as window.__usMap in development)
function layerVisibility(page: Page, layerId: string) {
  return page.evaluate((id) => window.__usMap?.getLayoutProperty(id, 'visibility'), layerId);
}

test('map loads without worker or page errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /worker|measures/i.test(msg.text())) problems.push(msg.text());
  });

  await openLoadedMap(page);

  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  expect(problems).toEqual([]);
});

test('data files and the MapLibre worker are served', async ({ request }) => {
  for (const url of [...Object.values(DATA_SOURCES), MEASURES_URL, WORKER_URL]) {
    const response = await request.get(url);
    expect(response.ok(), `${url} returned ${response.status()}`).toBe(true);
  }
});

for (const key of Object.keys(LAYER_GROUPS) as LayerKey[]) {
  const label = LAYER_LABELS[key];

  test(`"${label}" checkbox shows and hides its map layers`, async ({ page }) => {
    await openLoadedMap(page);
    const checkbox = page.getByLabel(label, { exact: true });

    for (const id of LAYER_GROUPS[key]) expect(await layerVisibility(page, id)).toBe('none');

    await checkbox.check();
    for (const id of LAYER_GROUPS[key]) {
      await expect.poll(() => layerVisibility(page, id)).toBe('visible');
    }

    await checkbox.uncheck();
    for (const id of LAYER_GROUPS[key]) {
      await expect.poll(() => layerVisibility(page, id)).toBe('none');
    }
  });
}

// Clicks the map at a longitude/latitude (converted to a screen position by the live map)
async function clickLngLat(page: Page, lng: number, lat: number) {
  const point = await page.evaluate(([x, y]) => {
    const p = window.__usMap!.project([x, y]);
    return { x: p.x, y: p.y };
  }, [lng, lat]);
  const box = await page.getByTestId('map').boundingBox();
  await page.mouse.click(box!.x + point.x, box!.y + point.y);
}

test('clicking counties selects them, and they can be compared and removed', async ({ page }) => {
  await openLoadedMap(page);

  await clickLngLat(page, -87.75, 41.84); // Cook County, IL
  const panel = page.getByRole('region', { name: 'Selected counties' });
  await expect(panel.getByRole('article', { name: 'Cook, IL' })).toBeVisible();

  await clickLngLat(page, -95.4, 29.85); // Harris County, TX
  await expect(panel.getByRole('article')).toHaveCount(2);

  // The map outlines exactly the selected counties
  const outlined = () =>
    page.evaluate(() => JSON.stringify(window.__usMap?.getFilter('county-selected')));
  await expect.poll(outlined).toContain('17031');
  await expect.poll(outlined).toContain('48201');

  await panel.getByRole('button', { name: 'Compare' }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare counties' });
  await expect(dialog.getByRole('columnheader', { name: 'Harris, TX' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  await panel.getByRole('button', { name: 'Remove Cook, IL' }).click();
  await expect(panel.getByRole('article')).toHaveCount(1);

  // Clicking a selected county again unselects it
  await clickLngLat(page, -95.4, 29.85);
  await expect(panel).toBeHidden();
});

test('facility popups close with their × or a map click, without selecting a county', async ({ page }) => {
  await openLoadedMap(page);
  await page.getByLabel(LAYER_LABELS.tri, { exact: true }).check();
 
  // Zoom in on the Houston Ship Channel, where there are many facilities, and wait for it to draw
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const map = window.__usMap!;
        map.jumpTo({ center: [-95.1, 29.73], zoom: 10 });
        map.once('idle', () => resolve(null));
      })
  );
 
  // Screen positions: one facility, and one spot with no facility under it. Both must be
  // spots where the map itself is on top (not under the layer panel or near an edge).
  const spots = await page.evaluate(() => {
    const map = window.__usMap!;
    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const mapIsOnTop = (x: number, y: number) =>
      x > 20 && y > 20 && x < rect.width - 20 && y < rect.height - 20 &&
      document.elementFromPoint(rect.left + x, rect.top + y) === canvas;
    const facilityAt = (x: number, y: number) =>
      map.queryRenderedFeatures([x, y], { layers: ['tri-points'] }).length > 0;

    const facility = map
      .queryRenderedFeatures({ layers: ['tri-points'] })
      .map((f) => map.project((f.geometry as unknown as { coordinates: [number, number] }).coordinates))
      .find((p) => mapIsOnTop(p.x, p.y) && facilityAt(p.x, p.y))!;

    const grid = [0.5, 0.4, 0.6, 0.3, 0.7, 0.8].flatMap((fx) =>
      [0.75, 0.85, 0.65, 0.5].map((fy) => [fx * rect.width, fy * rect.height])
    );
    const empty = grid.find(([x, y]) => mapIsOnTop(x, y) && !facilityAt(x, y))!;

    return { facility: { x: facility.x, y: facility.y }, empty: { x: empty[0], y: empty[1] } };
  });
  const box = (await page.getByTestId('map').boundingBox())!;
  const click = (p: { x: number; y: number }) => page.mouse.click(box.x + p.x, box.y + p.y);
  const popup = page.locator('.maplibregl-popup');
 
  // Close with the × button
  await click(spots.facility);
  await expect(popup).toBeVisible();
  await popup.getByRole('button', { name: 'Close popup' }).click();
  await expect(popup).toBeHidden();
 
  // Close by clicking elsewhere: that click only closes the popup
  await click(spots.facility);
  await expect(popup).toBeVisible();
  await click(spots.empty);
  await expect(popup).toBeHidden();
  await expect(page.getByRole('region', { name: 'Selected counties' })).toBeHidden();
 
  // With no popup open, a click selects a county as usual
  await click(spots.empty);
  await expect(page.getByRole('region', { name: 'Selected counties' })).toBeVisible();
});

test('picking a different health measure recolors the map', async ({ page }) => {
  await openLoadedMap(page);
  await page.getByLabel(LAYER_LABELS.health, { exact: true }).check();

  const picker = page.getByLabel(MEASURE_PICKER_LABEL, { exact: true });
  const current = await picker.inputValue();
  const other = await picker.locator(`option:not([value="${current}"])`).first().getAttribute('value');
  expect(other, 'the picker should offer more than one measure').toBeTruthy();

  await picker.selectOption(other!);

  const fillColor = () =>
    page.evaluate(() => JSON.stringify(window.__usMap?.getPaintProperty('health-fill', 'fill-color')));
  await expect.poll(fillColor).toContain(`"${other}"`);
});
