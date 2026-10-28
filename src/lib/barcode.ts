/**
 * Barcode normalisation. Barcodes are text, always: never parse them as numbers.
 */

const ARABIC_INDIC = /[٠-٩]/g; // ٠-٩
const PERSIAN = /[۰-۹]/g; // ۰-۹
// Any Arabic-script letter means the device keyboard layout is not English:
// the reader sends key codes, Android maps them through the active layout.
const ARABIC_LETTER = /[؀-ٟ٪-ۯۺ-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
// Control characters, zero-width and bidi marks that some keyboards inject.
const INVISIBLE = /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;

export interface NormalizedBarcode {
  /** Canonical value used for matching and counting. */
  barcode: string;
  /** Exactly what was received. */
  raw: string;
  /** True when Arabic letters arrived: keyboard layout is probably wrong. */
  wrongLayout: boolean;
}

export function normalizeBarcode(raw: string): NormalizedBarcode {
  const cleaned = raw
    .replace(INVISIBLE, '')
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, '')
    .toUpperCase();
  return { barcode: cleaned, raw, wrongLayout: ARABIC_LETTER.test(cleaned) };
}
