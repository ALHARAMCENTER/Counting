import { expect, test } from '@playwright/test';
import { configureDevice, firstRun, scan, startSession } from './helpers';

// Visual check of the worker screens in the three languages (screenshots are
// written to test-results/screens for review) plus a digits/direction check.
for (const [lang, dir] of [
  ['ar', 'rtl'],
  ['en', 'ltr'],
  ['ur', 'rtl'],
] as const) {
  test(`worker screens in ${lang}`, async ({ page }) => {
    await firstRun(page, lang);
    await configureDevice(page);
    await startSession(page, { employee: 'Tester', stand: '7' });
    await scan(page, '0000000003TST00');
    await scan(page, '0000000003TST00');
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    await expect(page.getByTestId('last-count')).toHaveText('×2');
    await page.screenshot({ path: `test-results/screens/${lang}-3-scan.png` });
    await scan(page, '123456789');
    await page.screenshot({ path: `test-results/screens/${lang}-4-unknown.png` });
    await page.getByTestId('alert-continue').click();
    await page.getByTestId('finish').click();
    await page.screenshot({ path: `test-results/screens/${lang}-5-summary.png` });
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/[٠-٩۰-۹]/);
  });
}

for (const [lang, dir] of [
  ['ar', 'rtl'],
  ['en', 'ltr'],
  ['ur', 'rtl'],
] as const) {
  test(`supervisor screens in ${lang}`, async ({ page }) => {
    await firstRun(page, lang);
    await configureDevice(page);
    await page.getByTestId('open-settings').click();
    await page.getByTestId('open-help').click();
    await expect(page.getByTestId('help')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    await page.screenshot({ path: `test-results/screens/${lang}-6-help.png`, fullPage: true });
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
    await page.getByTestId('back').click();
    await page.getByTestId('open-reconcile').click();
    await page.screenshot({ path: `test-results/screens/${lang}-7-reconcile.png`, fullPage: true });
  });
}
