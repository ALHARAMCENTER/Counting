import type { PinRecord } from '../db/settings';

// The supervisor PIN is a guard against mistakes, not a security boundary:
// anyone with the device can clear the site data. It is still stored only as
// a salted PBKDF2 hash so it is never readable in plain text.

const ITERATIONS = 150_000;

export const PIN_PATTERN = /^\d{4,8}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPin(pin: string, iterations = ITERATIONS): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error('invalid PIN');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(pin, salt, iterations), iterations };
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const h = await derive(pin, fromHex(rec.salt), rec.iterations);
  // Constant-time compare (cheap; not that it matters much here).
  let diff = h.length ^ rec.hash.length;
  for (let i = 0; i < h.length && i < rec.hash.length; i++) diff |= h.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}
