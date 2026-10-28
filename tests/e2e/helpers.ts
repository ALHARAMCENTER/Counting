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
