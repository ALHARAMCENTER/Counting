import { expect, test } from '@playwright/test';
import { configureDevice, firstRun, scan, startSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await firstRun(page, 'en');
  await configureDevice(page);
});

test('start flow shows branch and section on the scan screen (no stand)', async ({ page }) => {
  await startSession(page, { section: 1, branch: '706' });
  const top = page.locator('.scan-top');
  await expect(top).toContainText('706');
  await expect(top).toContainText('Women');
  await expect(top).not.toContainText('Stand');
  await expect(page.getByTestId('total')).toHaveText('0');
});

test('the branch used last is highlighted next time', async ({ page }) => {
  await startSession(page, { branch: '707' });
  await page.getByTestId('finish').click();
  await page.getByTestId('confirm-close').click();
  await page.getByTestId('start').click();
  await page.getByTestId('employee-next').click();
  await expect(page.getByTestId('branch-707')).toHaveClass(/btn-primary/);
  await expect(page.getByTestId('branch-701')).not.toHaveClass(/btn-primary/);
});

test('the last name is pre-filled next time', async ({ page }) => {
  await startSession(page, { employee: 'Tester One' });
  await page.getByTestId('finish').click();
  await page.getByTestId('confirm-close').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('employee')).toHaveValue('Tester One');
});

test('200 fast reader scans: none lost, counts right, leading zeros kept', async ({ page }) => {
  await startSession(page);
  for (let i = 0; i < 200; i++) await scan(page, i % 4 === 0 ? '000000000004' : '0000000001', 0);
  await expect(page.getByTestId('total')).toHaveText('200');
  // Last scan (i=199) is DEMO SHIRT A, scanned 150 times.
  await expect(page.getByTestId('last-name')).toHaveText('DEMO SHIRT A');
  await expect(page.getByTestId('last-count')).toHaveText('×150');
  await scan(page, '000000000004');
  await expect(page.getByTestId('last-barcode')).toHaveText('000000000004');
  await expect(page.getByTestId('last-count')).toHaveText('×51');
});

test('input without Enter is not counted; lower-case and spaces are cleaned', async ({ page }) => {
  await startSession(page);
  await page.keyboard.type('0000000002');
  await expect(page.getByTestId('total')).toHaveText('0');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('total')).toHaveText('1');
  await scan(page, ' 0000000003tst00 ');
  await expect(page.getByTestId('last-name')).toHaveText('DEMO DRESS C');
});

test('focus comes back after touching the screen', async ({ page }) => {
  await startSession(page);
  await page.getByTestId('last').click();
  await page.locator('.total').click();
  await scan(page, '0000000001');
  await expect(page.getByTestId('total')).toHaveText('1');
  await expect(page.getByTestId('scanner-input')).toBeFocused();
});

test('unknown barcode: red screen, recorded, needs a tap to continue', async ({ page }) => {
  await startSession(page);
  await scan(page, '123456789');
  const alert = page.getByTestId('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('123456789');
  await expect(page.getByTestId('total')).toHaveText('1');
  // Keeps scanning while the alert is up: saved, alert stays.
  await scan(page, '0000000001');
  await expect(alert).toContainText('1 more pieces were saved');
  await page.getByTestId('alert-continue').click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByTestId('total')).toHaveText('2');
});

test('Arabic keyboard layout: the reader\'s keys are read correctly anyway', async ({ page }) => {
  await startSession(page);
  // What an iPhone/Android with an ARABIC hardware layout produces for the
  // keys of the code 0000000003TST00: Arabic characters, but physical key codes.
  await page.evaluate(() => {
    const send = (key: string, code: string, shiftKey = false) =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey, bubbles: true, cancelable: true }));
    for (let i = 0; i < 9; i++) send('٠', 'Digit0'); // Arabic-Indic digit zero
    send('٣', 'Digit3');
    send('ف', 'KeyT', true);
    send('س', 'KeyS', true);
    send('ف', 'KeyT', true);
    send('٠', 'Digit0');
    send('٠', 'Digit0');
    send('Enter', 'Enter');
  });
  await expect(page.getByTestId('alert')).toHaveCount(0);
  await expect(page.getByTestId('last-barcode')).toHaveText('0000000003TST00');
  await expect(page.getByTestId('last-name')).toHaveText('DEMO DRESS C');
});

test('Arabic characters without key codes (input method) still give the specific red screen', async ({ page }) => {
  await startSession(page);
  await scan(page, 'ثثث');
  await expect(page.getByTestId('alert')).toContainText('Keyboard language is wrong');
});

test('finish: summary, back to scanning, then confirm close', async ({ page }) => {
  await startSession(page);
  await scan(page, '0000000001');
  await scan(page, '0000000001');
  await scan(page, '0000000002');
  await scan(page, '555');
  await page.getByTestId('alert-continue').click();

  await page.getByTestId('finish').click();
  await expect(page.getByTestId('sum-pieces')).toHaveText('4');
  await expect(page.getByTestId('sum-models')).toHaveText('3');
  await expect(page.getByTestId('sum-unknown')).toHaveText('1');

  await page.getByTestId('back-to-scan').click();
  await scan(page, '0000000002');
  await expect(page.getByTestId('total')).toHaveText('5');

  await page.getByTestId('finish').click();
  await expect(page.getByTestId('sum-pieces')).toHaveText('5');
  await page.getByTestId('confirm-close').click();
  await expect(page.getByTestId('closed-notice')).toBeVisible();

  // Scanning on the home screen does nothing.
  await scan(page, '0000000001');
  await expect(page.getByTestId('start')).toBeVisible();
});

test('reload mid-session returns to the same session and count', async ({ page }) => {
  await startSession(page);
  for (let i = 0; i < 7; i++) await scan(page, '0000000002');
  await expect(page.getByTestId('total')).toHaveText('7');
  await page.reload();
  await expect(page.getByTestId('total')).toHaveText('7');
  await expect(page.getByTestId('last-count')).toHaveText('×7');
  await scan(page, '0000000002');
  await expect(page.getByTestId('total')).toHaveText('8');
});

test('reload on the summary screen returns to the summary', async ({ page }) => {
  await startSession(page);
  await scan(page, '0000000001');
  await page.getByTestId('finish').click();
  await page.getByTestId('summary').waitFor();
  await page.reload();
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('sum-pieces')).toHaveText('1');
});

test('simulator types through the real input path', async ({ page }) => {
  await startSession(page);
  await page.getByTestId('simulator').getByRole('button', { name: '0000000003TST00' }).click();
  await expect(page.getByTestId('last-name')).toHaveText('DEMO DRESS C');
  await expect(page.getByTestId('total')).toHaveText('1');
});

test('a scan on the summary or home screen is refused loudly, not saved', async ({ page }) => {
  await startSession(page);
  await scan(page, '0000000001');
  await page.getByTestId('finish').click();
  await page.getByTestId('summary').waitFor();
  await scan(page, '0000000001');
  await expect(page.getByTestId('not-saved')).toBeVisible();
  await expect(page.getByTestId('sum-pieces')).toHaveText('1');
  await page.getByTestId('confirm-close').click();
  await page.getByTestId('closed-notice').waitFor();
  await scan(page, '0000000001');
  await expect(page.getByTestId('not-saved')).toBeVisible();
});

test('a scan immediately after tapping a button keeps every character', async ({ page }) => {
  await startSession(page);
  await page.getByTestId('finish').click();
  await page.getByTestId('back-to-scan').click();
  await scan(page, '0000000002', 0); // no pause at all after the tap
  await expect(page.getByTestId('last-barcode')).toHaveText('0000000002');
  await page.getByTestId('last').click();
  await scan(page, '0000000002', 0);
  await expect(page.getByTestId('last-count')).toHaveText('×2');
});

test('scanning while the session is still opening: every character kept', async ({ page }) => {
  await page.getByTestId('start').click();
  await page.getByTestId('employee').fill('Tester');
  await page.getByTestId('employee-next').click();
  await page.getByTestId('branch-701').click();
  // Tap the section and, in the same instant, the first characters of a scan
  // arrive (before the scan screen exists). The rest arrives after it appears.
  await page.evaluate(() => {
    (document.querySelector('[data-testid="section-0"]') as HTMLButtonElement).click();
    for (const c of '000') document.body.dispatchEvent(new KeyboardEvent('keydown', { key: c, bubbles: true }));
  });
  await page.getByTestId('total').waitFor();
  await page.keyboard.type('000000004'); // '000' + '000000004' = 000000000004
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('last-barcode')).toHaveText('000000000004');
  await expect(page.getByTestId('total')).toHaveText('1');
  // A whole scan sent while the session opens is kept too.
  await page.getByTestId('finish').click();
  await page.getByTestId('confirm-close').click();
  await page.getByTestId('start').click();
  await page.getByTestId('employee').fill('Tester');
  await page.getByTestId('employee-next').click();
  await page.getByTestId('branch-701').click();
  await page.evaluate(() => {
    (document.querySelector('[data-testid="section-0"]') as HTMLButtonElement).click();
    for (const c of '0000000002') document.body.dispatchEvent(new KeyboardEvent('keydown', { key: c, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await expect(page.getByTestId('last-name')).toHaveText('DEMO SHIRT B');
  await expect(page.getByTestId('total')).toHaveText('1');
});
