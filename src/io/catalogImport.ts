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
  /** The quantity column is the barcode column (a wrong choice). */
  sameColumn: boolean;
  /** Row numbers with an unreasonably large quantity (usually a code chosen as the quantity column). */
  hugeQty: number[];
  /** Row numbers whose barcode cell was numeric in XLSX. */
  numericCells: number[];
  /** Row numbers with a long numeric barcode stored as a number (precision lost). */
  unsafeNumbers: number[];
  canImport: boolean;
}

/** More than this in one line is not a stock quantity. */
export const MAX_QTY = 1_000_000;

const SCIENTIFIC = /^[+-]?\d+(?:[.,]\d+)?E[+-]?\d+$/i;
const INTEGER = /^[+-]?\d+(?:\.0+)?$/;

/** Header patterns, most specific first; one column is never used for two roles. */
const WORD = (w: string) => `(^|[^a-z])(${w})(?![a-z])`;
const HINTS = {
  barcode: [/barcode|bar code|باركود|الباركود|بارکوڈ/i, new RegExp(`stock ?code|item ?code|${WORD('ean|upc|sku')}`, 'i'), /code|كود/i],
  qty: [/balance|qty|quantity|كمية|الكمية|رصيد|مقدار|تعداد/i, /stock|مخزون/i],
  branch: [/branch|store|location|فرع|الفرع|مستودع|برانچ/i],
  name: [/model|موديل|الموديل|ماڈل/i, /name|desc|اسم|الاسم|نام/i, /item|صنف/i],
} as const;

/** Guesses columns from the header row; the supervisor confirms or changes them. */
export function guessColumns(header: readonly string[]): ColumnMap {
  const used = new Set<number>();
  const pick = (patterns: readonly RegExp[]) => {
    for (const p of patterns) {
      const i = header.findIndex((h, idx) => !used.has(idx) && p.test(h.trim()));
      if (i >= 0) {
        used.add(i);
        return i;
      }
    }
    return -1;
  };
  const barcode = pick(HINTS.barcode);
  const qty = pick(HINTS.qty);
  const branch = pick(HINTS.branch);
  const name = pick(HINTS.name);
  return { barcode: barcode >= 0 ? barcode : 0, name, qty, branch, branchValue: '' };
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
    sameColumn: map.qty >= 0 && map.qty === map.barcode,
    hugeQty: [],
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
      else if (INTEGER.test(q)) {
        qty = Math.trunc(Number(q));
        if (Math.abs(qty) > MAX_QTY) {
          a.hugeQty.push(rowNo);
          return;
        }
      } else {
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
  a.canImport =
    a.items.length > 0 &&
    !a.sameColumn &&
    a.scientific.length === 0 &&
    a.badQty.length === 0 &&
    a.hugeQty.length === 0 &&
    a.unsafeNumbers.length === 0;
  return a;
}
