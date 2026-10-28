import type { Page } from '@playwright/test';

export async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.getByTestId(`key-${d}`).click();
  await page.getByTestId('key-ok').click();
}

/** Language → PIN (twice) → home. */
export async function firstRun(page: Page, lang: 'ar' | 'en' | 'ur', pin = '2468') {
  await page.goto('./');
  await page.getByTestId(`lang-${lang}`).click();
  await typePin(page, pin);
  await typePin(page, pin);
  await page.getByTestId('start').waitFor();
}

/**
 * Supervisor config: fake branch, 20 stands, demo catalogue.
 * The double-read guard is off by default because tests type the same code
 * back to back at machine speed; tests of the guard turn it on.
 */
export async function configureDevice(page: Page, { pin = '2468', doubleReadMs = 0 } = {}) {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('unlock-supervisor').click();
  await typePin(page, pin);
  await page.getByTestId('setup-branch').fill('BR-TEST');
  await page.getByTestId('setup-max-stand').fill('20');
  await page.getByTestId('setup-save').click();
  await page.getByTestId('sim-toggle').click();
  await page.getByTestId('load-demo').click();
  await page.getByTestId('tune-double').fill(String(doubleReadMs));
  await page.getByTestId('tune-save').click();
  await page.getByTestId('back').click();
}

export async function startSession(page: Page, { employee = 'Tester', section = 0, stand = '7' } = {}) {
  await page.getByTestId('start').click();
  await page.getByTestId('employee').fill(employee);
  await page.getByTestId('employee-next').click();
  await page.getByTestId(`section-${section}`).click();
  for (const d of stand) await page.getByTestId(`key-${d}`).click();
  await page.getByTestId('key-ok').click();
  await page.getByTestId('start-scanning').click();
  await page.getByTestId('total').waitFor();
}

/** Emulates the keyboard-wedge reader: fast key presses, then Enter. */
export async function scan(page: Page, barcode: string, delay = 2) {
  await page.keyboard.type(barcode, { delay });
  await page.keyboard.press('Enter');
}
