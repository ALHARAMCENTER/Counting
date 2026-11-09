import { expect, test, type Page } from '@playwright/test';
import { firstRun, typePin } from './helpers';

// FAKE link and code only. The "page" is a stub served for that address.
const LINK = 'https://newsaleh.github.io/phone/fake-slug-123/';
const PASTED_PASSWORD = 'fake-password-0000'; // must never be kept

test.beforeEach(async ({ page }) => {
  await page.route('https://newsaleh.github.io/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>FAKE</title><input id="q"><p id="t">fake inquiry page</p>' }),
  );
  await firstRun(page, 'en');
});

async function supervisor(page: Page) {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('unlock-supervisor').click();
  await typePin(page, '2000');
}

test('workers never see it: not on the home screen, not in settings without the PIN', async ({ page }) => {
  await expect(page.getByTestId('inquiry-card')).toHaveCount(0);
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('inquiry-card')).toHaveCount(0);
  await expect(page.getByTestId('inquiry-open')).toHaveCount(0);
  await page.getByTestId('unlock-supervisor').click();
  await typePin(page, '2000');
  await expect(page.getByTestId('inquiry-card')).toBeVisible();
});

test('only the company page can be saved: other links are refused', async ({ page }) => {
  await supervisor(page);
  for (const bad of ['https://example.com/phone/fake-slug-123/', 'http://newsaleh.github.io/phone/x/', 'javascript:alert(1)', 'https://newsaleh.github.io/other/x/']) {
    await page.getByTestId('inquiry-link').fill(bad);
    await page.getByTestId('inquiry-save').click();
    await expect(page.getByTestId('inquiry-invalid')).toBeVisible();
  }
  await expect(page.getByTestId('inquiry-saved')).toHaveCount(0);
});

test('save, open inside the app, the link is not shown again, it survives a reload', async ({ page }) => {
  await supervisor(page);
  await page.getByTestId('inquiry-link').fill(LINK);
  await page.getByTestId('inquiry-save').click();
  await expect(page.getByTestId('inquiry-saved')).toBeVisible();
  const card = await page.getByTestId('inquiry-card').innerText();
  expect(card).not.toContain('fake-slug-123');
  expect(await page.getByTestId('inquiry-card').locator('input').count()).toBe(0); // nothing left to read back

  await page.getByTestId('inquiry-open').click();
  const frame = page.getByTestId('inquiry-frame');
  await expect(frame).toHaveAttribute('src', LINK);
  await expect(frame).toHaveAttribute('allow', /camera/);
  await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(page.frameLocator('[data-testid="inquiry-frame"]').locator('#t')).toHaveText('fake inquiry page');

  // Back to settings: still unlocked, no PIN again.
  await page.getByTestId('back').click();
  await expect(page.getByTestId('inquiry-card')).toBeVisible();

  // Kept on the device.
  await page.reload();
  await supervisor(page);
  await expect(page.getByTestId('inquiry-saved')).toBeVisible();
});

test('a password pasted after # is dropped: it is never stored or sent on', async ({ page }) => {
  await supervisor(page);
  await page.getByTestId('inquiry-link').fill(`${LINK}#${PASTED_PASSWORD}`);
  await page.getByTestId('inquiry-save').click();
  await page.getByTestId('inquiry-open').click();
  await expect(page.getByTestId('inquiry-frame')).toHaveAttribute('src', LINK);
  const stored = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('counting');
        open.onsuccess = () => {
          const all = open.result.transaction('settings').objectStore('settings').getAll();
          all.onsuccess = () => resolve(JSON.stringify(all.result));
        };
      }),
  );
  expect(stored).not.toContain(PASTED_PASSWORD);
});

test('removing the link removes the page', async ({ page }) => {
  await supervisor(page);
  await page.getByTestId('inquiry-link').fill(LINK);
  await page.getByTestId('inquiry-save').click();
  await page.getByTestId('inquiry-remove').click();
  await expect(page.getByTestId('inquiry-open')).toHaveCount(0);
  await expect(page.getByTestId('inquiry-link')).toBeVisible();
});

test('a scan that lands outside the page gives a hint, not an error', async ({ page }) => {
  await supervisor(page);
  await page.getByTestId('inquiry-link').fill(LINK);
  await page.getByTestId('inquiry-save').click();
  await page.getByTestId('inquiry-open').click();
  await page.getByTestId('inquiry-frame').waitFor();
  await page.evaluate(() => {
    for (const c of '12345') document.body.dispatchEvent(new KeyboardEvent('keydown', { key: c, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await expect(page.getByTestId('inquiry-hint')).toBeVisible();
});

test('a link that is not the allowed page is never framed, even if it got into storage', async ({ page }) => {
  await supervisor(page);
  await page.getByTestId('inquiry-link').fill(LINK);
  await page.getByTestId('inquiry-save').click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('counting');
        open.onsuccess = () => {
          const tx = open.result.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({ key: 'inquiryLink', value: 'https://example.com/phone/x/' });
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.getByTestId('inquiry-open').click();
  await expect(page.getByTestId('inquiry-frame')).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
});
