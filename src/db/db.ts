import Dexie, { type EntityTable } from 'dexie';
import type { CatalogItem, ExportLogRow, ScanEvent, Session, SessionEvent, SettingRow } from './types';

export const DB_NAME = 'counting';

export class AppendOnlyError extends Error {
  constructor(table: string) {
    super(`Table "${table}" is append-only`);
    this.name = 'AppendOnlyError';
  }
}

export class CountingDB extends Dexie {
  events!: EntityTable<ScanEvent, 'seq'>;
  sessionEvents!: EntityTable<SessionEvent, 'seq'>;
  sessions!: EntityTable<Session, 'id'>;
  catalog!: EntityTable<CatalogItem, 'barcode'>;
  settings!: EntityTable<SettingRow, 'key'>;
  exportsLog!: EntityTable<ExportLogRow, 'id'>;

  constructor(name = DB_NAME) {
    // 'strict' makes Chrome flush each transaction to disk before reporting
    // success, so a scan that was acknowledged survives a sudden power loss.
    super(name, { chromeTransactionDurability: 'strict' });

    // Schema versions may only ADD stores or indexes. Never drop or rewrite data.
    this.version(1).stores({
      events: '++seq, &uuid, sessionId, [sessionId+seq], type, barcode, reversesUuid',
      sessionEvents: '++seq, &uuid, sessionId, [sessionId+seq]',
      sessions: '&id, createdAt, [branch+section+stand]',
      catalog: '&barcode, importId',
      settings: '&key',
      exportsLog: '++id, ts, sessionId',
    });

    // Enforce append-only logs at the database layer, not just by convention.
    // Wiping the device after a confirmed export deletes the whole database
    // (Dexie.delete), which does not go through these hooks.
    for (const table of [this.events, this.sessionEvents, this.sessions]) {
      table.hook('updating', () => {
        throw new AppendOnlyError(table.name);
      });
      table.hook('deleting', () => {
        throw new AppendOnlyError(table.name);
      });
    }
  }
}

let instance: CountingDB | null = null;

export function getDB(): CountingDB {
  instance ??= new CountingDB();
  return instance;
}

/** Test helper: use a fresh, isolated database. */
export function setDBForTests(db: CountingDB | null): void {
  instance = db;
}
