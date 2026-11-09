import { describe, expect, it } from 'vitest';
import { lockedBranch, parseLink } from '../../src/link/deviceLink';
import { keyOf, topicOf } from '../../src/link/channel';

describe('device link', () => {
  it('reads a branch link and a supervisor link', () => {
    expect(parseLink('#c=701-AbCdEfGhIjKlMnOpQrSt')).toEqual({ scope: '701', pw: 'AbCdEfGhIjKlMnOpQrSt' });
    expect(parseLink('https://alharamcenter.github.io/Counting/#c=sup-AbCdEfGhIj_KlMn-OpQr')).toEqual({ scope: 'sup', pw: 'AbCdEfGhIj_KlMn-OpQr' });
    expect(parseLink('  https://x.y/Counting/#c=803-0123456789abcdefXYZ  ')).toEqual({ scope: '803', pw: '0123456789abcdefXYZ' });
  });

  it('refuses unknown branches, short secrets and other text', () => {
    expect(parseLink('#c=999-AbCdEfGhIjKlMnOpQrSt')).toBeNull();
    expect(parseLink('#c=701-short')).toBeNull();
    expect(parseLink('#c=701-AbCdEfGhIjKlMnOpQrSt!')).toBeNull();
    expect(parseLink('https://alharamcenter.github.io/Counting/')).toBeNull();
    expect(parseLink('')).toBeNull();
  });

  it('a branch link fixes the branch; the supervisor link does not', () => {
    expect(lockedBranch({ scope: '707', pw: 'x' })).toBe('707');
    expect(lockedBranch({ scope: 'sup', pw: 'x' })).toBeNull();
    expect(lockedBranch(null)).toBeNull();
  });
});

// Vectors made by the office computer (steps/counting_upload.py): same secret,
// a gzip-compressed reply encrypted for request id "abcdef0123456789" + "c".
const PW = 'TestSecret_abcdefghij123';
const VECTORS: Record<string, string> = {
  '701': 'AAECAwQFBgcICQoLdI7gBO9eC2L8CeWC+LTIyBnlzrjTq8aAiB0ZQ6k84GXEHBPx9xjAz0sA+XQYOmTCkhJsGVEIiDBmYjc9nMhTFpvokYIY0Vi0',
  sup: 'AAECAwQFBgcICQoLOSEICbWvvFJPvAgMGIyfMGYHTKNdQQWGt/kuv4k+ZXKAqKZDTW7giytTopQa5zW0hKuaISubeTlKYQyPp6e+hoqlJnv9BCaa',
};

describe('channel crypto matches the office computer', () => {
  it('derives the same topic', async () => {
    expect(await topicOf(PW)).toBe('alhc8c739677fac5bac50f873b21ba');
  });

  it.each(Object.keys(VECTORS))('decrypts and unzips a reply made by the office computer (%s)', async (scope) => {
    const key = await keyOf({ scope, pw: PW });
    const buf = Uint8Array.from(atob(VECTORS[scope]!), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12), additionalData: new TextEncoder().encode('abcdef0123456789c') }, key, buf.slice(12));
    const text = await new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    expect(JSON.parse(text)).toEqual({ ok: true, n: 3, s: 'مرحبا' });
  });

  it('the key of one branch cannot read another branch', async () => {
    const key = await keyOf({ scope: '706', pw: PW });
    const buf = Uint8Array.from(atob(VECTORS['701']!), (c) => c.charCodeAt(0));
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12), additionalData: new TextEncoder().encode('abcdef0123456789c') }, key, buf.slice(12)),
    ).rejects.toThrow();
  });
});
