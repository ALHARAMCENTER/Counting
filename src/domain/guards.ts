import type { ScanEvent } from '../db/types';
import { COUNTING_TYPES } from './tally';

/**
 * Double-read guard. A reader can send the same symbol twice within a few
 * milliseconds; a person cannot scan two pieces that fast. Compared against
 * the last ACCEPTED line, using arrival times (monotonic ms).
 */
export class DoubleReadGuard {
  private last: { barcode: string; at: number } | null = null;

  constructor(public windowMs: number) {}

  /** True when this line must be logged as `ignored_duplicate`. */
  isDuplicate(barcode: string, at: number): boolean {
    const dup = this.last !== null && this.last.barcode === barcode && at - this.last.at < this.windowMs;
    if (!dup) this.last = { barcode, at };
    return dup;
  }

  reset(): void {
    this.last = null;
  }
}

/**
 * Undo is allowed for the most recent scan only: the newest row that is not an
 * ignored double read must be a counting row. After an undo the button stays
 * off until the next scan, so older scans can never be undone.
 */
export function undoTarget(events: readonly ScanEvent[]): ScanEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === 'ignored_duplicate') continue;
    return COUNTING_TYPES.has(e.type) ? e : null;
  }
  return null;
}
