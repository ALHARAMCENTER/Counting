import { describe, expect, it } from 'vitest';
import { normalizeBarcode } from '../../src/lib/barcode';

describe('normalizeBarcode', () => {
  it('keeps leading zeros and stays a string', () => {
    const n = normalizeBarcode('0000123');
    expect(n.barcode).toBe('0000123');
    expect(typeof n.barcode).toBe('string');
  });

  it('never turns long numeric codes into numbers / scientific notation', () => {
    expect(normalizeBarcode('12345678901234567890').barcode).toBe('12345678901234567890');
  });

  it('trims and removes all whitespace, tabs and control characters', () => {
    expect(normalizeBarcode('  00 12\t34\r').barcode).toBe('001234');
    expect(normalizeBarcode('‏0012‎').barcode).toBe('0012');
  });

  it('upper-cases letters (Caps Lock safe)', () => {
    expect(normalizeBarcode('0000000003tst00').barcode).toBe('0000000003TST00');
  });

  it('converts Arabic-Indic and Persian digits to Latin', () => {
    expect(normalizeBarcode('٠٠١٢٣').barcode).toBe('00123');
    expect(normalizeBarcode('۰۰۴۵۶').barcode).toBe('00456');
  });

  it('flags Arabic letters as a wrong keyboard layout', () => {
    expect(normalizeBarcode('ثثث123').wrongLayout).toBe(true);
    expect(normalizeBarcode('0000000003TST00').wrongLayout).toBe(false);
    expect(normalizeBarcode('٠١٢').wrongLayout).toBe(false);
  });

  it('keeps the raw value for audit', () => {
    expect(normalizeBarcode(' ab1 ').raw).toBe(' ab1 ');
  });
});
