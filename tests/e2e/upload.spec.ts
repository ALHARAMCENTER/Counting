import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import { scan, typePin } from './helpers';

/**
 * "Send to system" against a simulated office computer: every ntfy.sh request
 * is answered here (nothing leaves the test). The fake office computer checks
 * the encrypted request and file exactly like steps/counting_upload.py.
 */
const PW = 'E2eTestSecret_0123456789';
const enc = new TextEncoder();
const subtle = webcrypto.subtle;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST' };

async function keyOf(scope: string) {
  const salt = createHash('sha256').update('alharam-count|' + scope).digest().subarray(0, 16);
  const base = await subtle.importKey('raw', enc.encode(PW), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const topic = 'alhc' + createHash('sha256').update('alharam-count-topic|' + PW).digest('hex').slice(0, 26);

interface Seen {
  previews: { branch: string; pieces: number; rows: string[][] }[];
  commits: string[];
}

/** The fake office computer. `mode` decides the preview answer. */
async function fakeOffice(page: Page, scope: string, mode: 'ok' | 'bad', queue = 0): Promise<Seen> {
  const key = await keyOf(scope);
  const seen: Seen = { previews: [], commits: [] };
  const files = new Map<string, Buffer>();
  // Each reply becomes visible at `at` (lets a test see queue positions one after another).
  const events: { data: string; at: number }[] = [];

  const reply = async (rid: string, body: unknown, delayMs = 0) => {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(rid) }, key, gzipSync(JSON.stringify(body))));
    const n = events.length + seen.previews.length * 100 + seen.commits.length * 1000;
    const name = `/file/${rid}-${n}.bin`;
    files.set(name, Buffer.concat([Buffer.from(iv), Buffer.from(ct)]));
    const after = events.length ? events[events.length - 1]!.at : 0;
    events.push({
      at: Math.max(after, Date.now()) + delayMs,
      data: JSON.stringify({ id: `ev${n}`, event: 'message', message: JSON.stringify({ id: rid }), attachment: { url: `https://ntfy.sh${name}` } }),
    });
  };

  await page.route('https://ntfy.sh/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: CORS });
    if (url.pathname.startsWith('/file/')) return route.fulfill({ status: 200, headers: CORS, body: files.get(url.pathname) ?? Buffer.alloc(0) });
    if (url.pathname === `/${topic}r/sse`) {
      const ev = events[0] && events[0].at <= Date.now() ? events.shift()!.data : '';
      return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'text/event-stream' }, body: `retry: 200\n${ev ? `data: ${ev}\n` : ''}\n` });
    }
    if (url.pathname !== `/${topic}q`) return route.fulfill({ status: 404, headers: CORS });

    const msg = JSON.parse(req.method() === 'PUT' ? req.headers()['message']! : req.postData()!);
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(msg.i, 'base64') }, key, Buffer.from(msg.c, 'base64'));
    const r = JSON.parse(new TextDecoder().decode(plain));
    expect(Math.abs(r.ts - Date.now() / 1000)).toBeLessThan(120);
    const rid = r.id + 'c';
    if (r.k === 'cprev') {
      expect(req.method()).toBe('PUT');
      const blob = req.postDataBuffer()!;
      const file = Buffer.from(
        await subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12), additionalData: enc.encode(r.id + 'f') }, key, blob.subarray(12)),
      );
      expect(createHash('sha256').update(file).digest('hex')).toBe(r.h);
      const wb = XLSX.read(file, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['المسحات']!, { header: 1, raw: false });
      expect(rows[0]).toEqual(['التاريخ والوقت', 'الباركود', 'الفرع', 'الموظف']);
      const data = rows.slice(1).filter((x) => x.length);
      seen.previews.push({ branch: r.b, pieces: data.length, rows: data });
      if (queue > 0) {
        // Other devices first: "n before you", then "running now", then the preview.
        await reply(rid, { ok: true, wait: queue });
        await reply(rid, { ok: true, wait: 0 }, 1500);
      }
      const per = new Map<string, number>();
      for (const x of data) per.set(x[1]!, (per.get(x[1]!) ?? 0) + 1);
      if (mode === 'bad') {
        await reply(rid, { ok: true, branch: r.b, msg: 'invalid codes', codes: 0, qty: 0, rows: [], bad: ['0000000001'], app: { pieces: data.length, codes: per.size }, mismatch: false, token: '', locked: true });
      } else {
        await reply(
          rid,
          {
            ok: true,
            branch: r.b,
            msg: 'preview ok',
            codes: per.size,
            qty: data.length,
            rows: [...per].map(([c, q]) => [c, 'M' + c.slice(-3), '0000 - DEMO', '000 - DEMO', '10.00', q]),
            bad: [],
            app: { pieces: data.length, codes: per.size },
            mismatch: false,
            token: 'ab'.repeat(12),
            locked: true,
            overlap: queue > 0 ? { done: ['0000000002'], doneN: 1, pending: ['0000000003TST00'], pendingN: 1, test: true } : undefined,
          },
          queue > 0 ? 1500 : 0,
        );
      }
    } else {
      seen.commits.push(r.t);
      await reply(rid, { ok: true, dry: true, msg: 'dry run', branch: '701', pieces: 3, codes: 2 });
    }
    return route.fulfill({ status: 200, headers: CORS, body: '{}' });
  });
  return seen;
}

/** First run with a link in the address: language → home (no PIN asked). */
async function openWithLink(page: Page, scope: string) {
  await page.goto(`./#c=${scope}-${PW}`);
  await page.getByTestId('lang-en').click();
  await page.getByTestId('start').waitFor();
}

async function demoCatalog(page: Page) {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('unlock-supervisor').click();
  await typePin(page, '2000');
  await page.getByTestId('sim-toggle').click();
  await page.getByTestId('load-demo').click();
  await page.getByTestId('tune-double').fill('0');
  await page.getByTestId('tune-save').click();
  await page.getByTestId('back').click();
}

async function countAndClose(page: Page, branch: string | null, codes: string[]) {
  await page.getByTestId('start').click();
  await page.getByTestId('employee').fill('Tester');
  await page.getByTestId('employee-next').click();
  if (branch) await page.getByTestId(`branch-${branch}`).click();
  await page.getByTestId('section-0').click();
  await page.getByTestId('total').waitFor();
  for (const c of codes) await scan(page, c);
  await page.getByTestId('finish').click();
  await page.getByTestId('confirm-close').click();
  await page.getByTestId('closed-notice').waitFor();
}

test('branch link: branch fixed, preview checked, approval needs a confirmation (test mode uploads nothing)', async ({ page }) => {
  const seen = await fakeOffice(page, '701', 'ok');
  await openWithLink(page, '701');
  // The secret is removed from the address bar and the device shows its branch.
  expect(page.url()).not.toContain('#c=');
  await expect(page.getByTestId('linked-branch')).toHaveText('Branch 701');
  await expect(page.getByTestId('link-saved')).toBeVisible();
  await demoCatalog(page);

  // No branch step: the worker cannot pick another branch.
  await page.getByTestId('start').click();
  await page.getByTestId('employee').fill('Tester');
  await page.getByTestId('employee-next').click();
  await expect(page.getByTestId('branch-706')).toHaveCount(0);
  await page.getByTestId('back').click();
  await page.getByTestId('back').click();
  await countAndClose(page, null, ['0000000001', '0000000001', '0000000002']);

  await page.getByTestId('open-upload').click();
  await expect(page.getByTestId('upload-pieces')).toHaveText('3');
  await page.getByTestId('upload-preview-btn').click();
  await expect(page.getByTestId('upload-match')).toBeVisible({ timeout: 30_000 });
  expect(seen.previews).toHaveLength(1);
  expect(seen.previews[0]!.branch).toBe('701');
  expect(seen.previews[0]!.pieces).toBe(3);
  expect(seen.previews[0]!.rows.every((r) => r[2] === '701')).toBe(true);
  await expect(page.getByTestId('erp-qty')).toHaveText('3');
  await expect(page.getByTestId('app-pieces')).toHaveText('3');
  await expect(page.getByTestId('upload-rows').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('upload-locked')).toBeVisible();

  // Approve → a confirmation; cancelling sends nothing.
  await page.getByTestId('upload-approve').click();
  await page.getByTestId('upload-confirm-no').click();
  expect(seen.commits).toHaveLength(0);
  await page.getByTestId('upload-approve').click();
  await page.getByTestId('upload-confirm-yes').click();
  await expect(page.getByTestId('upload-dry')).toBeVisible({ timeout: 30_000 });
  expect(seen.commits).toEqual(['ab'.repeat(12)]);
});

test('items unknown to the system: no approval possible', async ({ page }) => {
  await fakeOffice(page, '701', 'bad');
  await openWithLink(page, '701');
  await demoCatalog(page);
  await countAndClose(page, null, ['0000000001']);
  await page.getByTestId('open-upload').click();
  await page.getByTestId('upload-preview-btn').click();
  await expect(page.getByTestId('upload-bad')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('upload-approve')).toHaveCount(0);
});

test('supervisor link: branch is chosen; without a link there is no upload button', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('lang-en').click();
  await page.getByTestId('start').waitFor();
  await expect(page.getByTestId('open-upload')).toHaveCount(0);

  const seen = await fakeOffice(page, 'sup', 'ok');
  await page.goto(`./#c=sup-${PW}`);
  await page.reload(); // same page with a new # part: the link is read when the app starts
  await expect(page.getByTestId('linked-branch')).toHaveText('Supervisor (all branches)');
  await demoCatalog(page);
  await countAndClose(page, '803', ['0000000002']);
  await page.getByTestId('open-upload').click();
  await page.getByTestId('upload-branch-803').click();
  await page.getByTestId('upload-preview-btn').click();
  await expect(page.getByTestId('upload-match')).toBeVisible({ timeout: 30_000 });
  expect(seen.previews[0]!.branch).toBe('803');
});

test('several devices at once: place in the queue, then a warning for items also in another count', async ({ page }) => {
  await fakeOffice(page, '711', 'ok', 2);
  await openWithLink(page, '711');
  await demoCatalog(page);
  await countAndClose(page, null, ['0000000002', '0000000003TST00']);
  await page.getByTestId('open-upload').click();
  await page.getByTestId('upload-preview-btn').click();
  await expect(page.getByTestId('upload-queue')).toHaveAttribute('data-ahead', '2', { timeout: 15_000 });
  await expect(page.getByTestId('upload-queue')).toContainText('2 before you');
  await expect(page.getByTestId('upload-queue')).toHaveAttribute('data-ahead', '0', { timeout: 15_000 });
  await expect(page.getByTestId('upload-match')).toBeVisible({ timeout: 15_000 });
  // Same items in another count of this branch: the last upload replaces the earlier one.
  await expect(page.getByTestId('upload-overlap-done')).toContainText('1 items');
  await expect(page.getByTestId('upload-overlap-done')).toContainText('test approvals');
  await expect(page.getByTestId('upload-overlap-pending')).toContainText('The one uploaded last');
  await page.getByTestId('upload-overlap-done').locator('summary').click();
  await expect(page.getByTestId('upload-overlap-done')).toContainText('0000000002');
});
