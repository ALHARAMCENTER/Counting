/**
 * Development aid: types a barcode into the scanner field the way a
 * keyboard-wedge reader does (fast key events, then Enter), so the real input
 * path is exercised.
 */
export async function simulateScan(barcode: string, msPerChar = 4): Promise<void> {
  const el = document.querySelector<HTMLInputElement>('[data-testid="scanner-input"]');
  if (!el) return;
  el.focus();
  for (const ch of barcode) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
    el.value += ch;
    el.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
    if (msPerChar) await new Promise((r) => setTimeout(r, msPerChar));
  }
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
}
