import type { ScanEvent } from '../db/types';

/** Rows that add one piece. `ignored_duplicate` never counts. */
export const COUNTING_TYPES = new Set<ScanEvent['type']>(['scan', 'unknown', 'manual']);

export interface Tally {
  /** Net pieces (counted rows minus reversals). */
  total: number;
  /** Net pieces per barcode, only barcodes with a non-zero count. */
  byBarcode: Map<string, number>;
  /** Net pieces per barcode for unknown / manual rows. */
  unknownByBarcode: Map<string, number>;
  manualByBarcode: Map<string, number>;
  ignoredDuplicates: number;
  /** uuids of rows already reversed. */
  reversed: Set<string>;
}

/**
 * Derives every quantity from the append-only log. A reversal cancels exactly
 * the row it references, once; a reversal pointing at nothing countable is ignored.
 */
export function computeTally(events: readonly ScanEvent[]): Tally {
  const byUuid = new Map<string, ScanEvent>();
  for (const e of events) byUuid.set(e.uuid, e);

  const reversed = new Set<string>();
  for (const e of events) {
    if (e.type !== 'reversal' || !e.reversesUuid) continue;
    const target = byUuid.get(e.reversesUuid);
    if (target && COUNTING_TYPES.has(target.type)) reversed.add(target.uuid);
  }

  const byBarcode = new Map<string, number>();
  const unknownByBarcode = new Map<string, number>();
  const manualByBarcode = new Map<string, number>();
  let total = 0;
  let ignoredDuplicates = 0;
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const e of events) {
    if (e.type === 'ignored_duplicate') ignoredDuplicates++;
    if (!COUNTING_TYPES.has(e.type) || reversed.has(e.uuid)) continue;
    total++;
    inc(byBarcode, e.barcode);
    if (e.type === 'unknown') inc(unknownByBarcode, e.barcode);
    if (e.type === 'manual') inc(manualByBarcode, e.barcode);
  }

  return { total, byBarcode, unknownByBarcode, manualByBarcode, ignoredDuplicates, reversed };
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

export interface SessionSummary {
  pieces: number;
  models: number;
  unknownPieces: number;
  unknownBarcodes: number;
  manualPieces: number;
  ignoredDuplicates: number;
}

export function summarize(t: Tally): SessionSummary {
  return {
    pieces: t.total,
    models: t.byBarcode.size,
    unknownPieces: sum(t.unknownByBarcode),
    unknownBarcodes: t.unknownByBarcode.size,
    manualPieces: sum(t.manualByBarcode),
    ignoredDuplicates: t.ignoredDuplicates,
  };
}
