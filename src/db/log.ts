import { getDB, withSessionDeletion } from './db';
import type { ScanEvent, ScanEventType, Session, SessionEvent, SessionEventType } from './types';
import { InvalidTransitionError, nextState, replayState, type SessionState } from '../domain/sessionState';
import { newId } from '../lib/id';
import { computeTally } from '../domain/tally';
import { getDeviceId, getSetting, setSetting } from './settings';

const now = () => new Date().toISOString();

export const getSession = (id: string) => getDB().sessions.get(id);

export async function getSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  return getDB().sessionEvents.where('[sessionId+seq]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
}

export async function getSessionState(sessionId: string): Promise<SessionState> {
  return replayState(await getSessionEvents(sessionId));
}

/** Append a session event after checking the transition, atomically. */
export async function appendSessionEvent(sessionId: string, type: SessionEventType): Promise<SessionState> {
  const db = getDB();
  return db.transaction('rw', db.sessionEvents, async () => {
    const state = await getSessionState(sessionId);
    const next = nextState(state, type);
    if (!next) throw new InvalidTransitionError(state, type);
    await db.sessionEvents.add({ uuid: newId(), sessionId, type, ts: now() });
    return next;
  });
}

export async function openSession(info: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
  const db = getDB();
  const session: Session = { ...info, id: newId(), createdAt: now() };
  await db.transaction('rw', db.sessions, db.sessionEvents, db.settings, async () => {
    // One open session per device: a second one would split the count.
    if (await findActiveSession()) throw new AnotherSessionOpenError();
    await db.sessions.add(session);
    await db.sessionEvents.add({ uuid: newId(), sessionId: session.id, type: 'open', ts: session.createdAt });
  });
  return session;
}

/** Sessions of this device with their replayed state, newest first. */
export async function listSessions(): Promise<{ session: Session; state: SessionState }[]> {
  const db = getDB();
  const sessions = await db.sessions.orderBy('createdAt').reverse().toArray();
  return Promise.all(sessions.map(async (session) => ({ session, state: await getSessionState(session.id) })));
}

/** The session the device should return to after a restart, if any. */
export async function findActiveSession(): Promise<{ session: Session; state: SessionState } | null> {
  // Sessions merged from other devices are never resumed here.
  const deviceId = await getDeviceId();
  for (const s of await listSessions()) {
    if (s.session.deviceId === deviceId && (s.state === 'active' || s.state === 'reviewing')) return s;
  }
  return null;
}

export async function getSessionScans(sessionId: string): Promise<ScanEvent[]> {
  return getDB().events.where('[sessionId+seq]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
}

export interface NewScan {
  sessionId: string;
  deviceId: string;
  type: ScanEventType;
  barcode: string;
  raw: string;
  reversesUuid?: string;
}

/**
 * Appends one row to the scan log. Refuses rows for a session that is not
 * active, inside the same transaction, so a closed session can never grow.
 * Resolves only after the transaction is durably committed.
 */
export async function appendScan(s: NewScan): Promise<ScanEvent> {
  const db = getDB();
  const row: ScanEvent = { uuid: newId(), ts: now(), ...s };
  await db.transaction('rw', db.events, db.sessionEvents, async () => {
    const state = await getSessionState(s.sessionId);
    if (state !== 'active') throw new InvalidTransitionError(state, 'open');
    row.seq = await db.events.add(row);
  });
  return row;
}

/** Supervisor overview: every session with its state and net piece count. */
export async function sessionOverview(): Promise<{ session: Session; state: SessionState; pieces: number }[]> {
  const all = await listSessions();
  return Promise.all(
    all.map(async (s) => ({ ...s, pieces: computeTally(await getSessionScans(s.session.id)).total })),
  );
}

/**
 * Supervisor reopens a closed session (the caller has checked the PIN).
 * Refused while another session is open on this device.
 */
export async function reopenSession(sessionId: string): Promise<void> {
  const db = getDB();
  await db.transaction('rw', db.sessions, db.sessionEvents, db.settings, async () => {
    const open = await findActiveSession();
    if (open && open.session.id !== sessionId) throw new AnotherSessionOpenError();
    await appendSessionEvent(sessionId, 'reopen');
  });
}

export class AnotherSessionOpenError extends Error {
  constructor() {
    super('Another session is open on this device');
    this.name = 'AnotherSessionOpenError';
  }
}

/** What was deleted, kept on the device as a trace (the rows themselves are gone). */
export interface DeletedSessionRecord {
  id: string;
  branch: string;
  section: string;
  employee: string;
  createdAt: string;
  pieces: number;
  deletedAt: string;
  /** The copy the supervisor saved and confirmed before deleting. */
  backupFile: string;
  backupChecksum: string;
}

export class SessionNotDeletableError extends Error {
  constructor() {
    super('Only a closed count can be deleted');
    this.name = 'SessionNotDeletableError';
  }
}

/**
 * Deletes one whole count (its scans, its session events, the session) and
 * leaves a record of it. Only a closed count of this device, or any count that
 * came from another device by merging, can be deleted. The caller makes sure a
 * copy was saved and confirmed first.
 */
export async function deleteSession(sessionId: string, backup: { fileName: string; checksum: string }): Promise<void> {
  const db = getDB();
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const state = await getSessionState(sessionId);
  if (state !== 'closed' && session.deviceId === (await getDeviceId())) throw new SessionNotDeletableError();
  const pieces = computeTally(await getSessionScans(sessionId)).total;

  await withSessionDeletion(sessionId, () =>
    db.transaction('rw', db.events, db.sessionEvents, db.sessions, db.settings, async () => {
      await db.events.where('sessionId').equals(sessionId).delete();
      await db.sessionEvents.where('sessionId').equals(sessionId).delete();
      await db.sessions.delete(sessionId);
      const record: DeletedSessionRecord = {
        id: session.id,
        branch: session.branch,
        section: session.section,
        employee: session.employee,
        createdAt: session.createdAt,
        pieces,
        deletedAt: new Date().toISOString(),
        backupFile: backup.fileName,
        backupChecksum: backup.checksum,
      };
      const log = (await getSetting<DeletedSessionRecord[]>('deletedSessions')) ?? [];
      await setSetting('deletedSessions', [...log, record]);
    }),
  );
}
