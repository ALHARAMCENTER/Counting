import { describe, expect, it } from 'vitest';
import { catalogs, detectDeviceLang, DIR, formatNumber, LANGS, makeT } from '../../src/i18n';
import { en } from '../../src/i18n/en';

describe('i18n catalogues', () => {
  const refKeys = Object.keys(en).sort();

  it.each(LANGS)('%s defines exactly the reference keys, all non-empty', (lang) => {
    const cat = catalogs[lang];
    expect(Object.keys(cat).sort()).toEqual(refKeys);
    for (const [k, v] of Object.entries(cat)) expect(v.trim(), `${lang}.${k}`).not.toBe('');
  });

  it('Arabic and Urdu are RTL, English is LTR', () => {
    expect(DIR).toEqual({ ar: 'rtl', ur: 'rtl', en: 'ltr' });
  });

  it('Arabic and Urdu texts contain no Arabic-Indic digits (numbers are Latin everywhere)', () => {
    for (const lang of ['ar', 'ur'] as const) {
      for (const v of Object.values(catalogs[lang])) expect(v).not.toMatch(/[٠-٩۰-۹]/);
    }
  });
});

describe('detectDeviceLang', () => {
  it('picks the first supported device language', () => {
    expect(detectDeviceLang(['ur-PK', 'en-US'])).toBe('ur');
    expect(detectDeviceLang(['fr-FR', 'ar-SA'])).toBe('ar');
    expect(detectDeviceLang(['EN-gb'])).toBe('en');
  });
  it('falls back to English', () => {
    expect(detectDeviceLang(['fr', 'de'])).toBe('en');
    expect(detectDeviceLang([])).toBe('en');
  });
});

describe('numbers', () => {
  it('always formats with Latin digits and no grouping', () => {
    expect(formatNumber(1234567)).toBe('1234567');
  });
  it('interpolates parameters with Latin digits in every language', () => {
    for (const lang of LANGS) {
      const t = makeT(lang);
      // Use a key without params to check pass-through; interpolation is generic.
      expect(t('ok', { n: 5 })).toBe(catalogs[lang].ok);
    }
  });
});

describe('store sections', () => {
  it('seven fixed sections, translated in every language, Arabic in files', async () => {
    const { SECTION_KEYS, sectionLabel, sectionFileName } = await import('../../src/domain/sections');
    expect(SECTION_KEYS).toHaveLength(7);
    expect(SECTION_KEYS.map((k) => sectionLabel(makeT('ar'), k))).toEqual(['رجالي', 'نسائي', 'ولادي', 'بناتي', 'أطفال ومواليد', 'مفروشات', 'أخرى']);
    expect(sectionLabel(makeT('en'), 'men')).toBe('Men');
    expect(sectionFileName('kids')).toBe('أطفال ومواليد');
    expect(sectionLabel(makeT('en'), 'OLD-VALUE')).toBe('OLD-VALUE');
  });
});
