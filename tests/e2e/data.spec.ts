import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { configureDevice, firstRun, scan, startSession, typePin } from './helpers';

// FAKE data only.
const SYSTEM_CSV = [
  'الباركود,اسم الموديل,الفرع,الكمية',
  '0000000001,DEMO SHIRT A,701,3',
  '0000000002,DEMO SHIRT B,701,2',
  '000000000004,DEMO ABAYA D,701,1',
  '0000000001,DEMO SHIRT A,706,99',
].join('\r\n');

async function openSettings(page: Page) {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('unlock-supervisor').click();
  await typePin(page, '2000');
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
  await expect(page.getByTestId('alert')).toHaveCount(0); // still accepted; compared later
  await expect(page.getByTestId('last-name')).toHaveText('0000000003TST00'); // no name: the code is the title
  await expect(page.getByTestId('total')).toHaveText('2');
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
  // The file saved automatically at close is the scan list (Excel).
  const closing = await closeSession(page);
  expect(closing.suggestedFilename()).toMatch(/^scans-701-men-\d{8}-\d{4}\.xlsx$/);
  const closed = XLSX.read(readFileSync((await closing.path())!));
  const closedRows = XLSX.utils.sheet_to_json<string[]>(closed.Sheets['المسحات']!, { header: 1, raw: false });
  expect(closedRows[0]).toEqual(['التاريخ والوقت', 'الباركود', 'الفرع', 'الموظف']);
  expect(closedRows.slice(1).map((r) => r.slice(1))).toEqual([
    ['0000000001', '701', 'Tester'],
    ['0000000001', '701', 'Tester'],
    ['000000000004', '701', 'Tester'],
    ['777', '701', 'Tester'],
  ]);
  expect(closedRows[1]![0]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  expect(closed.Sheets['المسحات']!['B4']).toMatchObject({ t: 's', v: '000000000004' }); // text, zeros kept

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
  expect(XLSX.utils.sheet_to_json(wb.Sheets['Unknown']!, { header: 1 })).toEqual([['Barcode', 'Qty']]); // 777 is a normal count line
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

test('differences table fits a phone screen (sign of the difference visible)', async ({ page }) => {
  await startSession(page);
  await scan(page, '0000000002');
  await closeSession(page);
  await openSettings(page);
  await page.getByTestId('open-reconcile').click();
  const wrap = page.locator('.table-wrap');
  const fits = await wrap.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  await expect(page.getByTestId('diff-table').locator('tbody tr').first()).toContainText('-12');
});

test('scan list: an undone scan is removed and the undo is not listed; export screen files match', async ({ page }) => {
  await startSession(page);
  await scan(page, '0000000001');
  await scan(page, '0000000002');
  await scan(page, '000000000004');
  await page.getByTestId('undo').click();
  await page.getByTestId('undo-yes').click();
  await expect(page.getByTestId('total')).toHaveText('2');
  const closing = await closeSession(page);
  const rows = XLSX.utils.sheet_to_json<string[]>(
    XLSX.read(readFileSync((await closing.path())!)).Sheets['المسحات']!,
    { header: 1, raw: false },
  );
  expect(rows.slice(1).map((r) => r[1])).toEqual(['0000000001', '0000000002']);

  await page.getByTestId('open-export').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('all-list-csv').click();
  const csv = readFileSync((await (await dl).path())!, 'utf8').replace(/^\uFEFF/, '').trim().split('\r\n');
  expect(csv[0]).toBe('التاريخ والوقت,الباركود,الفرع,الموظف');
  expect(csv).toHaveLength(3);
  expect(csv[1]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,0000000001,701,Tester$/);
  expect(csv[2]).toMatch(/,0000000002,701,Tester$/);
});

test.describe('times use the device time zone (Riyadh, UTC+3), not UTC', () => {
  test.use({ timezoneId: 'Asia/Riyadh' });

  // "YYYY-MM-DD HH" of now in Riyadh; also 2 minutes ago, in case an hour just changed.
  const riyadhHours = () =>
    [0, 2].map((minutesAgo) =>
      new Date(Date.now() - minutesAgo * 60_000).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 13),
    );
  const sheet = (file: string, name: string) =>
    XLSX.utils.sheet_to_json<string[]>(XLSX.read(readFileSync(file)).Sheets[name]!, { header: 1, raw: false });

  test('scan list, session cards and the count file all show Riyadh time', async ({ page }) => {
    await startSession(page);
    await scan(page, '0000000001');
    const closing = await closeSession(page);
    const listRows = sheet((await closing.path())!, 'المسحات');
    expect(riyadhHours()).toContain(String(listRows[1]![0]).slice(0, 13));

    await page.getByTestId('open-export').click();
    const card = page.getByTestId('session-card');
    const shown = (await card.innerText()).match(/\d{4}-\d\d-\d\d \d\d/)![0];
    expect(riyadhHours()).toContain(shown);

    const dl = page.waitForEvent('download');
    await page.getByTestId('all-xlsx').click();
    const file = (await (await dl).path())!;
    const started = String(sheet(file, 'Sessions')[1]![3]);
    expect(started).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/); // not an ISO "T…Z" text
    expect(riyadhHours()).toContain(started.slice(0, 13));
    const exportedAt = sheet(file, 'Check').find((r) => r[0] === 'Exported at')![1]!;
    expect(exportedAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(riyadhHours()).toContain(exportedAt.slice(0, 13));
  });
});

test('supervisor deletes one count: copy first, then confirmation, then gone; the others stay', async ({ page }) => {
  await startSession(page, { section: 0 }); // Men
  await scan(page, '0000000001');
  await scan(page, '0000000001');
  await closeSession(page);
  await startSession(page, { section: 1 }); // Women
  await scan(page, '0000000002');
  await closeSession(page);

  await openSettings(page);
  const rows = page.getByTestId('session-row');
  await expect(rows).toHaveCount(2); // newest first: Women, then Men
  await rows.nth(1).getByTestId('delete-count').click();
  const dialog = page.getByTestId('delete-dialog');
  await expect(dialog).toContainText('Men');
  await expect(dialog).toContainText('2 pieces');

  // Cancel changes nothing.
  await page.getByTestId('delete-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(2);

  // Nothing can be deleted before a copy is saved AND confirmed as received.
  await rows.nth(1).getByTestId('delete-count').click();
  await expect(page.getByTestId('delete-forever')).toHaveCount(0);
  const dl = page.waitForEvent('download');
  await page.getByTestId('delete-save-copy').click();
  const copy = await dl;
  expect(copy.suggestedFilename()).toMatch(/^backup-701-men-\d{8}-\d{4}\.csv$/);
  await expect(page.getByTestId('delete-forever')).toHaveCount(0);
  await page.getByTestId('delete-received').click();
  await page.getByTestId('delete-forever').click(); // the first tap only asks
  await expect(dialog).toContainText('cannot be undone');
  await expect(rows).toHaveCount(2);
  await page.getByTestId('delete-forever').click();

  await expect(page.getByTestId('deleted-notice')).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Women');

  // The other count is untouched.
  await page.getByTestId('back').click();
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('session-card')).toHaveCount(1);
  await expect(page.getByTestId('all-total')).toHaveText('1');
  await page.getByTestId('back').click();

  // The copy made before deleting brings the deleted count back (merge).
  await openSettings(page);
  await page.getByTestId('merge-file').setInputFiles({ name: 'copy.csv', mimeType: 'text/csv', buffer: readFileSync((await copy.path())!) });
  await expect(page.getByTestId('merge-msg')).toContainText('Added');
  await page.getByTestId('back').click();
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('all-total')).toHaveText('3');
});

test('ERP stock report (StockCode / CurrBalance / ...) imports with the right columns — FAKE data', async ({ page }) => {
  // Same shape as the company report: 15-digit codes stored as TEXT, numeric balances.
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['StockCode', 'ModelCode', 'currprice', 'CurrBalance', 'stockgroupname', 'LastTranIN_Date'],
    ['000000000000101', 'M-101', 6, 3, 'DEMO GROUP A', '19/Nov/2025'],
    ['000000000000202', 'M-202', 5, 326, 'DEMO GROUP B', '05/Sep/2026'],
  ]);
  ws['A2'] = { t: 's', v: '000000000000101', z: '@' };
  ws['A3'] = { t: 's', v: '000000000000202', z: '@' };
  XLSX.utils.book_append_sheet(wb, ws, 'Report1');

  await openSettings(page);
  await importSystemFile(page, 'Report.xlsx', Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })));
  // The guessed columns are the right ones: quantity is CurrBalance, not StockCode.
  await expect(page.getByTestId('col-barcode')).toHaveValue('0');
  await expect(page.getByTestId('col-name')).toHaveValue('1');
  await expect(page.getByTestId('col-qty')).toHaveValue('3');
  await expect(page.getByTestId('import-items')).toHaveText('2');
  const preview = page.getByTestId('import-preview');
  await expect(preview).toContainText('000000000000101');
  await expect(preview).toContainText('M-101');
  await expect(preview.locator('li').first().locator('strong')).toHaveText('3');
  await expect(page.getByTestId('import-huge')).toHaveCount(0);

  // Choosing the barcode column as the quantity is refused.
  await page.getByTestId('col-qty').selectOption('0');
  await expect(page.getByTestId('import-same')).toBeVisible();
  await expect(page.getByTestId('import-confirm')).toHaveCount(0);
  await page.getByTestId('col-qty').selectOption('3');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-done')).toBeVisible();

  // The loaded quantities are used in the differences report.
  await page.getByTestId('back').click();
  await startSession(page);
  for (let i = 0; i < 3; i++) await scan(page, '000000000000101');
  await closeSession(page);
  await openSettings(page);
  await page.getByTestId('open-reconcile').click();
  const rows = page.getByTestId('diff-table').locator('tbody tr');
  await expect(rows).toHaveCount(1); // 101 matches (3 = 3); 202 never scanned: -326
  await expect(rows.first()).toContainText('000000000000202');
  await expect(rows.first()).toContainText('-326');
});
