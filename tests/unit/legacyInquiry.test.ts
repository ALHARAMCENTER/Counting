import { describe, expect, it } from 'vitest';
import { useFreshDB } from './helpers';
import { getSetting, removeLegacyInquiryLink, setSetting } from '../../src/db/settings';

useFreshDB();

describe('removing the old private-page link', () => {
  it('forgets the saved link and leaves other settings alone', async () => {
    await setSetting('inquiryLink', 'https://example.invalid/fake');
    await setSetting('lang', 'ar');
    await removeLegacyInquiryLink();
    expect(await getSetting('inquiryLink')).toBeUndefined();
    expect(await getSetting('lang')).toBe('ar');
  });

  it('is harmless when nothing was saved', async () => {
    await expect(removeLegacyInquiryLink()).resolves.toBeUndefined();
  });
});
