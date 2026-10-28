/** SHA-256 hex of a string (Web Crypto). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checksum of a count result: SHA-256 over "barcode<TAB>qty" lines sorted by
 * barcode, shortened to 12 hex characters for reading aloud / comparing on
 * screen. Same data → same checksum, on any device, in any export format.
 */
export async function countChecksum(rows: readonly (readonly [string, number])[]): Promise<string> {
  const canonical = [...rows]
    .map(([b, q]) => `${b}\t${q}`)
    .sort()
    .join('\n');
  return (await sha256Hex(canonical)).slice(0, 12).toUpperCase();
}
