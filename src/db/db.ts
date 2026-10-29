import Dexie, { type EntityTable, type Table } from 'dexie';
import type { CatalogItem, ExportLogRow, ScanEvent, Session, SessionEvent, SettingRow } from './types';

export const DB_NAME = 'counting';

export class AppendOnlyError extends Error {
  constructor(table: string) {
    super(`Table "${table}" is append-only`);
    this.name = 'AppendOnlyError';
  }
}

/**
 * The ONLY way rows of the append-only tables can be deleted: a supervisor
 * deleting one whole count, through deleteSession. While it runs, the hooks
 * accept exactly that session's rows; anything else is still refused.
 */
let deletionAllowedFor: string | null = null;

export async function withSessionDeletion<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  deletionAllowedFor = sessionId;
  try {
    return await fn();
  } finally {
    deletionAllowedFor = null;
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
    const guard = (table: Table<any, any>, owner: (row: any) => string | undefined) => {
      table.hook('updating', () => {
        throw new AppendOnlyError(table.name);
      });
      table.hook('deleting', (_key, row) => {
        if (deletionAllowedFor !== null && owner(row) === deletionAllowedFor) return;
        throw new AppendOnlyError(table.name);
      });
    };
    guard(this.events, (r) => r.sessionId);
    guard(this.sessionEvents, (r) => r.sessionId);
    guard(this.sessions, (r) => r.id);
  }
}

let instance: CountingDB | null = null;

export function getDB(): CountingDB {
  instance ??= new CountingDB();
  return instance;
}

/** Switches to another database instance (tests; re-open after a wipe). */
export function setDB(db: CountingDB | null): void {
  instance = db;
}
