import wasmUrl from '../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm?url';

type Reader = typeof import('zxing-wasm/reader');

/** Linear barcodes used on labels. Fewer formats = faster and fewer false reads. */
export const CAMERA_FORMATS = ['Code128', 'Code39', 'Code93', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Codabar'] as const;

let loading: Promise<Reader> | null = null;

/**
 * Loads the barcode decoder on first use. Its .wasm file is served by this
 * app (bundled, cached for offline use), never by a CDN: the library's default
 * CDN address is replaced here, and the page's security policy would block it.
 */
export function loadDecoder(): Promise<Reader> {
  loading ??= import('zxing-wasm/reader')
    .then(async (zx) => {
      await zx.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
        fireImmediately: true,
      });
      return zx;
    })
    .catch((e) => {
      loading = null; // allow a retry
      throw e;
    });
  return loading;
}

/** The text of the first valid barcode in the frame, or null. */
export async function decodeFrame(zx: Reader, image: ImageData): Promise<string | null> {
  const results = await zx.readBarcodes(image, {
    formats: [...CAMERA_FORMATS],
    maxNumberOfSymbols: 1,
    tryHarder: true,
    tryRotate: true,
  });
  return results.find((r) => r.isValid)?.text ?? null;
}
