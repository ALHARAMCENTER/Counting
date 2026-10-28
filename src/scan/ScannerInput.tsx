import { useEffect, useRef } from 'preact/hooks';
import { keyboardHub } from './hub';

interface Props {
  onLine: (line: string) => void;
  /** When false the field stops grabbing focus and the screen stops taking lines. */
  active: boolean;
}

/**
 * Registers the screen as the receiver of complete reader lines, and keeps an
 * invisible field focused for readers that type through an input method.
 * - inputmode="none": no on-screen keyboard pops up.
 * - Focus is taken back after any touch and after returning to the app; taps
 *   on buttons never take it.
 * Characters themselves are collected by the app-wide keyboard hub, so a
 * screen change can never cut a barcode.
 */
export function ScannerInput({ onLine, active }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  useEffect(() => {
    if (!active) return;
    const consumer = (line: string) => onLineRef.current(line);
    keyboardHub.setConsumer(consumer);

    const focus = () => {
      const el = ref.current;
      if (el && document.activeElement !== el) el.focus({ preventScroll: true });
    };
    const later = () => setTimeout(focus, 0);
    const isTextField = (t: EventTarget | null) =>
      t instanceof HTMLElement && t !== ref.current && (t.isContentEditable || t.matches('input, textarea, select'));
    const keepFocus = (e: Event) => {
      if (!isTextField(e.target)) e.preventDefault();
    };

    focus();
    document.addEventListener('mousedown', keepFocus, true);
    document.addEventListener('pointerup', later, true);
    document.addEventListener('touchend', later, true);
    document.addEventListener('visibilitychange', later);
    window.addEventListener('focus', later);
    window.addEventListener('pageshow', later);
    const timer = setInterval(focus, 1000);
    return () => {
      keyboardHub.releaseConsumer(consumer);
      document.removeEventListener('mousedown', keepFocus, true);
      document.removeEventListener('pointerup', later, true);
      document.removeEventListener('touchend', later, true);
      document.removeEventListener('visibilitychange', later);
      window.removeEventListener('focus', later);
      window.removeEventListener('pageshow', later);
      clearInterval(timer);
    };
  }, [active]);

  return (
    <input
      ref={ref}
      class="scanner-input"
      data-testid="scanner-input"
      data-scanner=""
      type="text"
      inputMode="none"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellcheck={false}
      enterKeyHint="enter"
      aria-hidden="true"
      tabIndex={-1}
      // Text that arrives without key events (input-method readers).
      onInput={(e) => {
        const el = e.currentTarget;
        if (el.value) {
          keyboardHub.push(el.value);
          el.value = '';
        }
      }}
      onBlur={() => {
        if (active) setTimeout(() => ref.current?.focus({ preventScroll: true }), 0);
      }}
    />
  );
}
