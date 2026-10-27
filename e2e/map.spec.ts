// End-to-end tests: run the real app in a real browser.
// These need an internet connection, since the base map comes from OpenFreeMap.
import { expect, test, type Page } from '@playwright/test';
import { DATA_SOURCES, LAYER_GROUPS, LAYER_LABELS, WORKER_URL, type LayerKey } from '../components/map/config';

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
    if (msg.type() === 'error' && /worker/i.test(msg.text())) problems.push(msg.text());
  });

  await openLoadedMap(page);

  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  expect(problems).toEqual([]);
});

test('data files and the MapLibre worker are served', async ({ request }) => {
  for (const url of [...Object.values(DATA_SOURCES), WORKER_URL]) {
    const response = await request.get(url);
    expect(response.ok(), `${url} returned ${response.status()}`).toBe(true);
  }
});

for (const key of Object.keys(LAYER_GROUPS) as LayerKey[]) {
  const label = LAYER_LABELS[key];

  test(`"${label}" checkbox shows and hides its map layers`, async ({ page }) => {
    await openLoadedMap(page);
    const checkbox = page.getByLabel(label);

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
