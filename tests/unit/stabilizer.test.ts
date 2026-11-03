import { describe, expect, it } from 'vitest';
import { CodeStabilizer } from '../../src/scan/stabilizer';

const make = () => new CodeStabilizer({ confirmReads: 2, confirmWithinMs: 1000, releaseAfterMs: 900 });

describe('CodeStabilizer (camera readings → counted pieces)', () => {
  it('counts a code only after it is read twice in a row', () => {
    const s = make();
    expect(s.feed('A', 0)).toBeNull();
    expect(s.feed('A', 150)).toBe('A');
  });

  it('a single misread never counts', () => {
    const s = make();
    expect(s.feed('A', 0)).toBeNull();
    expect(s.feed('B', 150)).toBeNull(); // different: starts over
    expect(s.feed(null, 300)).toBeNull();
    expect(s.feed('A', 450)).toBeNull(); // first read of A again
  });

  it('a label held in front of the camera counts once, however long it stays', () => {
    const s = make();
    const counted: string[] = [];
    for (let t = 0; t <= 5000; t += 150) {
      const c = s.feed('A', t);
      if (c) counted.push(c);
    }
    expect(counted).toEqual(['A']);
  });

  it('short gaps in reading (blur, shake) do not make the same label count again', () => {
    const s = make();
    const counted: string[] = [];
    const reads: [number, string | null][] = [[0, 'A'], [150, 'A'], [300, null], [450, null], [600, null], [750, 'A'], [900, null], [1050, 'A']];
    for (const [t, c] of reads) {
      const r = s.feed(c, t);
      if (r) counted.push(r);
    }
    expect(counted).toEqual(['A']);
  });

  it('the same code counts again after it left the view, once per piece', () => {
    const s = make();
    const counted: string[] = [];
    const feed = (c: string | null, t: number) => {
      const r = s.feed(c, t);
      if (r) counted.push(r);
    };
    feed('A', 0); feed('A', 150); // piece 1
    for (let t = 300; t <= 1300; t += 150) feed(null, t); // gone for > 900 ms
    feed('A', 1450); feed('A', 1600); // piece 2
    expect(counted).toEqual(['A', 'A']);
  });

  it('two different labels in view are each counted once, not over and over', () => {
    const s = make();
    const counted: string[] = [];
    let t = 0;
    for (let i = 0; i < 12; i++) {
      for (const c of ['A', 'A', 'B', 'B']) {
        const r = s.feed(c, (t += 100));
        if (r) counted.push(r);
      }
    }
    expect(counted.sort()).toEqual(['A', 'B']);
  });

  it('reads that are too far apart do not add up', () => {
    const s = make();
    expect(s.feed('A', 0)).toBeNull();
    expect(s.feed('A', 1500)).toBeNull(); // more than 1 s later: starts over
    expect(s.feed('A', 1650)).toBe('A');
  });

  it('reset forgets everything', () => {
    const s = make();
    s.feed('A', 0);
    s.feed('A', 100);
    s.reset();
    expect(s.feed('A', 200)).toBeNull();
    expect(s.feed('A', 300)).toBe('A');
  });
});
