import { COUNTING_TYPES, computeTally } from '../domain/tally';
import type { SessionWithLog } from './countExport';

/** The scan list for the office: one row per counted piece, only what is needed. */
export const SCAN_LIST_HEADER = ['التاريخ والوقت', 'الباركود', 'الفرع', 'الستاند', 'الموظف'] as const;

export interface ScanListRow {
  /** Local time of the device, "YYYY-MM-DD HH:MM:SS". */
  time: string;
  barcode: string;
  branch: string;
  stand: number;
  employee: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local time text of an ISO timestamp. `offsetMinutes` is for tests; default = the device's. */
export function formatLocalTime(iso: string, offsetMinutes = -new Date(iso).getTimezoneOffset()): string {
  const d = new Date(new Date(iso).getTime() + offsetMinutes * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * One row per piece. A scan that was undone is left out, and the undo row
 * itself is not listed either (it is not a piece). Double reads that were
 * ignored are not pieces and are not listed. Oldest first.
 */
export function buildScanList(items: readonly SessionWithLog[], offsetMinutes?: number): ScanListRow[] {
  const out: { at: string; order: number; row: ScanListRow }[] = [];
  let order = 0;
  for (const { session, events } of items) {
    const reversed = computeTally(events).reversed;
    for (const e of events) {
      if (!COUNTING_TYPES.has(e.type) || reversed.has(e.uuid)) continue;
      out.push({
        at: e.ts,
        order: order++,
        row: {
          time: formatLocalTime(e.ts, offsetMinutes),
          barcode: e.barcode,
          branch: session.branch,
          stand: session.stand,
          employee: session.employee,
        },
      });
    }
  }
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order));
  return out.map((x) => x.row);
}
