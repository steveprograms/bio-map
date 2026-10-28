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
