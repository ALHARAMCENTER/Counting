import { getDB } from './db';
import { isLang, type Lang } from '../i18n';
import { newId } from '../lib/id';

export interface PinRecord {
  salt: string;
  hash: string;
  iterations: number;
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await getDB().settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDB().settings.put({ key, value });
}

export async function getLang(): Promise<Lang | undefined> {
  const v = await getSetting<string>('lang');
  return isLang(v) ? v : undefined;
}

export const setLang = (lang: Lang) => setSetting('lang', lang);

export const getPinRecord = () => getSetting<PinRecord>('pin');
export const setPinRecord = (rec: PinRecord) => setSetting('pin', rec);

/** Stable random id for this device, created on first use. */
export async function getDeviceId(): Promise<string> {
  const db = getDB();
  return db.transaction('rw', db.settings, async () => {
    const existing = await getSetting<string>('deviceId');
    if (existing) return existing;
    const id = newId();
    await setSetting('deviceId', id);
    return id;
  });
}

/** Supervisor-defined session choices for this device. */
export interface CountSetup {
  branch: string;
  sections: string[];
  /** Stands are picked by number from 1..maxStand. */
  maxStand: number;
}

export const DEFAULT_SETUP: CountSetup = { branch: '', sections: [], maxStand: 50 };

export async function getCountSetup(): Promise<CountSetup> {
  return { ...DEFAULT_SETUP, ...(await getSetting<Partial<CountSetup>>('setup')) };
}
export const setCountSetup = (s: CountSetup) => setSetting('setup', s);

export async function getSimulator(): Promise<boolean> {
  return (await getSetting<boolean>('simulator')) === true;
}
export const setSimulator = (on: boolean) => setSetting('simulator', on);

/** Supervisor-tunable safety thresholds. */
export interface ScanTuning {
  /** Same barcode again within this many ms is a reader double read (0 = off). */
  doubleReadMs: number;
  /** Warn when no scan arrived for this many minutes during a session (0 = off). */
  idleMinutes: number;
}

export const DEFAULT_TUNING: ScanTuning = { doubleReadMs: 300, idleMinutes: 5 };

export async function getTuning(): Promise<ScanTuning> {
  return { ...DEFAULT_TUNING, ...(await getSetting<Partial<ScanTuning>>('tuning')) };
}
export const setTuning = (t: ScanTuning) => setSetting('tuning', t);
