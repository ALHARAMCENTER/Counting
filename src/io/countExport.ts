import type { ScanEvent, Session } from '../db/types';
import type { SessionState } from '../domain/sessionState';
import { computeTally } from '../domain/tally';
import { countChecksum } from './checksum';

export interface SessionWithLog {
  session: Session;
  state: SessionState;
  events: readonly ScanEvent[];
}

/**
 * Everything one export file contains. CSV and XLSX are both rendered from
 * this, so the totals and checksum are identical in both formats and on screen.
 */
export interface CountBundle {
  /** Barcode → quantity for every scanned barcode (known and unknown). */
  count: [string, number][];
  /** Subset of `count` not found in the system file, for review. */
  unknown: [string, number][];
  /** Hand-typed entries, kept apart from scanned barcodes. */
  manual: [string, number][];
  totalPieces: number;
  checksum: string;
  sessions: { session: Session; state: SessionState; pieces: number }[];
  ignoredDuplicates: number;
}

const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
const sorted = (m: Map<string, number>): [string, number][] =>
  [...m.entries()].filter(([, q]) => q !== 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

export async function buildCountBundle(items: readonly SessionWithLog[]): Promise<CountBundle> {
  const count = new Map<string, number>();
  const unknown = new Map<string, number>();
  const manual = new Map<string, number>();
  let totalPieces = 0;
  let ignoredDuplicates = 0;
  const sessions: CountBundle['sessions'] = [];

  for (const { session, state, events } of items) {
    const t = computeTally(events);
    totalPieces += t.total;
    ignoredDuplicates += t.ignoredDuplicates;
    sessions.push({ session, state, pieces: t.total });
    for (const [b, q] of t.byBarcode) {
      const m = t.manualByBarcode.get(b) ?? 0;
      if (q - m) add(count, b, q - m);
    }
    for (const [b, q] of t.unknownByBarcode) add(unknown, b, q);
    for (const [b, q] of t.manualByBarcode) add(manual, b, q);
  }

  const countRows = sorted(count);
  const manualRows = sorted(manual);
  // Manual text is prefixed so it can never collide with a real barcode.
  const checksum = await countChecksum([...countRows, ...manualRows.map(([k, q]) => [`MANUAL:${k}`, q] as [string, number])]);
  return { count: countRows, unknown: sorted(unknown), manual: manualRows, totalPieces, checksum, sessions, ignoredDuplicates };
}

/** Verification row values, shared by every format. */
export function checkRow(b: CountBundle): [string, string, string, string] {
  return ['#TOTAL', String(b.totalPieces), '#CHECKSUM', b.checksum];
}
