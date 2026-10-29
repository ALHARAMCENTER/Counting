import { getDB } from './db';
import { isLang, type Lang } from '../i18n';
import { newId } from '../lib/id';

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

/** Branches a worker can pick when starting a count. The supervisor can add and remove. */
export const DEFAULT_BRANCHES = ['701', '706', '707', '711', '803'];
export const MAX_BRANCHES = 30;

/** Trimmed, single spaces, at most 20 characters. */
export const cleanBranchName = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 20);

export async function getBranches(): Promise<string[]> {
  const saved = await getSetting<unknown>('branches');
  return Array.isArray(saved) ? saved.filter((b): b is string => typeof b === 'string') : [...DEFAULT_BRANCHES];
}
export const setBranches = (list: string[]) => setSetting('branches', list);

/** Branch of the last count started on this device (shown as a hint, and default in reports). */
export const getLastBranch = () => getSetting<string>('lastBranch');
export const setLastBranch = (b: string) => setSetting('lastBranch', b);

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
