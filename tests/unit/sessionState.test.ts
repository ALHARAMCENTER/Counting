import { describe, expect, it } from 'vitest';
import { canScan, nextState, replayState } from '../../src/domain/sessionState';

const ev = (...types: Parameters<typeof nextState>[1][]) => types.map((type) => ({ type }));

describe('session state machine', () => {
  it('normal lifecycle', () => {
    expect(replayState(ev())).toBe('none');
    expect(replayState(ev('open'))).toBe('active');
    expect(replayState(ev('open', 'review'))).toBe('reviewing');
    expect(replayState(ev('open', 'review', 'resume'))).toBe('active');
    expect(replayState(ev('open', 'review', 'close'))).toBe('closed');
    expect(replayState(ev('open', 'review', 'close', 'reopen'))).toBe('active');
  });

  it('closing requires the summary step first', () => {
    expect(nextState('active', 'close')).toBeNull();
  });

  it('a closed session accepts only reopen', () => {
    for (const t of ['open', 'review', 'resume', 'close'] as const) expect(nextState('closed', t)).toBeNull();
  });

  it('rejects impossible logs', () => {
    expect(() => replayState(ev('review'))).toThrow();
    expect(() => replayState(ev('open', 'open'))).toThrow();
  });

  it('scanning only while active', () => {
    expect(canScan('active')).toBe(true);
    expect(canScan('reviewing')).toBe(false);
    expect(canScan('closed')).toBe(false);
  });
});
