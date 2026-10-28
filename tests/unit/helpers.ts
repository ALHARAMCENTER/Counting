import Dexie from 'dexie';
import { afterEach, beforeEach } from 'vitest';
import { CountingDB, setDBForTests } from '../../src/db/db';

let n = 0;

/** Gives each test a fresh, isolated database. */
export function useFreshDB(): () => CountingDB {
  let db: CountingDB;
  beforeEach(() => {
    db = new CountingDB(`t-${Date.now()}-${++n}`);
    setDBForTests(db);
  });
  afterEach(async () => {
    db.close();
    await Dexie.delete(db.name);
    setDBForTests(null);
  });
  return () => db;
}
