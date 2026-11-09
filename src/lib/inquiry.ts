/**
 * The supervisor's own inquiry page (a separate app of the company, published
 * under this host). It is opened inside this app, only after the supervisor
 * pastes its link. The link is kept on the device and is NEVER part of this
 * repository, which is public. The page asks for its own password inside the
 * page: this app never sees or stores it (anything after "#" is dropped).
 */
export const INQUIRY_HOST = 'newsaleh.github.io';
const INQUIRY_PATH_PREFIX = '/phone/';

export type InquiryLinkResult = { ok: true; url: string } | { ok: false };

/** Accepts only https://<INQUIRY_HOST>/phone/<something>/ and returns it without query or "#...". */
export function parseInquiryLink(link: string): InquiryLinkResult {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return { ok: false };
  }
  if (u.protocol !== 'https:' || u.hostname !== INQUIRY_HOST || u.port !== '' || u.username !== '' || u.password !== '') return { ok: false };
  if (!u.pathname.startsWith(INQUIRY_PATH_PREFIX) || u.pathname === INQUIRY_PATH_PREFIX) return { ok: false };
  u.search = '';
  u.hash = '';
  return { ok: true, url: u.toString() };
}
