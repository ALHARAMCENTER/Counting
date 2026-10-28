import type { SessionEventType } from '../db/types';

/**
 * Session state machine. State is never stored: it is replayed from the
 * append-only session event log.
 *
 *   (none) --open--> active --review--> reviewing --close--> closed
 *                      ^                   |                   |
 *                      +------resume-------+                   |
 *                      +---------------reopen (PIN)------------+
 */
export type SessionState = 'none' | 'active' | 'reviewing' | 'closed';

const TRANSITIONS: Record<SessionState, Partial<Record<SessionEventType, SessionState>>> = {
  none: { open: 'active' },
  active: { review: 'reviewing' },
  reviewing: { resume: 'active', close: 'closed' },
  closed: { reopen: 'active' },
};

export function nextState(state: SessionState, event: SessionEventType): SessionState | null {
  return TRANSITIONS[state][event] ?? null;
}

export class InvalidTransitionError extends Error {
  constructor(state: SessionState, event: SessionEventType) {
    super(`Cannot apply "${event}" in state "${state}"`);
    this.name = 'InvalidTransitionError';
  }
}

/** Replays events in order; throws if the log contains an impossible step. */
export function replayState(events: readonly { type: SessionEventType }[]): SessionState {
  let s: SessionState = 'none';
  for (const e of events) {
    const n = nextState(s, e.type);
    if (!n) throw new InvalidTransitionError(s, e.type);
    s = n;
  }
  return s;
}

/** Scanning is only allowed while active. */
export const canScan = (s: SessionState) => s === 'active';
