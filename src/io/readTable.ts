import { decodeBytes, parseCsv, type DecodedText } from './csv';
import type { Table } from './catalogImport';
import { readXlsx } from './xlsx';

/** Reads a CSV or XLSX file chosen by the user, entirely in the browser. */
export async function readTableFile(file: File): Promise<Table & { encoding?: DecodedText['encoding'] }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) return readXlsx(bytes);
  const { text, encoding } = decodeBytes(bytes);
  return { rows: parseCsv(text), encoding };
}
