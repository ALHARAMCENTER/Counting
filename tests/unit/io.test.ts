import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { useFreshDB } from './helpers';
import { setSetting } from '../../src/db/settings';
import { appendSessionEvent, getSessionScans, openSession, sessionOverview } from '../../src/db/log';
import { replaceCatalog } from '../../src/db/catalog';
import { ScanController } from '../../src/scan/ScanController';
import { analyzeImport, guessColumns, type Table } from '../../src/io/catalogImport';
import { reconcile } from '../../src/domain/reconcile';
import { buildCountBundle } from '../../src/io/countExport';
import { backupToCsv, mergeBackup, parseBackup, readBackupData, BackupFormatError } from '../../src/io/backup';
import { buildXlsx, readXlsx } from '../../src/io/xlsx';
import { parseCsv } from '../../src/io/csv';
import { getDB } from '../../src/db/db';

const db = useFreshDB();
beforeEach(() => setSetting('deviceId', 'dev'));

const info = { deviceId: 'dev', branch: 'BR-TEST', section: 'SEC-A', stand: 1, employee: 'Tester' };

async function countedSession(lines: string[], close = true, stand = 1) {
  const s = await openSession({ ...info, stand });
  const c = await ScanController.load(s, 'dev');
  for (const l of lines) await c.handleLine(l);
  if (close) {
    await appendSessionEvent(s.id, 'review');
    await appendSessionEvent(s.id, 'close');
  }
  return { s, c };
}

describe('system file import analysis', () => {
  const table = (rows: string[][], numeric?: boolean[][]): Table => ({ rows, numeric });

  it('guesses columns from Arabic or English headers', () => {
    expect(guessColumns(['الباركود', 'اسم الموديل', 'الفرع', 'الكمية'])).toEqual({ barcode: 0, name: 1, qty: 3, branch: 2, branchValue: '' });
    expect(guessColumns(['Item', 'Barcode', 'Qty'])).toMatchObject({ barcode: 1, name: 0, qty: 2, branch: -1 });
  });

  it('keeps leading zeros and filters by branch', () => {
    const a = analyzeImport(
      table([
        ['barcode', 'name', 'branch', 'qty'],
        ['000123', 'DEMO A', 'BR-1', '5'],
        ['000123', 'DEMO A', 'BR-2', '9'],
        ['0000000003tst00', 'DEMO C', 'BR-1', '7'],
      ]),
      { barcode: 0, name: 1, branch: 2, qty: 3, branchValue: 'BR-1' },
    );
    expect(a.canImport).toBe(true);
    expect(a.skippedOtherBranch).toBe(1);
    expect(a.items).toEqual([
      { barcode: '000123', name: 'DEMO A', systemQty: 5 },
      { barcode: '0000000003TST00', name: 'DEMO C', systemQty: 7 },
    ]);
  });

  it('refuses a file where Excel turned barcodes into scientific notation', () => {
    const a = analyzeImport(
      table([
        ['barcode', 'qty'],
        ['1.23457E+12', '3'],
        ['000777', '1'],
      ]),
      { barcode: 0, name: -1, branch: -1, qty: 1, branchValue: '' },
    );
    expect(a.scientific).toEqual([2]);
    expect(a.canImport).toBe(false);
  });

  it('refuses non-integer quantities and reports the row', () => {
    const a = analyzeImport(table([['b', 'q'], ['001', '2.5'], ['002', 'x']]), { barcode: 0, name: -1, branch: -1, qty: 1, branchValue: '' });
    expect(a.badQty).toEqual([2, 3]);
    expect(a.canImport).toBe(false);
  });

  it('adds quantities of repeated barcodes and reports them', () => {
    const a = analyzeImport(table([['b', 'q'], ['001', '2'], ['001', '3']]), { barcode: 0, name: -1, branch: -1, qty: 1, branchValue: '' });
    expect(a.items).toEqual([{ barcode: '001', name: '', systemQty: 5 }]);
    expect(a.duplicates).toEqual(['001']);
  });

  it('flags numeric XLSX cells and refuses long ones that lost precision', () => {
    const a = analyzeImport(
      table(
        [['b', 'q'], ['123', '1'], ['12345678901234567000', '1']],
        [[false, false], [true, true], [true, true]],
      ),
      { barcode: 0, name: -1, branch: -1, qty: 1, branchValue: '' },
    );
    expect(a.numericCells).toEqual([2, 3]);
    expect(a.unsafeNumbers).toEqual([3]);
    expect(a.canImport).toBe(false);
  });
});

describe('reconcile', () => {
  const catalog = [
    { barcode: '001', name: 'A', systemQty: 10 },
    { barcode: '002', name: 'B', systemQty: 5 },
    { barcode: '003', name: 'C', systemQty: 2 },
    { barcode: '004', name: 'D', systemQty: 1 },
  ];
  const counted = new Map([
    ['001', 10],
    ['002', 2],
    ['004', 2],
    ['999', 4],
  ]);

  it('lists only differences, largest first, including never-scanned and unknown', () => {
    const r = reconcile(catalog, counted, 0);
    expect(r.rows.map((x) => [x.barcode, x.diff])).toEqual([
      ['999', 4],
      ['002', -3],
      ['003', -2],
      ['004', 1],
    ]);
    expect(r.systemTotal).toBe(18);
    expect(r.countedTotal).toBe(18);
    expect(r.rows[0]!.inSystem).toBe(false);
  });

  it('applies the accepted tolerance', () => {
    expect(reconcile(catalog, counted, 2).rows.map((x) => x.barcode)).toEqual(['999', '002']);
  });
});

describe('count bundle', () => {
  it('aggregates sessions, separates unknown and manual, same checksum for same data', async () => {
    await replaceCatalog([{ barcode: '0000000001', name: 'DEMO A' }]);
    await countedSession(['0000000001', '0000000001', 'ZZZ'], true, 1);
    await countedSession(['0000000001'], true, 2);
    const all = await sessionOverview();
    const items = await Promise.all(all.map(async (x) => ({ ...x, events: await getSessionScans(x.session.id) })));
    const b = await buildCountBundle(items);
    expect(b.count).toEqual([
      ['0000000001', 3],
      ['ZZZ', 1],
    ]);
    expect(b.unknown).toEqual([['ZZZ', 1]]);
    expect(b.totalPieces).toBe(4);
    const again = await buildCountBundle([...items].reverse());
    expect(again.checksum).toBe(b.checksum);
  });
});

describe('xlsx', () => {
  it('writes barcodes as text cells and reads them back unchanged', async () => {
    const codes = ['000123', '0000000003TST00', '12345678901234567890'];
    const data = await buildXlsx([{ name: 'Count', rows: [['Barcode', 'Qty'], ...codes.map((c) => [c, 1])], textColumns: [0] }]);
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets['Count']!;
    expect(ws['A2']).toMatchObject({ t: 's', v: '000123' });
    expect(ws['B2']).toMatchObject({ t: 'n', v: 1 });
    const t = await readXlsx(data);
    expect(t.rows.slice(1).map((r) => r[0])).toEqual(codes);
    expect(t.numeric![1]![0]).toBe(false);
  });

  it('reading a numeric cell keeps all digits up to 15 and flags it', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['b'], [123456789012]]), 'S');
    const t = await readXlsx(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
    expect(t.rows[1]![0]).toBe('123456789012');
    expect(t.numeric![1]![0]).toBe(true);
  });
});

describe('backup and merge', () => {
  it('round-trips the raw log and verifies its checksum', async () => {
    await countedSession(['000111', '000111', '000222']);
    const data = await readBackupData();
    const { csv } = await backupToCsv(data);
    const back = await parseBackup(csv);
    expect(back.events.map((e) => [e.uuid, e.barcode, e.type])).toEqual(data.events.map((e) => [e.uuid, e.barcode, e.type]));
    expect(back.sessions).toEqual(data.sessions);

    const tampered = csv.replace('000222', '000223');
    await expect(parseBackup(tampered)).rejects.toBeInstanceOf(BackupFormatError);
    await expect(parseBackup('barcode,qty\n1,2')).rejects.toBeInstanceOf(BackupFormatError);
  });

  it('merging the same backup twice never double counts', async () => {
    await countedSession(['A', 'B', 'B']);
    const { csv } = await backupToCsv(await readBackupData());
    const data = await parseBackup(csv);

    // Into an empty database (another device).
    db().close();
    const { CountingDB, setDB } = await import('../../src/db/db');
    const other = new CountingDB(`${db().name}-other`);
    setDB(other);
    const first = await mergeBackup(data);
    const second = await mergeBackup(data);
    expect(first.sessionsAdded).toBe(1);
    expect(first.rowsAdded).toBe(data.events.length + data.sessionEvents.length);
    expect(second.rowsAdded).toBe(0);
    const merged = await sessionOverview();
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ state: 'closed', pieces: 3 });
    other.close();
  });

  it('a merged open session from another device is never resumed here', async () => {
    const { findActiveSession } = await import('../../src/db/log');
    await mergeBackup({
      sessions: [{ id: 'x', deviceId: 'OTHER', branch: 'B', section: 'S', stand: 1, employee: 'E', createdAt: '2026-01-01T00:00:00Z' }],
      sessionEvents: [{ uuid: 'e1', seq: 1, sessionId: 'x', type: 'open', ts: '' }],
      events: [],
    });
    expect(await findActiveSession()).toBeNull();
  });
});

describe('wipe safety', () => {
  it('requires a confirmed full backup made after the last change', async () => {
    vi.stubGlobal('document', { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL() {} }));
    const { canWipe, exportBackup, confirmExport, wipeCountData } = await import('../../src/io/exporter');

    const { c } = await countedSession(['A'], false);
    expect((await canWipe()).ok).toBe(false);
    const b1 = await exportBackup();
    expect((await canWipe()).ok).toBe(false); // not confirmed
    await confirmExport(b1.id);
    expect((await canWipe()).ok).toBe(true);
    await c.handleLine('B'); // new data after the backup
    expect((await canWipe()).ok).toBe(false);
    await expect(wipeCountData()).rejects.toThrow();

    const b2 = await exportBackup();
    await confirmExport(b2.id);
    await setSetting('lang', 'ar');
    await wipeCountData();
    expect(await getDB().events.count()).toBe(0);
    expect(await getDB().sessions.count()).toBe(0);
    expect((await getDB().settings.get('lang'))?.value).toBe('ar'); // settings kept
    vi.unstubAllGlobals();
  });
});

describe('csv count file', () => {
  it('Barcode,Qty rows then the verification row', async () => {
    const { toCsv } = await import('../../src/io/csv');
    const { checkRow } = await import('../../src/io/countExport');
    await countedSession(['000123', '000123']);
    const all = await sessionOverview();
    const b = await buildCountBundle(await Promise.all(all.map(async (x) => ({ ...x, events: await getSessionScans(x.session.id) }))));
    const rows = parseCsv(toCsv([['Barcode', 'Qty'], ...b.count, checkRow(b)]).slice(1));
    expect(rows).toEqual([
      ['Barcode', 'Qty'],
      ['000123', '2'],
      ['#TOTAL', '2', '#CHECKSUM', b.checksum],
    ]);
  });
});
