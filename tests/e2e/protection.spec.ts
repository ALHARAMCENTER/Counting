import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDevice, firstRun, scan, startSession, typePin } from './helpers';

const URL = 'http://localhost:4173/';

test.describe('with a configured device', () => {
  test.beforeEach(async ({ page }) => {
    await firstRun(page, 'en');
    await configureDevice(page);
  });

  test('undo: last scan only, with confirmation, as a reversal', async ({ page }) => {
    await startSession(page);
    await expect(page.getByTestId('undo')).toBeDisabled();
    await scan(page, '0000000001');
    await scan(page, '0000000002');
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('undo-dialog')).toContainText('DEMO SHIRT B');
    await page.getByTestId('undo-no').click();
    await expect(page.getByTestId('total')).toHaveText('2');

    await page.getByTestId('undo').click();
    await page.getByTestId('undo-yes').click();
    await expect(page.getByTestId('total')).toHaveText('1');
    await expect(page.getByTestId('undone')).toBeVisible();
    await expect(page.getByTestId('last-count')).toHaveText('×0');
    // Older scans cannot be undone.
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId('total')).toHaveText('1');
    await expect(page.getByTestId('undo')).toBeDisabled();
    await scan(page, '0000000002');
    await expect(page.getByTestId('undo')).toBeEnabled();
  });

  test('reader double read is ignored and reported in the summary', async ({ page }) => {
    await page.getByTestId('open-settings').click();
    await typePin(page, '2468');
    await page.getByTestId('tune-double').fill('300');
    await page.getByTestId('tune-save').click();
    await page.getByTestId('back').click();
    await startSession(page);
    // Both reads inside one browser task: a true double read, independent of machine speed.
    await page.evaluate(() => {
      const send = (k: string) =>
        document.querySelector('[data-scanner]')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      for (let i = 0; i < 2; i++) {
        for (const c of '0000000001') send(c);
        send('Enter');
      }
    });
    await expect(page.getByTestId('total')).toHaveText('1');
    await page.waitForTimeout(400);
    await scan(page, '0000000001');
    await expect(page.getByTestId('total')).toHaveText('2');
    await page.getByTestId('finish').click();
    await expect(page.getByTestId('summary')).toContainText('Double reads ignored');
  });

  test('same stand again: explicit warning and double confirmation', async ({ page }) => {
    await startSession(page, { stand: '7' });
    await scan(page, '0000000001');
    await page.getByTestId('finish').click();
    await page.getByTestId('confirm-close').click();

    await startSession(page, { stand: '8' }); // different stand: no warning
    await page.getByTestId('finish').click();
    await page.getByTestId('confirm-close').click();

    await page.getByTestId('start').click();
    await page.getByTestId('employee').fill('Other');
    await page.getByTestId('employee-next').click();
    await page.getByTestId('section-0').click();
    await page.getByTestId('key-7').click();
    await page.getByTestId('key-ok').click();
    const dup = page.getByTestId('dup-stand');
    await expect(dup).toBeVisible();
    await expect(dup).toContainText('Tester');
    await expect(dup).toContainText('1 pieces');

    await page.getByTestId('dup-continue').click();
    await expect(page.getByTestId('start-scanning')).toHaveCount(0); // first tap only asks
    await page.getByTestId('dup-continue').click();
    await expect(page.getByTestId('start-scanning')).toBeVisible();
  });

  test('closed session reopens only through the supervisor PIN', async ({ page }) => {
    await startSession(page, { stand: '5' });
    for (let i = 0; i < 3; i++) await scan(page, '0000000002');
    await page.getByTestId('finish').click();
    await page.getByTestId('confirm-close').click();

    await page.getByTestId('open-settings').click();
    await typePin(page, '2468');
    const row = page.getByTestId('session-row-SEC-A-5');
    await expect(row).toContainText('Closed');
    await row.getByTestId('reopen').click();
    await row.getByTestId('reopen-confirm').click();
    await expect(page.getByTestId('total')).toHaveText('3');
    await scan(page, '0000000002');
    await expect(page.getByTestId('total')).toHaveText('4');
  });

  test('low battery warning on the scan screen', async ({ page }) => {
    await page.addInitScript(() => {
      const b = Object.assign(new EventTarget(), { level: 0.15, charging: false });
      Object.defineProperty(navigator, 'getBattery', { value: () => Promise.resolve(b) });
    });
    await page.reload();
    await startSession(page);
    await expect(page.getByTestId('battery-warning')).toContainText('15%');
  });

  test('warns when the reader is silent for too long', async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await startSession(page);
    await scan(page, '0000000001');
    await expect(page.getByTestId('idle-warning')).toHaveCount(0);
    await page.clock.fastForward('06:00');
    await expect(page.getByTestId('idle-warning')).toBeVisible();
    await scan(page, '0000000001');
    await page.clock.fastForward('00:15');
    await expect(page.getByTestId('idle-warning')).toHaveCount(0);
  });
});

test('a second window of the app is refused', async ({ page, context }) => {
  await firstRun(page, 'en');
  const second = await context.newPage();
  await second.goto('./');
  await expect(second.getByTestId('other-tab')).toBeVisible();
  await second.close();
});

test('browser closed in the middle of a session: back to the same session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'counting-e2e-'));
  try {
    let ctx = await chromium.launchPersistentContext(dir, { baseURL: URL });
    let page = ctx.pages()[0] ?? (await ctx.newPage());
    await firstRun(page, 'ar');
    await configureDevice(page);
    await startSession(page);
    for (let i = 0; i < 12; i++) await scan(page, '0000000001');
    await expect(page.getByTestId('total')).toHaveText('12');
    await ctx.close(); // like swiping the app away / browser killed

    ctx = await chromium.launchPersistentContext(dir, { baseURL: URL });
    page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('./');
    await expect(page.getByTestId('total')).toHaveText('12');
    await expect(page.locator('.scan-top')).toContainText('SEC-A');
    await scan(page, '0000000001');
    await expect(page.getByTestId('total')).toHaveText('13');
    await ctx.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
