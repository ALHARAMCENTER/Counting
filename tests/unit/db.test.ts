import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { AppendOnlyError, CountingDB, setDB } from '../../src/db/db';
import { getDeviceId, getLang, setLang } from '../../src/db/settings';
import type { ScanEvent } from '../../src/db/types';

let db: CountingDB;
let n = 0;

beforeEach(() => {
  db = new CountingDB(`test-${++n}`);
  setDB(db);
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
  setDB(null);
});

const ev = (over: Partial<ScanEvent> = {}): ScanEvent => ({
  uuid: crypto.randomUUID(),
  deviceId: 'dev-1',
  sessionId: 's-1',
  type: 'scan',
  barcode: '0000000001',
  raw: '0000000001',
  ts: new Date().toISOString(),
  ...over,
});

describe('append-only scan log', () => {
  it('stores barcodes as text, keeping leading zeros', async () => {
    await db.events.add(ev({ barcode: '000123', raw: '000123' }));
    const [row] = await db.events.toArray();
    expect(row!.barcode).toBe('000123');
    expect(typeof row!.barcode).toBe('string');
  });

  it('assigns increasing sequence numbers', async () => {
    const a = await db.events.add(ev());
    const b = await db.events.add(ev());
    expect(b).toBeGreaterThan(a!);
  });

  it('rejects updates', async () => {
    const seq = await db.events.add(ev());
    await expect(db.events.update(seq!, { barcode: 'X' })).rejects.toBeInstanceOf(AppendOnlyError);
    await expect(db.events.put({ ...(await db.events.get(seq!))!, barcode: 'X' })).rejects.toThrow();
    expect((await db.events.get(seq!))!.barcode).toBe('0000000001');
  });

  it('rejects deletes and clear', async () => {
    const seq = await db.events.add(ev());
    await expect(db.events.delete(seq!)).rejects.toBeInstanceOf(AppendOnlyError);
    await expect(db.events.clear()).rejects.toThrow();
    expect(await db.events.count()).toBe(1);
  });

  it('rejects a second row with the same uuid', async () => {
    const e = ev();
    await db.events.add(e);
    await expect(db.events.add({ ...e })).rejects.toThrow();
    expect(await db.events.count()).toBe(1);
  });

  it('session and session-event logs are append-only too', async () => {
    await db.sessions.add({
      id: 's-1',
      deviceId: 'dev-1',
      branch: 'B1',
      section: 'S1',
      stand: 1,
      employee: 'E',
      createdAt: new Date().toISOString(),
    });
    await expect(db.sessions.update('s-1', { stand: 2 })).rejects.toBeInstanceOf(AppendOnlyError);
    const seq = await db.sessionEvents.add({ uuid: crypto.randomUUID(), sessionId: 's-1', type: 'open', ts: '' });
    await expect(db.sessionEvents.delete(seq!)).rejects.toBeInstanceOf(AppendOnlyError);
  });

  it('whole-database deletion (post-export wipe) still works', async () => {
    await db.events.add(ev());
    db.close();
    await Dexie.delete(db.name);
    db = new CountingDB(db.name);
    setDB(db);
    expect(await db.events.count()).toBe(0);
  });
});

describe('settings', () => {
  it('stores language and keeps a stable device id', async () => {
    expect(await getLang()).toBeUndefined();
    await setLang('ur');
    expect(await getLang()).toBe('ur');
    const id = await getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getDeviceId()).toBe(id);
  });
});
