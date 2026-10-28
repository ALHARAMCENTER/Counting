import { describe, expect, it } from 'vitest';
import { decodeBytes, detectDelimiter, parseCsv, safeText, toCsv } from '../../src/io/csv';
import { countChecksum } from '../../src/io/checksum';

describe('parseCsv', () => {
  it('keeps every cell as text, leading zeros included', () => {
    const rows = parseCsv('barcode,qty\n000123,5\n0000000003TST00,07\n');
    expect(rows).toEqual([
      ['barcode', 'qty'],
      ['000123', '5'],
      ['0000000003TST00', '07'],
    ]);
  });

  it('handles quotes, embedded commas, newlines and doubled quotes', () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",z');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['multi\nline', 'z'],
    ]);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(parseCsv('a;b\n001;2')).toEqual([
      ['a', 'b'],
      ['001', '2'],
    ]);
  });

  it('drops empty lines', () => {
    expect(parseCsv('a\n\n,\nb\n')).toEqual([['a'], ['b']]);
  });
});

describe('decodeBytes', () => {
  it('UTF-8 with BOM', () => {
    const b = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('قميص')]);
    expect(decodeBytes(b)).toEqual({ text: 'قميص', encoding: 'utf-8' });
  });
  it('falls back to Windows-1256 for Arabic Excel files', () => {
    // "قميص" in Windows-1256
    const b = new Uint8Array([0xde, 0xe3, 0xed, 0xd5]);
    expect(decodeBytes(b)).toEqual({ text: 'قميص', encoding: 'windows-1256' });
  });
});

describe('toCsv', () => {
  it('writes a BOM, CRLF, and quotes only when needed', () => {
    expect(toCsv([['Barcode', 'Qty'], ['000123', 7], ['a,b', 1]])).toBe('﻿Barcode,Qty\r\n000123,7\r\n"a,b",1\r\n');
  });
  it('round-trips barcodes unchanged', () => {
    const codes = ['000123', '0000000003TST00', '12345678901234567890', ' 01'];
    const back = parseCsv(toCsv(codes.map((c) => [c])).slice(1)).map((r) => r[0]);
    expect(back).toEqual(codes);
  });
  it('neutralises formula-looking text fields', () => {
    expect(safeText('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(safeText('DEMO')).toBe('DEMO');
  });
});

describe('countChecksum', () => {
  it('is order independent and sensitive to any change', async () => {
    const a = await countChecksum([
      ['001', 2],
      ['002', 1],
    ]);
    const b = await countChecksum([
      ['002', 1],
      ['001', 2],
    ]);
    const c = await countChecksum([
      ['001', 2],
      ['002', 2],
    ]);
    const d = await countChecksum([
      ['01', 2],
      ['002', 1],
    ]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(a).toMatch(/^[0-9A-F]{12}$/);
  });
});
