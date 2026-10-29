import { beforeEach, describe, expect, it } from 'vitest';
import { useFreshDB } from './helpers';
import { AppendOnlyError } from '../../src/db/db';
import { appendSessionEvent, deleteSession, openSession, SessionNotDeletableError, sessionOverview } from '../../src/db/log';
import { getSetting, setSetting } from '../../src/db/settings';
import { ScanController } from '../../src/scan/ScanController';

const db = useFreshDB();
beforeEach(() => setSetting('deviceId', 'dev'));

const info = { deviceId: 'dev', branch: '701', section: 'men', employee: 'Tester' };
const backup = { fileName: 'backup-701-men.csv', checksum: 'ABC123' };

async function count(lines: string[], close = true) {
  const s = await openSession(info);
  const c = await ScanController.load(s, 'dev');
  for (const l of lines) await c.handleLine(l);
  if (close) {
    await appendSessionEvent(s.id, 'review');
    await appendSessionEvent(s.id, 'close');
  }
  return s;
}

describe('deleting one count', () => {
  it('removes that count completely and leaves the others untouched', async () => {
    const a = await count(['A', 'A', 'B']);
    const b = await count(['C']);
    await deleteSession(a.id, backup);

    expect(await db().sessions.get(a.id)).toBeUndefined();
    expect(await db().events.where('sessionId').equals(a.id).count()).toBe(0);
    expect(await db().sessionEvents.where('sessionId').equals(a.id).count()).toBe(0);
    expect(await db().events.where('sessionId').equals(b.id).count()).toBe(1);
    expect(await db().sessionEvents.where('sessionId').equals(b.id).count()).toBe(3);
    const left = await sessionOverview();
    expect(left.map((x) => [x.session.id, x.pieces])).toEqual([[b.id, 1]]);
  });

  it('leaves a trace of what was deleted and which copy was confirmed', async () => {
    const a = await count(['A', 'A', 'B']);
    await deleteSession(a.id, backup);
    const log = await getSetting<Record<string, unknown>[]>('deletedSessions');
    expect(log).toHaveLength(1);
    expect(log![0]).toMatchObject({ id: a.id, branch: '701', section: 'men', employee: 'Tester', pieces: 3, backupFile: 'backup-701-men.csv', backupChecksum: 'ABC123' });
  });

  it('refuses an open count of this device (nothing is deleted)', async () => {
    const a = await count(['A'], false);
    await expect(deleteSession(a.id, backup)).rejects.toBeInstanceOf(SessionNotDeletableError);
    expect(await db().events.count()).toBe(1);
    await appendSessionEvent(a.id, 'review'); // finishing is still not closing
    await expect(deleteSession(a.id, backup)).rejects.toBeInstanceOf(SessionNotDeletableError);
  });

  it('a count merged from another device can be deleted even if it was not closed there', async () => {
    await db().sessions.add({ id: 'x', deviceId: 'OTHER', branch: '706', section: 'men', employee: 'E', createdAt: '2026-01-01T00:00:00.000Z' });
    await db().sessionEvents.add({ uuid: 'e1', sessionId: 'x', type: 'open', ts: '' });
    await deleteSession('x', backup);
    expect(await db().sessions.get('x')).toBeUndefined();
  });

  it('deleting a count that does not exist does nothing', async () => {
    await expect(deleteSession('nope', backup)).resolves.toBeUndefined();
    expect(await getSetting('deletedSessions')).toBeUndefined();
  });

  it('outside deleteSession the append-only guard still refuses every delete', async () => {
    const a = await count(['A']);
    const seq = (await db().events.where('sessionId').equals(a.id).first())!.seq!;
    await expect(db().events.delete(seq)).rejects.toBeInstanceOf(AppendOnlyError);
    await expect(db().sessions.delete(a.id)).rejects.toBeInstanceOf(AppendOnlyError);
    await deleteSession(a.id, backup);
    // The permission ended with the deletion: another count is protected again.
    const b = await count(['B']);
    await expect(db().sessions.delete(b.id)).rejects.toBeInstanceOf(AppendOnlyError);
    await expect(db().events.where('sessionId').equals(b.id).delete()).rejects.toBeInstanceOf(AppendOnlyError);
  });

  it('a failed deletion rolls back completely', async () => {
    const a = await count(['A', 'B']);
    const original = db().settings.get.bind(db().settings);
    db().settings.get = (() => Promise.reject(new Error('disk error'))) as never; // fails at the trace step
    await expect(deleteSession(a.id, backup)).rejects.toThrow();
    db().settings.get = original as never;
    expect(await db().events.where('sessionId').equals(a.id).count()).toBe(2);
    expect(await db().sessions.get(a.id)).toBeDefined();
  });
});
