import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('real comparison, keyboard overlay and English report export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('link', { name: 'Compare your photos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compare photos', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Photo tips' }).click();
  await expect(page.getByText('The same detail', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText(/Synthetic sample:/)).toBeVisible();
  await page.getByRole('button', { name: 'Compare photos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Geometric alignment found' })).toBeVisible();
  await expect(page.getByText('Expert review needed')).toBeVisible();
  await page.getByRole('button', { name: 'Aligned overlay' }).click();
  const slider = page.getByRole('slider', { name: 'Comparison divider position' });
  await slider.fill('70');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('71');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const report = await download;
  expect(report.suggestedFilename()).toMatch(/^carprint-report-.*\.json$/);
  const contents = await readFile((await report.path())!, 'utf8');
  expect(contents).not.toMatch(/[А-Яа-яЁё]/);
  expect(JSON.parse(contents)).toMatchObject({ decision: 'REVIEW', geometry: 'MATCHED' });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.results')).toHaveCount(0);
  await expect(page.locator('.file-info')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compare photos', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('user uploads, invalid file recovery and removal', async ({ page }) => {
  await page.goto('/#workspace');
  const inputs = page.locator('input[type=file]');
  await inputs.nth(0).setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg></svg>') });
  await expect(page.getByRole('alert')).toContainText('Choose a JPG, PNG or WebP');
  await inputs.nth(0).setInputFiles('public/images/car-studio.png');
  await inputs.nth(1).setInputFiles('public/images/car-studio.png');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare photos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Geometric alignment found' })).toBeVisible();
  await expect(page.getByText(/same file was uploaded twice/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove reference photo' }).click();
  await expect(page.locator('.results')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compare photos', exact: true })).toBeDisabled();
});

test('server errors allow a successful retry without invented evidence', async ({ page }) => {
  await page.goto('/#workspace');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText(/Synthetic sample:/)).toBeVisible();
  await page.route('**/api/compare', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Service temporarily unavailable' }) }));
  await page.getByRole('button', { name: 'Compare photos', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Service temporarily unavailable');
  await expect(page.locator('.results')).toHaveCount(0);
  await page.unroute('**/api/compare');
  await page.getByRole('button', { name: 'Compare photos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Geometric alignment found' })).toBeVisible();
});

test('static hosting fallback does not masquerade as a valid sample', async ({ page }) => {
  await page.goto('/#workspace');
  await page.route('**/api/example/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Static fallback</html>' }));
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByRole('alert')).toContainText('The sample could not be loaded');
  await expect(page.getByRole('button', { name: 'Compare photos', exact: true })).toBeDisabled();
  await expect(page.locator('.has-photo')).toHaveCount(0);
});

test('mobile navigation, FAQ, English content and responsive layouts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'How it works' }).click();
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByText('Does it automatically detect damage?', { exact: true }).click();
  await expect(page.getByText(/Not in this version/)).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/[А-Яа-яЁё]/);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByRole('link', { name: 'Back to top' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
