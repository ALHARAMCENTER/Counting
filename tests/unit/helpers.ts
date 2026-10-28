import Dexie from 'dexie';
import { afterEach, beforeEach } from 'vitest';
import { CountingDB, setDB } from '../../src/db/db';

let n = 0;

/** Gives each test a fresh, isolated database. */
export function useFreshDB(): () => CountingDB {
  let db: CountingDB;
  beforeEach(() => {
    db = new CountingDB(`t-${Date.now()}-${++n}`);
    setDB(db);
  });
  afterEach(async () => {
    db.close();
    await Dexie.delete(db.name);
    setDB(null);
  });
  return () => db;
}
