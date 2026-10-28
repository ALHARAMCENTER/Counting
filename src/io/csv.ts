/**
 * CSV reading/writing. Every cell is a string: nothing is ever converted to a
 * number, so barcodes keep their leading zeros and long codes stay exact.
 */

export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1256';
}

/** UTF-8 (with or without BOM), UTF-16 with BOM, else Windows-1256 (Arabic Excel). */
export function decodeBytes(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1256').decode(bytes), encoding: 'windows-1256' };
  }
}

/** Picks the delimiter that splits the first line into the most columns. */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r\n|\n|\r/, 1)[0] ?? '';
  let best = ',';
  let max = 0;
  for (const d of [',', ';', '\t', '|']) {
    const n = first.split(d).length;
    if (n > max) {
      max = n;
      best = d;
    }
  }
  return best;
}

/** RFC 4180 parser (quotes, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"' && cell === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop fully empty lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Text fields typed by people could start a spreadsheet formula. Neutralise. */
export function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) || /^\s|\s$/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** UTF-8 with BOM (so Excel shows Arabic correctly), CRLF line ends. */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return '﻿' + rows.map((r) => r.map((c) => quote(String(c))).join(',')).join('\r\n') + '\r\n';
}
