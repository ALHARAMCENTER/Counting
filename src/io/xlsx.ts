import type { Table } from './catalogImport';

// SheetJS is loaded only when a spreadsheet is read or written, so the scan
// screen stays small and fast. It is bundled with the app (no CDN).
const loadXlsx = () => import('xlsx');

export interface SheetSpec {
  name: string;
  rows: (string | number)[][];
  /** Zero-based columns that must be stored as TEXT (barcodes). */
  textColumns?: number[];
  widths?: number[];
}

/** Builds an .xlsx file. Barcode columns are explicit text cells ("@" format). */
export async function buildXlsx(sheets: SheetSpec[]): Promise<Uint8Array<ArrayBuffer>> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws: Record<string, unknown> = {};
    s.rows.forEach((row, r) => {
      row.forEach((v, c) => {
        const ref = XLSX.utils.encode_cell({ r, c });
        const asText = typeof v === 'string' || (s.textColumns?.includes(c) ?? false);
        ws[ref] = asText ? { t: 's', v: String(v), z: '@' } : { t: 'n', v };
      });
    });
    const cols = Math.max(1, ...s.rows.map((r) => r.length));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, s.rows.length - 1), c: cols - 1 } });
    if (s.widths) ws['!cols'] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws as never, s.name);
  }
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer);
}

/**
 * Reads the first sheet as text. Numeric cells are converted with their shown
 * text and flagged, so the import can warn that leading zeros may be lost.
 */
export async function readXlsx(data: Uint8Array): Promise<Table> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(data, { type: 'array', cellText: true, cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws || !ws['!ref']) return { rows: [], numeric: [] };
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows: string[][] = [];
  const numeric: boolean[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    const num: boolean[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as { t?: string; v?: unknown; w?: string } | undefined;
      if (!cell) {
        row.push('');
        num.push(false);
      } else if (cell.t === 'n') {
        const v = cell.v as number;
        // Prefer the exact integer over a display format like "1.23E+12".
        row.push(Number.isInteger(v) && Math.abs(v) < 1e21 ? BigInt(v).toString() : (cell.w ?? String(v)));
        num.push(true);
      } else {
        row.push(cell.w ?? String(cell.v ?? ''));
        num.push(false);
      }
    }
    if (row.some((x) => x.trim() !== '')) {
      rows.push(row);
      numeric.push(num);
    }
  }
  return { rows, numeric };
}
