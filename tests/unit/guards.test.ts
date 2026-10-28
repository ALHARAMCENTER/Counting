import { describe, expect, it } from 'vitest';
import { DoubleReadGuard, undoTarget } from '../../src/domain/guards';
import type { ScanEvent } from '../../src/db/types';

describe('DoubleReadGuard', () => {
  it('ignores the same barcode inside the window', () => {
    const g = new DoubleReadGuard(300);
    expect(g.isDuplicate('A', 1000)).toBe(false);
    expect(g.isDuplicate('A', 1100)).toBe(true);
    expect(g.isDuplicate('A', 1299)).toBe(true);
  });

  it('accepts the same barcode after the window', () => {
    const g = new DoubleReadGuard(300);
    g.isDuplicate('A', 1000);
    expect(g.isDuplicate('A', 1300)).toBe(false);
  });

  it('measures from the last accepted read, so a stream of fast repeats cannot extend it', () => {
    const g = new DoubleReadGuard(300);
    g.isDuplicate('A', 0);
    expect(g.isDuplicate('A', 200)).toBe(true);
    expect(g.isDuplicate('A', 350)).toBe(false); // 350ms after the accepted one
  });

  it('a different barcode is never a duplicate', () => {
    const g = new DoubleReadGuard(300);
    g.isDuplicate('A', 0);
    expect(g.isDuplicate('B', 10)).toBe(false);
    expect(g.isDuplicate('A', 20)).toBe(false);
  });

  it('window 0 disables the guard', () => {
    const g = new DoubleReadGuard(0);
    g.isDuplicate('A', 0);
    expect(g.isDuplicate('A', 0)).toBe(false);
  });
});

let n = 0;
const e = (type: ScanEvent['type'], reversesUuid?: string): ScanEvent => ({
  uuid: `u${++n}`,
  deviceId: 'd',
  sessionId: 's',
  type,
  barcode: 'X',
  raw: 'X',
  ts: '',
  reversesUuid,
});

describe('undoTarget', () => {
  it('is the last counting row', () => {
    const a = e('scan');
    const b = e('unknown');
    expect(undoTarget([a, b])).toBe(b);
  });

  it('skips ignored double reads', () => {
    const a = e('scan');
    expect(undoTarget([a, e('ignored_duplicate')])).toBe(a);
  });

  it('nothing to undo right after an undo (older scans are protected)', () => {
    const a = e('scan');
    const b = e('scan');
    expect(undoTarget([a, b, e('reversal', b.uuid)])).toBeNull();
  });

  it('nothing to undo in an empty session', () => {
    expect(undoTarget([])).toBeNull();
  });
});
