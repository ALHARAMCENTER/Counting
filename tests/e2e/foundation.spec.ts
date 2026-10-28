import { expect, test } from '@playwright/test';
import { firstRun, typePin } from './helpers';

const SHOTS = 'test-results/screens';

for (const [lang, dir] of [
  ['ar', 'rtl'],
  ['en', 'ltr'],
  ['ur', 'rtl'],
] as const) {
  test(`first run in ${lang}: direction, Latin digits, PIN, settings`, async ({ page }) => {
    await page.goto('./');
    await page.screenshot({ path: `${SHOTS}/${lang}-0-language.png` });
    await firstRun(page, lang);

    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await page.screenshot({ path: `${SHOTS}/${lang}-1-home.png` });

    // Settings open without the PIN; supervisor settings need it.
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('set-lang-en')).toBeVisible();
    await expect(page.getByTestId('setup-branch')).toHaveCount(0);
    await page.getByTestId('unlock-supervisor').click();
    await typePin(page, '1111');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('setup-branch')).toHaveCount(0);
    await typePin(page, '2000');
    await expect(page.getByTestId('setup-branch')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${lang}-2-settings.png` });

    // No Arabic-Indic digits anywhere on screen.
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/[٠-٩۰-۹]/);
  });
}

test('language and PIN survive a reload; language switch flips direction', async ({ page }) => {
  await firstRun(page, 'en');
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.getByTestId('open-settings').click();

  await page.getByTestId('unlock-supervisor').click();
  await typePin(page, '2000');
  await page.getByTestId('set-lang-ar').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});

test('works offline after the first visit (service worker)', async ({ page, context }) => {
  await firstRun(page, 'en');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the page is controlled by the service worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
  await context.setOffline(false);
});

test('no request leaves the origin', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4173/')) external.push(r.url());
  });
  await firstRun(page, 'ur');
  await page.getByTestId('open-settings').click();
  expect(external).toEqual([]);
});
