import { beforeEach, describe, expect, it } from 'vitest';
import { setSetting } from '../../src/db/settings';
import { useFreshDB } from './helpers';
import { appendScan, appendSessionEvent, findActiveSession, getSessionScans, getSessionState, openSession } from '../../src/db/log';
import { replaceCatalog } from '../../src/db/catalog';
import { ScanController } from '../../src/scan/ScanController';

const db = useFreshDB();
beforeEach(() => setSetting('deviceId', 'dev'));
const info = { deviceId: 'dev', branch: 'BR-TEST', section: 'SEC-A', stand: 3, employee: 'Tester' };

describe('session log', () => {
  it('opens, reviews, resumes and closes through appended events', async () => {
    const s = await openSession(info);
    expect(await getSessionState(s.id)).toBe('active');
    await appendSessionEvent(s.id, 'review');
    await appendSessionEvent(s.id, 'resume');
    await appendSessionEvent(s.id, 'review');
    await appendSessionEvent(s.id, 'close');
    expect(await getSessionState(s.id)).toBe('closed');
    expect(await db().sessionEvents.count()).toBe(5);
  });

  it('refuses an invalid transition without writing anything', async () => {
    const s = await openSession(info);
    await expect(appendSessionEvent(s.id, 'close')).rejects.toThrow();
    expect(await db().sessionEvents.count()).toBe(1);
  });

  it('refuses scans for a session that is not active', async () => {
    const s = await openSession(info);
    await appendSessionEvent(s.id, 'review');
    await expect(appendScan({ sessionId: s.id, deviceId: 'dev', type: 'scan', barcode: '1', raw: '1' })).rejects.toThrow();
    expect(await db().events.count()).toBe(0);
  });

  it('finds the open session after a restart', async () => {
    const a = await openSession(info);
    await appendSessionEvent(a.id, 'review');
    await appendSessionEvent(a.id, 'close');
    expect(await findActiveSession()).toBeNull();
    const b = await openSession(info);
    expect((await findActiveSession())?.session.id).toBe(b.id);
  });
});

describe('ScanController pipeline', () => {
  it('writes every scan, in order, even when lines arrive faster than writes', async () => {
    await replaceCatalog([
      { barcode: '0000000001', name: 'DEMO A' },
      { barcode: '0000000002', name: 'DEMO B' },
    ]);
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    const lines = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? '0000000002' : '0000000001'));
    // Fire all without awaiting: simulates a burst from the reader.
    lines.forEach((l) => void c.handleLine(l));
    await c.idle();

    const rows = await getSessionScans(s.id);
    expect(rows.map((r) => r.barcode)).toEqual(lines);
    expect(c.current.tally.total).toBe(100);
    expect(c.current.tally.byBarcode.get('0000000002')).toBe(34);
    // Line 99 is the last one: 99 % 3 === 0 → DEMO B.
    expect(c.current.last).toMatchObject({ barcode: '0000000002', name: 'DEMO B', countInSession: 34 });
  });

  it('records unknown barcodes (not ignored) and raises the red alert', async () => {
    await replaceCatalog([{ barcode: '0000000001', name: 'DEMO A' }]);
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    await c.handleLine('9999');
    expect(c.current.alert).toEqual({ kind: 'unknown', barcode: '9999' });
    expect(c.current.tally.total).toBe(1);
    expect((await getSessionScans(s.id))[0]!.type).toBe('unknown');

    // Scans during the alert are still saved, and counted on the alert screen.
    await c.handleLine('0000000001');
    expect(c.current.savedDuringAlert).toBe(1);
    expect(c.current.alert).not.toBeNull();
    c.acknowledgeAlert();
    expect(c.current.alert).toBeNull();
    expect(c.current.tally.total).toBe(2);
  });

  it('wrong keyboard layout is recorded as unknown with a specific alert', async () => {
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    await c.handleLine('ثثث');
    expect(c.current.alert?.kind).toBe('wrong-layout');
    expect((await getSessionScans(s.id))[0]!.type).toBe('unknown');
  });

  it('without a catalogue every barcode is accepted as a normal scan', async () => {
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    await c.handleLine('  000777 ');
    expect(c.current.alert).toBeNull();
    const [row] = await getSessionScans(s.id);
    expect(row).toMatchObject({ type: 'scan', barcode: '000777', raw: '  000777 ' });
  });

  it('a failed write is reported, never shown as counted', async () => {
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    await appendSessionEvent(s.id, 'review'); // makes the write fail
    await c.handleLine('0001');
    expect(c.current.alert).toEqual({ kind: 'save-failed', barcode: '0001' });
    expect(c.current.tally.total).toBe(0);
  });

  it('reloading rebuilds the same view from the log', async () => {
    await replaceCatalog([{ barcode: '0000000001', name: 'DEMO A' }]);
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    for (let i = 0; i < 5; i++) await c.handleLine('0000000001');
    const again = await ScanController.load(s, 'dev');
    expect(again.current.tally.total).toBe(5);
    expect(again.current.last).toMatchObject({ barcode: '0000000001', name: 'DEMO A', countInSession: 5 });
  });
});

describe('phase C: double reads, undo, reopen', () => {
  it('logs a fast repeat as ignored_duplicate, never counted', async () => {
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev', { doubleReadMs: 300 });
    await c.handleLine('0001', 1000);
    await c.handleLine('0001', 1050); // reader double read
    await c.handleLine('0001', 1400); // a real second piece
    const rows = await getSessionScans(s.id);
    expect(rows.map((r) => r.type)).toEqual(['scan', 'ignored_duplicate', 'scan']);
    expect(c.current.tally.total).toBe(2);
    expect(c.current.tally.ignoredDuplicates).toBe(1);
  });

  it('undo appends a reversal for the last scan and blocks a second undo', async () => {
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    await c.handleLine('A');
    await c.handleLine('B');
    const target = c.current.undoable!;
    expect(target.barcode).toBe('B');
    await c.undo(target.uuid);
    expect(c.current.tally.total).toBe(1);
    expect(c.current.undoable).toBeNull();
    expect(c.current.last).toMatchObject({ barcode: 'B', undone: true, countInSession: 0 });
    const rows = await getSessionScans(s.id);
    expect(rows).toHaveLength(3); // nothing deleted
    expect(rows[2]).toMatchObject({ type: 'reversal', reversesUuid: target.uuid });
    // The older scan (A) can never be undone.
    await expect(c.undo(rows[0]!.uuid)).rejects.toThrow();
  });

  it('undo is refused if a new scan arrived after the confirmation opened', async () => {
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    await c.handleLine('A');
    const target = c.current.undoable!;
    await c.handleLine('B');
    await expect(c.undo(target.uuid)).rejects.toThrow('changed');
    expect(c.current.tally.total).toBe(2);
  });

  it('undo state survives a reload', async () => {
    const s = await openSession(info);
    const c = await ScanController.load(s, 'dev');
    await c.handleLine('A');
    await c.undo(c.current.undoable!.uuid);
    const again = await ScanController.load(s, 'dev');
    expect(again.current.tally.total).toBe(0);
    expect(again.current.undoable).toBeNull();
  });

  it('only one open session per device; reopen refused while another is open', async () => {
    const a = await openSession(info);
    await expect(openSession(info)).rejects.toThrow();
    await appendSessionEvent(a.id, 'review');
    await appendSessionEvent(a.id, 'close');
    const b = await openSession({ ...info, stand: 4 });
    const { reopenSession } = await import('../../src/db/log');
    await expect(reopenSession(a.id)).rejects.toThrow();
    await appendSessionEvent(b.id, 'review');
    await appendSessionEvent(b.id, 'close');
    await reopenSession(a.id);
    expect(await getSessionState(a.id)).toBe('active');
  });

  it('finds earlier sessions for the same stand', async () => {
    const { findSessionsForStand } = await import('../../src/db/log');
    const a = await openSession(info);
    const c = await ScanController.load(a, 'dev');
    await c.handleLine('A');
    await appendSessionEvent(a.id, 'review');
    await appendSessionEvent(a.id, 'close');
    const found = await findSessionsForStand('BR-TEST', 'SEC-A', 3);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ state: 'closed', pieces: 1 });
    expect(await findSessionsForStand('BR-TEST', 'SEC-A', 4)).toHaveLength(0);
  });
});

describe('battery warning levels', () => {
  it('warns at 20% and 10% unless charging', async () => {
    const { batteryWarning } = await import('../../src/lib/battery');
    expect(batteryWarning(null)).toBe('none');
    expect(batteryWarning({ level: 0.5, charging: false })).toBe('none');
    expect(batteryWarning({ level: 0.2, charging: false })).toBe('low');
    expect(batteryWarning({ level: 0.08, charging: false })).toBe('critical');
    expect(batteryWarning({ level: 0.05, charging: true })).toBe('none');
  });
});
