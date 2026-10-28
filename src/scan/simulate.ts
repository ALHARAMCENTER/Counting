/**
 * Development aid: sends a barcode the way a keyboard-wedge reader does
 * (fast key events, then Enter) through the real app-wide input path.
 */
export async function simulateScan(barcode: string, msPerChar = 4): Promise<void> {
  const target = document.querySelector<HTMLInputElement>('[data-scanner]') ?? document.body;
  const key = (k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  for (const ch of barcode) {
    key(ch);
    if (msPerChar) await new Promise((r) => setTimeout(r, msPerChar));
  }
  key('Enter');
}
