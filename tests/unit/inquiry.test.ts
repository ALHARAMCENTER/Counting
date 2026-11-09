import { describe, expect, it } from 'vitest';
import { parseInquiryLink } from '../../src/lib/inquiry';

// FAKE link only.
const LINK = 'https://newsaleh.github.io/phone/fake-slug-123/';

describe('parseInquiryLink (only the company inquiry page can be opened)', () => {
  it('accepts the page link', () => {
    expect(parseInquiryLink(LINK)).toEqual({ ok: true, url: LINK });
    expect(parseInquiryLink(`  ${LINK}  `)).toEqual({ ok: true, url: LINK });
  });

  it('never keeps a password pasted after #, nor a query string', () => {
    expect(parseInquiryLink(`${LINK}#some-password`)).toEqual({ ok: true, url: LINK });
    expect(parseInquiryLink(`${LINK}?x=1#p`)).toEqual({ ok: true, url: LINK });
  });

  it.each([
    ['another host', 'https://example.com/phone/fake-slug-123/'],
    ['look-alike host', 'https://newsaleh.github.io.evil.example/phone/x/'],
    ['subdomain', 'https://a.newsaleh.github.io/phone/x/'],
    ['plain http', 'http://newsaleh.github.io/phone/x/'],
    ['javascript url', 'javascript:alert(1)'],
    ['data url', 'data:text/html,<p>x</p>'],
    ['not under /phone/', 'https://newsaleh.github.io/other/x/'],
    ['the folder itself', 'https://newsaleh.github.io/phone/'],
    ['credentials in the link', 'https://user:pw@newsaleh.github.io/phone/x/'],
    ['a port', 'https://newsaleh.github.io:8443/phone/x/'],
    ['not a link', 'hello'],
    ['empty', ''],
  ])('refuses %s', (_name, link) => {
    expect(parseInquiryLink(link)).toEqual({ ok: false });
  });
});
