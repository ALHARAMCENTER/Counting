import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { configureDevice, firstRun, scan, startSession, typePin } from './helpers';

// FAKE data only.
const SYSTEM_CSV = [
  'الباركود,اسم الموديل,الفرع,الكمية',
  '0000000001,DEMO SHIRT A,BR-TEST,3',
  '0000000002,DEMO SHIRT B,BR-TEST,2',
  '000000000004,DEMO ABAYA D,BR-TEST,1',
  '0000000001,DEMO SHIRT A,BR-OTHER,99',
].join('\r\n');

async function openSettings(page: Page) {
  await page.getByTestId('open-settings').click();
  await typePin(page, '2468');
}

async function importSystemFile(page: Page, name: string, content: string | Buffer) {
  await page.getByTestId('import-file').setInputFiles({
    name,
    mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream',
    buffer: typeof content === 'string' ? Buffer.from('﻿' + content, 'utf8') : content,
  });
}

async function closeSession(page: Page) {
  await page.getByTestId('finish').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('confirm-close').click();
  await page.getByTestId('closed-notice').waitFor();
  return download;
}

async function downloadText(p: Promise<import('@playwright/test').Download>) {
  const d = await p;
  return { name: d.suggestedFilename(), text: readFileSync((await d.path())!, 'utf8') };
}

test.beforeEach(async ({ page }) => {
  await firstRun(page, 'en');
  await configureDevice(page);
});

test('system CSV import: Arabic headers guessed, branch filtered, leading zeros kept', async ({ page }) => {
  await openSettings(page);
  await importSystemFile(page, 'system.csv', SYSTEM_CSV);
  await expect(page.getByTestId('import-items')).toHaveText('3');
  await expect(page.getByTestId('import-stats')).toContainText('Rows of other branches');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-done')).toContainText('3');
  await page.getByTestId('back').click();

  await startSession(page);
  await scan(page, '000000000004');
  await expect(page.getByTestId('last-name')).toHaveText('DEMO ABAYA D');
  await scan(page, '0000000003TST00'); // was in demo catalogue, not in the imported file
  await expect(page.getByTestId('alert')).toBeVisible();
});

test('a file damaged by Excel (scientific notation) is refused', async ({ page }) => {
  await openSettings(page);
  await importSystemFile(page, 'bad.csv', 'barcode,qty\r\n1.23457E+12,3\r\n0000000001,1');
  await expect(page.getByTestId('import-sci')).toContainText('2');
  await expect(page.getByTestId('import-confirm')).toHaveCount(0);
});

test('system XLSX import with text barcodes', async ({ page }) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Barcode', 'Name', 'Qty'],
    ['000555', 'DEMO X', 4],
  ]);
  ws['A2'] = { t: 's', v: '000555', z: '@' };
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  await openSettings(page);
  await importSystemFile(page, 'system.xlsx', Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })));
  await expect(page.getByTestId('import-items')).toHaveText('1');
  await page.getByTestId('import-confirm').click();
  await page.getByTestId('back').click();
  await startSession(page);
  await scan(page, '000555');
  await expect(page.getByTestId('last-name')).toHaveText('DEMO X');
});

test('auto backup on close, exports match the on-screen total and check code', async ({ page }) => {
  await startSession(page);
  for (const b of ['0000000001', '0000000001', '000000000004', '777']) await scan(page, b);
  await page.getByTestId('alert-continue').click();
  const backup = await downloadText(closeSession(page));
  expect(backup.name).toMatch(/^backup-BR-TEST-SEC-A-7-.*\.csv$/);
  expect(backup.text).toContain('#COUNTING-BACKUP-V1');

  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('all-total')).toHaveText('4');
  const shown = await page.getByTestId('all-checksum').innerText();

  const csv = await downloadText((async () => {
    const d = page.waitForEvent('download');
    await page.getByTestId('all-csv').click();
    return d;
  })());
  const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
  expect(lines).toEqual(['Barcode,Qty', '000000000004,1', '0000000001,2', '777,1', `#TOTAL,4,#CHECKSUM,${shown}`]);

  const dl = page.waitForEvent('download');
  await page.getByTestId('all-xlsx').click();
  const wb = XLSX.read(readFileSync((await (await dl).path())!));
  const count = wb.Sheets['Count']!;
  expect(count['A2']).toMatchObject({ t: 's', v: '000000000004' });
  expect(count['B2']).toMatchObject({ t: 'n', v: 1 });
  expect(XLSX.utils.sheet_to_json(wb.Sheets['Unknown']!, { header: 1 })).toEqual([['Barcode', 'Qty'], ['777', 1]]);
  const check = XLSX.utils.sheet_to_json<[string, string | number]>(wb.Sheets['Check']!, { header: 1 });
  expect(check).toContainEqual(['Checksum', shown]);
  expect(check).toContainEqual(['Total pieces', 4]);
});

test('reconciliation: differences only, largest first, tolerance, export', async ({ page }) => {
  // Demo catalogue system stock: 0000000001=12, 0000000002=5, 0000000003TST00=7, 000000000004=3, 0000000005TST00=0
  await startSession(page);
  for (let i = 0; i < 12; i++) await scan(page, '0000000001'); // exact
  await scan(page, '0000000002'); // 1 of 5 → -4
  for (let i = 0; i < 5; i++) await scan(page, '000000000004'); // 5 of 3 → +2
  await scan(page, '0000000005TST00'); // 1 of 0 → +1
  await closeSession(page);

  await openSettings(page);
  await page.getByTestId('open-reconcile').click();
  const rows = page.getByTestId('diff-table').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('0000000003TST00'); // -7, never scanned
  await expect(rows.nth(0)).toContainText('-7');
  await expect(rows.nth(1)).toContainText('-4');
  await expect(rows.nth(2)).toContainText('+2');
  await expect(rows.nth(3)).toContainText('+1');

  await page.getByTestId('tolerance').fill('2');
  await expect(rows).toHaveCount(2);

  const dl = page.waitForEvent('download');
  await page.getByTestId('diff-xlsx').click();
  const wb = XLSX.read(readFileSync((await (await dl).path())!));
  const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Differences']!, { header: 1 });
  expect(data[1]).toEqual(['0000000003TST00', 'DEMO DRESS C', 7, 0, -7, 'yes']);
});

test('merge from another device: added once, never twice', async ({ page, browser }) => {
  await startSession(page);
  for (let i = 0; i < 3; i++) await scan(page, '0000000002');
  await closeSession(page);
  await page.getByTestId('open-export').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('backup-all').click();
  const file = (await (await dl).path())!;

  // A second, empty device.
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await firstRun(p2, 'en');
  await configureDevice(p2);
  await openSettings(p2);
  const upload = { name: 'backup.csv', mimeType: 'text/csv', buffer: readFileSync(file) };
  await p2.getByTestId('merge-file').setInputFiles(upload);
  await expect(p2.getByTestId('merge-msg')).toContainText('Added 6 rows. 0 were already here.');
  await p2.getByTestId('merge-file').setInputFiles([]);
  await p2.getByTestId('merge-file').setInputFiles(upload);
  await expect(p2.getByTestId('merge-msg')).toContainText('Added 0 rows. 6 were already here.');
  await p2.getByTestId('back').click();
  await p2.getByTestId('open-export').click();
  await expect(p2.getByTestId('all-total')).toHaveText('3');

  // A changed file is refused.
  await p2.getByTestId('back').click();
  await openSettings(p2);
  const tampered = readFileSync(file, 'utf8').replace('0000000002', '0000000009');
  await p2.getByTestId('merge-file').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from(tampered) });
  await expect(p2.getByTestId('merge-msg')).toContainText('Not a valid backup file');
  await other.close();
});

test('wipe needs a confirmed full backup; keeps language and PIN', async ({ page }) => {
  await startSession(page);
  await scan(page, '0000000001');
  await closeSession(page);

  await openSettings(page);
  await expect(page.getByTestId('wipe')).toHaveCount(0);
  await page.getByTestId('back').click();
  await page.getByTestId('open-export').click();
  await page.getByTestId('backup-all').click();
  await page.getByTestId('export-done').waitFor();
  await page.getByTestId('back').click();

  await openSettings(page);
  await expect(page.getByTestId('wipe')).toHaveCount(0);
  await page.getByTestId('wipe-confirm-received').click();
  await page.getByTestId('wipe').click(); // first tap asks
  await expect(page.getByTestId('wipe-card')).toContainText('cannot be undone');
  await page.getByTestId('wipe').click();
  await page.getByTestId('start').waitFor();
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-screen')).toContainText('No counts yet');
  await page.getByTestId('back').click();
  await openSettings(page); // PIN still works
  await expect(page.getByTestId('set-lang-en')).toBeVisible();
});
