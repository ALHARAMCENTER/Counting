import type { CatalogItem } from '../db/types';
import { normalizeBarcode } from '../lib/barcode';

/** A table read from CSV or XLSX: every cell is text. */
export interface Table {
  rows: string[][];
  /** XLSX only: true where the source cell was a NUMBER (leading zeros may already be gone). */
  numeric?: boolean[][];
}

export interface ColumnMap {
  barcode: number;
  name: number; // -1 = none
  qty: number; // -1 = none
  branch: number; // -1 = none
  /** Keep only rows whose branch cell equals this (when branch >= 0). */
  branchValue: string;
}

export interface ImportAnalysis {
  items: Omit<CatalogItem, 'importId'>[];
  dataRows: number;
  skippedOtherBranch: number;
  emptyBarcode: number;
  /** Barcodes that appear on more than one row; their quantities were added. */
  duplicates: string[];
  /** Row numbers (1-based, header = 1) with a barcode in scientific notation: file damaged by Excel. */
  scientific: number[];
  /** Row numbers with a quantity that is not a whole number. */
  badQty: number[];
  /** Row numbers whose barcode cell was numeric in XLSX. */
  numericCells: number[];
  /** Row numbers with a long numeric barcode stored as a number (precision lost). */
  unsafeNumbers: number[];
  canImport: boolean;
}

const SCIENTIFIC = /^[+-]?\d+(?:[.,]\d+)?E[+-]?\d+$/i;
const INTEGER = /^[+-]?\d+(?:\.0+)?$/;

const HINTS: Record<'barcode' | 'name' | 'qty' | 'branch', RegExp> = {
  barcode: /barcode|bar code|code|ean|upc|sku|باركود|الباركود|كود|بارکوڈ/i,
  name: /name|model|desc|item|اسم|الاسم|موديل|الموديل|صنف|نام|ماڈل/i,
  qty: /qty|quantity|stock|balance|كمية|الكمية|رصيد|مقدار|تعداد/i,
  branch: /branch|store|location|فرع|الفرع|مستودع|برانچ/i,
};

/** Guesses columns from the header row; the supervisor confirms or changes them. */
export function guessColumns(header: readonly string[]): ColumnMap {
  const find = (k: keyof typeof HINTS) => header.findIndex((h) => HINTS[k].test(h.trim()));
  const barcode = find('barcode');
  return { barcode: barcode >= 0 ? barcode : 0, name: find('name'), qty: find('qty'), branch: find('branch'), branchValue: '' };
}

export function branchValues(t: Table, col: number): string[] {
  if (col < 0) return [];
  return [...new Set(t.rows.slice(1).map((r) => (r[col] ?? '').trim()).filter(Boolean))].sort();
}

export function analyzeImport(t: Table, map: ColumnMap): ImportAnalysis {
  const a: ImportAnalysis = {
    items: [],
    dataRows: 0,
    skippedOtherBranch: 0,
    emptyBarcode: 0,
    duplicates: [],
    scientific: [],
    badQty: [],
    numericCells: [],
    unsafeNumbers: [],
    canImport: false,
  };
  const byBarcode = new Map<string, Omit<CatalogItem, 'importId'>>();
  const dup = new Set<string>();

  t.rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    a.dataRows++;
    if (map.branch >= 0 && (r[map.branch] ?? '').trim() !== map.branchValue.trim()) {
      a.skippedOtherBranch++;
      return;
    }
    const cell = (r[map.barcode] ?? '').trim();
    if (SCIENTIFIC.test(cell)) {
      a.scientific.push(rowNo);
      return;
    }
    if (t.numeric?.[i + 1]?.[map.barcode]) {
      a.numericCells.push(rowNo);
      // Beyond 15 digits a spreadsheet number has already lost digits.
      if (cell.replace(/\D/g, '').length > 15) a.unsafeNumbers.push(rowNo);
    }
    const { barcode } = normalizeBarcode(cell);
    if (!barcode) {
      a.emptyBarcode++;
      return;
    }
    let qty: number | undefined;
    if (map.qty >= 0) {
      const q = (r[map.qty] ?? '').trim().replace(/,/g, '');
      if (q === '') qty = 0;
      else if (INTEGER.test(q)) qty = Math.trunc(Number(q));
      else {
        a.badQty.push(rowNo);
        return;
      }
    }
    const name = map.name >= 0 ? (r[map.name] ?? '').trim() : '';
    const prev = byBarcode.get(barcode);
    if (prev) {
      dup.add(barcode);
      if (qty !== undefined) prev.systemQty = (prev.systemQty ?? 0) + qty;
      if (!prev.name && name) prev.name = name;
    } else {
      byBarcode.set(barcode, qty === undefined ? { barcode, name } : { barcode, name, systemQty: qty });
    }
  });

  a.items = [...byBarcode.values()];
  a.duplicates = [...dup];
  a.canImport = a.items.length > 0 && a.scientific.length === 0 && a.badQty.length === 0 && a.unsafeNumbers.length === 0;
  return a;
}
