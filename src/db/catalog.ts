import { getDB } from './db';
import type { CatalogItem } from './types';
import { newId } from '../lib/id';

export async function lookupBarcode(barcode: string): Promise<CatalogItem | undefined> {
  return getDB().catalog.get(barcode);
}

export async function catalogSize(): Promise<number> {
  return getDB().catalog.count();
}

/** Replaces the whole catalogue in one transaction. */
export async function replaceCatalog(items: Omit<CatalogItem, 'importId'>[]): Promise<string> {
  const db = getDB();
  const importId = newId();
  await db.transaction('rw', db.catalog, async () => {
    await db.catalog.clear();
    await db.catalog.bulkAdd(items.map((i) => ({ ...i, importId })));
  });
  return importId;
}

/** FAKE demo data for the scanner simulator. Never real products. */
export const DEMO_CATALOG: Omit<CatalogItem, 'importId'>[] = [
  { barcode: '0000000001', name: 'DEMO SHIRT A', systemQty: 12 },
  { barcode: '0000000002', name: 'DEMO SHIRT B', systemQty: 5 },
  { barcode: '0000000003TST00', name: 'DEMO DRESS C', systemQty: 7 },
  { barcode: '000000000004', name: 'DEMO ABAYA D', systemQty: 3 },
  { barcode: '0000000005TST00', name: 'DEMO JACKET E', systemQty: 0 },
];
