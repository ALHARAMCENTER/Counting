import type { DeviceLink } from './deviceLink';

/**
 * Encrypted channel to the office computer (through ntfy.sh), used only when a
 * finished count is sent for upload. Everything is encrypted on the phone with
 * a key derived from the device link's secret; ntfy only carries ciphertext.
 *
 * Request: a short encrypted message (+ for a preview, the encrypted Excel file
 * as an attachment). Reply: one encrypted, gzip-compressed attachment.
 * Must match steps/counting_upload.py on the office computer.
 */
export const NTFY = 'https://ntfy.sh';
const ITERATIONS = 200_000;
const enc = new TextEncoder();

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const sha256 = (data: Uint8Array | string) =>
  crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : (data as Uint8Array<ArrayBuffer>));

export async function topicOf(pw: string): Promise<string> {
  return 'alhc' + hex(await sha256('alharam-count-topic|' + pw)).slice(0, 26);
}

export async function keyOf(link: DeviceLink): Promise<CryptoKey> {
  const salt = new Uint8Array(await sha256('alharam-count|' + link.scope)).slice(0, 16);
  const base = await crypto.subtle.importKey('raw', enc.encode(link.pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export const fileHash = async (data: Uint8Array) => hex(await sha256(data));

/**
 * The office computer refuses requests whose time is off by minutes. A phone
 * clock can be wrong: correct it with the Date header of this app's own server.
 */
async function clockSkew(): Promise<number> {
  try {
    const r = await fetch(`./index.html?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
    const d = r.headers.get('date');
    if (d) return Math.round(new Date(d).getTime() / 1000 - Date.now() / 1000);
  } catch {
    /* offline: the request will fail anyway */
  }
  return 0;
}

export type ChannelErrorCode = 'send' | 'timeout' | 'reply';
export class ChannelError extends Error {
  constructor(public code: ChannelErrorCode) {
    super(code);
  }
}

export interface CountRequest {
  k: 'cprev' | 'ccommit';
  /** Branch (preview). */
  b?: string;
  /** SHA-256 of the Excel file (preview). */
  h?: string;
  /** Pieces in the file (preview, for the log). */
  n?: number;
  /** Approval token from the preview reply (commit). */
  t?: string;
}

async function decryptReply(key: CryptoKey, rid: string, url: string): Promise<unknown> {
  if (!url.startsWith(NTFY + '/file/')) throw new ChannelError('reply');
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12), additionalData: enc.encode(rid) }, key, buf.slice(12));
  const text = await new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}

/** Sends one request and waits for its reply (or rejects with a ChannelError). */
export async function sendRequest(link: DeviceLink, req: CountRequest, file: Uint8Array | null, timeoutMs: number): Promise<Record<string, unknown>> {
  const [key, topic, skew] = await Promise.all([keyOf(link), topicOf(link.pw), clockSkew()]);
  const id = hex(crypto.getRandomValues(new Uint8Array(8)));
  const rid = id + 'c';
  return new Promise((resolve, reject) => {
    let done = false;
    const es = new EventSource(`${NTFY}/${topic}r/sse?since=1m`);
    const finish = (err: ChannelError | null, value?: Record<string, unknown>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      es.close();
      if (err) reject(err);
      else resolve(value!);
    };
    const timer = setTimeout(() => finish(new ChannelError('timeout')), timeoutMs);
    es.onmessage = async (ev) => {
      let m: { event?: string; message?: string; attachment?: { url?: string } };
      try {
        m = JSON.parse(ev.data);
        if (m.event !== 'message' || JSON.parse(m.message ?? '{}').id !== rid) return;
      } catch {
        return;
      }
      try {
        finish(null, (await decryptReply(key, rid, m.attachment?.url ?? '')) as Record<string, unknown>);
      } catch {
        finish(new ChannelError('reply'));
      }
    };
    (async () => {
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const body = enc.encode(JSON.stringify({ id, ts: Math.floor(Date.now() / 1000) + skew, ...req }));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body));
        const msg = JSON.stringify({ i: b64(iv), c: b64(ct) });
        let res: Response;
        if (file) {
          const fiv = crypto.getRandomValues(new Uint8Array(12));
          const fct = new Uint8Array(
            await crypto.subtle.encrypt({ name: 'AES-GCM', iv: fiv, additionalData: enc.encode(id + 'f') }, key, file as Uint8Array<ArrayBuffer>),
          );
          const blob = new Uint8Array(12 + fct.length);
          blob.set(fiv);
          blob.set(fct, 12);
          res = await fetch(`${NTFY}/${topic}q`, { method: 'PUT', body: blob, headers: { Filename: 'c.bin', Message: msg } });
        } else {
          res = await fetch(`${NTFY}/${topic}q`, { method: 'POST', body: msg });
        }
        if (!res.ok) finish(new ChannelError('send'));
      } catch {
        finish(new ChannelError('send'));
      }
    })();
  });
}
