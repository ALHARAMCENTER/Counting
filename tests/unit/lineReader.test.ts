import { describe, expect, it } from 'vitest';
import { LineReader } from '../../src/lib/lineReader';

const make = () => {
  const lines: string[] = [];
  return { r: new LineReader((l) => lines.push(l)), lines };
};

describe('LineReader (keyboard-wedge input)', () => {
  it('emits only when Enter arrives', () => {
    const { r, lines } = make();
    for (const c of '000123') r.push(c);
    expect(lines).toEqual([]);
    expect(r.pending).toBe('000123');
    r.enter();
    expect(lines).toEqual(['000123']);
    expect(r.pending).toBe('');
  });

  it('handles many fast scans back to back', () => {
    const { r, lines } = make();
    for (let i = 0; i < 200; i++) {
      for (const c of `CODE${i}`) r.push(c);
      r.enter();
    }
    expect(lines).toHaveLength(200);
    expect(lines[199]).toBe('CODE199');
  });

  it('ignores blank lines (Enter alone, spaces)', () => {
    const { r, lines } = make();
    r.enter();
    r.push('   ');
    r.enter();
    expect(lines).toEqual([]);
  });

  it('splits text that contains line breaks', () => {
    const { r, lines } = make();
    r.push('AAA\r\nBBB\nCC');
    expect(lines).toEqual(['AAA', 'BBB']);
    r.push('C');
    r.enter();
    expect(lines).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('a partial scan without Enter is never counted', () => {
    const { r, lines } = make();
    r.push('00012');
    r.clear();
    r.enter();
    expect(lines).toEqual([]);
  });
});
