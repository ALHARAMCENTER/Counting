import { catalogs, type Translate } from '../i18n';
import type { MessageKey } from '../i18n/en';

/**
 * The store's main sections. A session stores the stable key (e.g. "men");
 * each worker sees it in their own language, files use the Arabic name.
 */
export const SECTION_KEYS = ['men', 'women', 'boys', 'girls', 'kids', 'home', 'other'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

const isSectionKey = (s: string): s is SectionKey => (SECTION_KEYS as readonly string[]).includes(s);
const msgKey = (k: SectionKey) => `section_${k}` as MessageKey;

/** Label in the UI language; unknown values (older data) are shown as stored. */
export function sectionLabel(t: Translate, section: string): string {
  return isSectionKey(section) ? t(msgKey(section)) : section;
}

/** Name written into exported files. */
export function sectionFileName(section: string): string {
  return isSectionKey(section) ? catalogs.ar[msgKey(section)] : section;
}
