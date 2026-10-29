import { describe, expect, it } from 'vitest';
import { KeyboardHub, charFromKeyEvent } from '../../src/scan/keyboardHub';

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

describe('charFromKeyEvent (reader input on any keyboard layout)', () => {
  const k = (key: string, code: string, shiftKey = false, capsLock = false) => charFromKeyEvent({ key, code, shiftKey, capsLock });

  it('English layout: the typed character', () => {
    expect(k('0', 'Digit0')).toBe('0');
    expect(k('T', 'KeyT', true)).toBe('T');
    expect(k('t', 'KeyT')).toBe('t');
  });

  it('Arabic layout: letters and digits come from the physical key, not the Arabic character', () => {
    expect(k('ف', 'KeyT')).toBe('t');
    expect(k('ف', 'KeyT', true)).toBe('T');
    expect(k('س', 'KeyS', false, true)).toBe('S'); // Caps Lock on
    expect(k('٣', 'Digit3')).toBe('3');
    expect(k('لا', 'KeyB')).toBe('b'); // two-character ligature key
  });

  it('numpad digits and a Num-Lock-off numpad still give digits', () => {
    expect(k('5', 'Numpad5')).toBe('5');
    expect(k('End', 'Numpad1')).toBe('1');
  });

  it('symbols keep the typed character; Shift + digit key stays a symbol', () => {
    expect(k('-', 'Minus')).toBe('-');
    expect(k('/', 'Slash')).toBe('/');
    expect(k('!', 'Digit1', true)).toBe('!');
  });

  it('non-character keys give null', () => {
    expect(k('Shift', 'ShiftLeft', true)).toBeNull();
    expect(k('ArrowUp', 'ArrowUp')).toBeNull();
  });

  it('events without a code (simulators) fall back to the key', () => {
    expect(k('7', '')).toBe('7');
  });
});
