import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { configureDevice, firstRun, scan, startSession } from './helpers';

// A new version is simulated by changing the served service worker file:
// the browser sees different bytes and installs it as an update.
const SW_FILE = 'dist/sw.js';
let original = '';

test.beforeAll(() => {
  original = readFileSync(SW_FILE, 'utf8');
});
test.afterEach(() => {
  writeFileSync(SW_FILE, original);
});

const publishNewVersion = () => writeFileSync(SW_FILE, `${original}\n// test update ${Date.now()}\n`);

/** Controlled by the service worker, like an installed app on its second launch. */
async function installed(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(() => {
    (window as unknown as { __marker: number }).__marker = 1; // lost on any reload
  });
}

const reloaded = (page: Page) =>
  page
    .evaluate(() => (window as unknown as { __marker?: number }).__marker)
    .then((m) => m !== 1)
    .catch(() => true); // page is navigating

const checkForUpdate = (page: Page) =>
  page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });

const updateIsWaiting = (page: Page) =>
  page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting);

test('idle on the home screen: a new version installs by itself', async ({ page }) => {
  await firstRun(page, 'en');
  await installed(page);

  publishNewVersion();
  await checkForUpdate(page);

  await expect.poll(() => reloaded(page), { timeout: 20_000 }).toBe(true);
  await expect(page.getByTestId('start')).toBeVisible();
  await expect.poll(() => updateIsWaiting(page)).toBe(false);
});

test('during a count the update waits; it installs after the count is closed, data intact', async ({ page }) => {
  await firstRun(page, 'en');
  await configureDevice(page);
  await installed(page);
  await startSession(page);
  for (let i = 0; i < 3; i++) await scan(page, '0000000002');

  publishNewVersion();
  await checkForUpdate(page);
  await expect.poll(() => updateIsWaiting(page)).toBe(true); // found, but not applied
  await page.waitForTimeout(4000);
  expect(await reloaded(page)).toBe(false);
  await expect(page.getByTestId('total')).toHaveText('3');
  await scan(page, '0000000002'); // scanning keeps working
  await expect(page.getByTestId('total')).toHaveText('4');

  await page.getByTestId('finish').click();
  await page.getByTestId('confirm-close').click();
  await page.getByTestId('closed-notice').waitFor();

  await expect.poll(() => reloaded(page), { timeout: 30_000 }).toBe(true);
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('all-total')).toHaveText('4');
});
