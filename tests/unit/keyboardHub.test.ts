import { describe, expect, it } from 'vitest';
import { KeyboardHub } from '../../src/scan/keyboardHub';

function setup() {
  let t = 0;
  const refused: string[] = [];
  const hub = new KeyboardHub((l) => refused.push(l), 1000, () => t);
  const type = (s: string) => {
    for (const c of s) hub.push(c);
    hub.enter();
  };
  return { hub, refused, type, tick: (ms: number) => (t += ms) };
}

describe('KeyboardHub', () => {
  it('delivers whole lines to the current consumer', () => {
    const { hub, type } = setup();
    const got: string[] = [];
    hub.setConsumer((l) => got.push(l));
    type('000123');
    expect(got).toEqual(['000123']);
  });

  it('refuses the WHOLE line when no screen takes it', () => {
    const { type, refused } = setup();
    type('000123');
    expect(refused).toEqual(['000123']);
  });

  it('a screen change in the middle of a scan never truncates it', () => {
    const { hub, refused } = setup();
    const got: string[] = [];
    for (const c of '000') hub.push(c); // arrives while no screen listens
    hub.setConsumer((l) => got.push(l)); // scan screen appears
    for (const c of '123') hub.push(c);
    hub.enter();
    expect(got).toEqual(['000123']);
    expect(refused).toEqual([]);
  });

  it('holds complete lines while a session opens, then hands them over in order', () => {
    const { hub, type } = setup();
    hub.holdForNextConsumer();
    type('A1');
    type('A2');
    const got: string[] = [];
    hub.setConsumer((l) => got.push(l));
    type('A3');
    expect(got).toEqual(['A1', 'A2', 'A3']);
  });

  it('cancelHold refuses the waiting lines', () => {
    const { hub, type, refused } = setup();
    hub.holdForNextConsumer();
    type('A1');
    hub.cancelHold();
    expect(refused).toEqual(['A1']);
  });

  it('only the registered consumer can release itself', () => {
    const { hub, type } = setup();
    const a: string[] = [];
    const b: string[] = [];
    const ca = (l: string) => a.push(l);
    const cb = (l: string) => b.push(l);
    hub.setConsumer(ca);
    hub.setConsumer(cb); // new screen mounted before the old one unmounted
    hub.releaseConsumer(ca);
    type('X');
    expect(b).toEqual(['X']);
    expect(a).toEqual([]);
  });

  it('drops a broken partial scan (long pause) instead of gluing it to the next one', () => {
    const { hub, tick } = setup();
    const got: string[] = [];
    hub.setConsumer((l) => got.push(l));
    for (const c of '0001') hub.push(c); // cable pulled, no Enter
    tick(5000);
    for (const c of '999') hub.push(c);
    hub.enter();
    expect(got).toEqual(['999']);
  });
});
