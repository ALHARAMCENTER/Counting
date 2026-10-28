import type { CatalogItem } from '../db/types';

export interface DiffRow {
  barcode: string;
  name: string;
  system: number;
  counted: number;
  /** counted - system: negative = missing pieces, positive = extra. */
  diff: number;
  inSystem: boolean;
}

export interface Reconciliation {
  rows: DiffRow[];
  systemTotal: number;
  countedTotal: number;
  /** Barcodes compared (union of system file and count). */
  compared: number;
}

/**
 * Compares the counted quantities with the system file. Every barcode of
 * either side is compared, so a model never scanned shows as a shortage.
 * Only rows with |diff| > tolerance are returned, largest first.
 */
export function reconcile(
  catalog: readonly Pick<CatalogItem, 'barcode' | 'name' | 'systemQty'>[],
  counted: ReadonlyMap<string, number>,
  tolerance: number,
): Reconciliation {
  const rows: DiffRow[] = [];
  let systemTotal = 0;
  let countedTotal = 0;
  const seen = new Set<string>();

  for (const c of catalog) {
    seen.add(c.barcode);
    const system = c.systemQty ?? 0;
    const got = counted.get(c.barcode) ?? 0;
    systemTotal += system;
    countedTotal += got;
    rows.push({ barcode: c.barcode, name: c.name, system, counted: got, diff: got - system, inSystem: true });
  }
  for (const [barcode, got] of counted) {
    if (seen.has(barcode)) continue;
    countedTotal += got;
    rows.push({ barcode, name: '', system: 0, counted: got, diff: got, inSystem: false });
  }

  const compared = rows.length;
  const out = rows
    .filter((r) => Math.abs(r.diff) > tolerance)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || (a.barcode < b.barcode ? -1 : 1));
  return { rows: out, systemTotal, countedTotal, compared };
}
