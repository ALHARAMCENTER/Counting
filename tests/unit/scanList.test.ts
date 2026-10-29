import { describe, expect, it } from 'vitest';
import { SCAN_LIST_HEADER, buildScanList, formatLocalTime } from '../../src/io/scanList';
import type { ScanEvent, Session } from '../../src/db/types';
import type { SessionWithLog } from '../../src/io/countExport';

let n = 0;
const session = (over: Partial<Session> = {}): Session => ({
  id: `s${++n}`,
  deviceId: 'd',
  branch: 'BR-TEST',
  section: 'men',
  stand: 1,
  employee: 'Tester',
  createdAt: '2026-10-29T09:00:00.000Z',
  ...over,
});
const ev = (sessionId: string, type: ScanEvent['type'], barcode: string, ts: string, reversesUuid?: string): ScanEvent => ({
  uuid: `u${++n}`,
  deviceId: 'd',
  sessionId,
  type,
  barcode,
  raw: barcode,
  ts,
  reversesUuid,
});
const item = (s: Session, events: ScanEvent[]): SessionWithLog => ({ session: s, state: 'closed', events });

describe('scan list', () => {
  it('has exactly the five columns asked for', () => {
    expect([...SCAN_LIST_HEADER]).toEqual(['التاريخ والوقت', 'الباركود', 'الفرع', 'الستاند', 'الموظف']);
  });

  it('one row per piece with time, barcode, branch, stand, employee', () => {
    const s = session({ stand: 7, employee: 'Ali' });
    const rows = buildScanList([item(s, [ev(s.id, 'scan', '000123', '2026-10-29T09:34:37.246Z')])], 180);
    expect(rows).toEqual([{ time: '2026-10-29 12:34:37', barcode: '000123', branch: 'BR-TEST', stand: 7, employee: 'Ali' }]);
  });

  it('a scan that was undone is removed, and the undo row is not listed', () => {
    const s = session();
    const a = ev(s.id, 'scan', 'A', '2026-10-29T09:00:01Z');
    const b = ev(s.id, 'scan', 'B', '2026-10-29T09:00:02Z');
    const c = ev(s.id, 'scan', 'B', '2026-10-29T09:00:03Z');
    const rows = buildScanList([item(s, [a, b, c, ev(s.id, 'reversal', 'B', '2026-10-29T09:00:04Z', c.uuid)])], 0);
    expect(rows.map((r) => [r.time.slice(-8), r.barcode])).toEqual([
      ['09:00:01', 'A'],
      ['09:00:02', 'B'],
    ]);
  });

  it('ignored double reads are not listed; unknown barcodes are (they are counted pieces)', () => {
    const s = session();
    const rows = buildScanList(
      [item(s, [ev(s.id, 'scan', 'A', '2026-10-29T09:00:01Z'), ev(s.id, 'ignored_duplicate', 'A', '2026-10-29T09:00:01Z'), ev(s.id, 'unknown', 'ZZ', '2026-10-29T09:00:05Z')])],
      0,
    );
    expect(rows.map((r) => r.barcode)).toEqual(['A', 'ZZ']);
  });

  it('several sessions are merged oldest first', () => {
    const s1 = session({ stand: 1 });
    const s2 = session({ stand: 2 });
    const rows = buildScanList(
      [item(s1, [ev(s1.id, 'scan', 'A', '2026-10-29T09:00:10Z')]), item(s2, [ev(s2.id, 'scan', 'B', '2026-10-29T09:00:05Z')])],
      0,
    );
    expect(rows.map((r) => [r.barcode, r.stand])).toEqual([
      ['B', 2],
      ['A', 1],
    ]);
  });

  it('formats local time with an explicit offset, across midnight', () => {
    expect(formatLocalTime('2026-10-29T22:30:05Z', 180)).toBe('2026-10-30 01:30:05');
    expect(formatLocalTime('2026-10-29T09:34:37.246Z', 0)).toBe('2026-10-29 09:34:37');
  });
});
