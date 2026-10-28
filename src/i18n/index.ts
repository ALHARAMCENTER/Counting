import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { ar } from './ar';
import { en, type MessageKey, type Messages } from './en';
import { ur } from './ur';

export const LANGS = ['ar', 'en', 'ur'] as const;
export type Lang = (typeof LANGS)[number];

export const catalogs: Record<Lang, Messages> = { ar, en, ur };

export const DIR: Record<Lang, 'rtl' | 'ltr'> = { ar: 'rtl', en: 'ltr', ur: 'rtl' };

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** First supported language in the device preference list, else English. */
export function detectDeviceLang(prefs: readonly string[]): Lang {
  for (const p of prefs) {
    const base = p.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function makeT(lang: Lang): Translate {
  const cat = catalogs[lang];
  return (key, params) => {
    let s = cat[key] ?? en[key];
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replaceAll(`{${k}}`, typeof v === 'number' ? formatNumber(v) : v);
      }
    }
    return s;
  };
}

// Numbers are always shown with Latin digits (0-9) in every language so that
// counts and barcodes read the same for every worker.
const numberFormat = new Intl.NumberFormat('en-US', { useGrouping: false });
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

export function applyDocumentLang(lang: Lang): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = DIR[lang];
}

export const I18nContext = createContext<{ lang: Lang; t: Translate }>({ lang: 'en', t: makeT('en') });
export const useI18n = () => useContext(I18nContext);
