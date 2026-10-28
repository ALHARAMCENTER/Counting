import { describe, expect, it } from 'vitest';
import { computeTally, summarize } from '../../src/domain/tally';
import type { ScanEvent } from '../../src/db/types';

let i = 0;
const e = (type: ScanEvent['type'], barcode: string, reversesUuid?: string): ScanEvent => ({
  uuid: `u${++i}`,
  deviceId: 'd',
  sessionId: 's',
  type,
  barcode,
  raw: barcode,
  ts: '',
  reversesUuid,
});

describe('computeTally', () => {
  it('quantity = number of scans per barcode', () => {
    const t = computeTally([e('scan', '001'), e('scan', '001'), e('scan', '002')]);
    expect(t.total).toBe(3);
    expect(t.byBarcode.get('001')).toBe(2);
    expect(t.byBarcode.get('002')).toBe(1);
  });

  it('counts unknown and manual rows, but tracks them separately', () => {
    const t = computeTally([e('unknown', 'X'), e('manual', 'M1'), e('scan', '001')]);
    expect(t.total).toBe(3);
    expect(t.unknownByBarcode.get('X')).toBe(1);
    expect(t.manualByBarcode.get('M1')).toBe(1);
  });

  it('never counts ignored double reads', () => {
    const t = computeTally([e('scan', '001'), e('ignored_duplicate', '001')]);
    expect(t.total).toBe(1);
    expect(t.ignoredDuplicates).toBe(1);
  });

  it('a reversal cancels exactly its target, once', () => {
    const a = e('scan', '001');
    const b = e('scan', '001');
    const t = computeTally([a, b, e('reversal', '001', b.uuid), e('reversal', '001', b.uuid)]);
    expect(t.total).toBe(1);
    expect(t.byBarcode.get('001')).toBe(1);
    expect(t.reversed.has(b.uuid)).toBe(true);
    expect(t.reversed.has(a.uuid)).toBe(false);
  });

  it('removes a barcode with a zero net count', () => {
    const a = e('scan', '001');
    const t = computeTally([a, e('reversal', '001', a.uuid)]);
    expect(t.total).toBe(0);
    expect(t.byBarcode.has('001')).toBe(false);
  });

  it('ignores reversals pointing at missing or non-counting rows', () => {
    const d = e('ignored_duplicate', '001');
    const t = computeTally([e('scan', '001'), d, e('reversal', '001', d.uuid), e('reversal', '001', 'nope')]);
    expect(t.total).toBe(1);
  });

  it('summary: pieces, models, unknowns', () => {
    const s = summarize(computeTally([e('scan', '1'), e('scan', '1'), e('unknown', 'X'), e('unknown', 'X'), e('unknown', 'Y')]));
    expect(s).toEqual({ pieces: 5, models: 3, unknownPieces: 3, unknownBarcodes: 2, manualPieces: 0, ignoredDuplicates: 0 });
  });
});
