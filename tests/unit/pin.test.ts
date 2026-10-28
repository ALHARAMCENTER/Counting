import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, verifyPin } from '../../src/lib/pin';

describe('supervisor PIN', () => {
  it('accepts 4 to 8 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('١٢٣٤')).toBe(false);
  });

  it('never stores the PIN in clear text', async () => {
    const rec = await hashPin('482915', 1000);
    expect(JSON.stringify(rec)).not.toContain('482915');
    expect(rec.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies the right PIN and rejects others', async () => {
    const rec = await hashPin('482915', 1000);
    expect(await verifyPin('482915', rec)).toBe(true);
    expect(await verifyPin('482916', rec)).toBe(false);
    expect(await verifyPin('', rec)).toBe(false);
  });

  it('uses a random salt per PIN', async () => {
    const a = await hashPin('1111', 1000);
    const b = await hashPin('1111', 1000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('rejects creating an invalid PIN', async () => {
    await expect(hashPin('12')).rejects.toThrow();
  });
});
