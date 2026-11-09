import { getSetting, setSetting } from '../db/settings';

/**
 * Device link: which branch this device counts for, and the secret that lets it
 * send a finished count to the office computer for upload.
 *
 * Each branch has its own link (`#c=701-<secret>`): the branch is fixed and
 * cannot be changed by mistake. The supervisor link (`#c=sup-<secret>`) keeps
 * the branch choice. The secret is in the `#` part of the address, which is
 * never sent to any server; it is saved on the device and then removed from the
 * address bar.
 */
export const LINK_SCOPES = ['sup', '701', '706', '707', '711', '803'] as const;

export interface DeviceLink {
  /** 'sup' (all branches) or a branch code. */
  scope: string;
  pw: string;
}

const LINK_RE = /(?:^|[#&])c=(sup|\d{3})-([A-Za-z0-9_-]{16,64})(?=&|$)/;

/** Reads `c=<scope>-<secret>` from an address hash (or a whole pasted link). */
export function parseLink(text: string): DeviceLink | null {
  const hash = text.includes('#') ? text.slice(text.indexOf('#')) : text;
  const m = LINK_RE.exec(hash.trim());
  if (!m || !(LINK_SCOPES as readonly string[]).includes(m[1]!)) return null;
  return { scope: m[1]!, pw: m[2]! };
}

export async function getDeviceLink(): Promise<DeviceLink | null> {
  const v = await getSetting<DeviceLink>('deviceLink');
  return v && typeof v.scope === 'string' && typeof v.pw === 'string' && (LINK_SCOPES as readonly string[]).includes(v.scope) ? v : null;
}

export const setDeviceLink = (l: DeviceLink | null) => setSetting('deviceLink', l);

/** The branch fixed by this device's link, or null (supervisor link, or no link). */
export const lockedBranch = (l: DeviceLink | null): string | null => (l && l.scope !== 'sup' ? l.scope : null);

/**
 * A link in the address wins over the saved one (it is saved, then removed from
 * the address bar). Returns the device link and whether it just changed.
 */
export async function takeLinkFromAddress(): Promise<{ link: DeviceLink | null; changed: boolean }> {
  const fromUrl = parseLink(location.hash);
  if (!fromUrl) return { link: await getDeviceLink(), changed: false };
  const old = await getDeviceLink();
  await setDeviceLink(fromUrl);
  history.replaceState(null, '', location.pathname + location.search);
  return { link: fromUrl, changed: !old || old.scope !== fromUrl.scope || old.pw !== fromUrl.pw };
}
