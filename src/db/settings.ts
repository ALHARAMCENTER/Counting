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
