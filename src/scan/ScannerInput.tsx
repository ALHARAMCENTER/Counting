import { useEffect, useRef } from 'preact/hooks';
import { LineReader } from '../lib/lineReader';

interface Props {
  onLine: (line: string) => void;
  /** When false the field stops grabbing focus (e.g. while a dialog needs typing). */
  active: boolean;
}

/**
 * Invisible text field that receives the keyboard-wedge reader.
 * - inputmode="none": no on-screen keyboard pops up.
 * - Focus is taken back after any touch, after returning to the app, and
 *   whenever the field loses it, so a stray tap cannot "steal" scans.
 * - A line counts only when Enter arrives.
 */
export function ScannerInput({ onLine, active }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;
  const reader = useRef(new LineReader((l) => onLineRef.current(l)));

  const flushValue = (el: HTMLInputElement) => {
    if (el.value) {
      reader.current.push(el.value);
      el.value = '';
    }
  };

  useEffect(() => {
    if (!active) return;
    const focus = () => {
      const el = ref.current;
      if (el && document.activeElement !== el) el.focus({ preventScroll: true });
    };
    const later = () => setTimeout(focus, 0);
    const isTextField = (t: EventTarget | null) =>
      t instanceof HTMLElement && t !== ref.current && (t.isContentEditable || t.matches('input, textarea, select'));

    // Taps on buttons must not take focus away from the reader field, or the
    // first characters of the next scan would be lost (a truncated barcode).
    const keepFocus = (e: Event) => {
      if (!isTextField(e.target)) e.preventDefault();
    };
    // Belt and braces: any key that still lands elsewhere is routed here.
    const routeKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el || e.target === el || isTextField(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        flushValue(el);
        reader.current.enter();
      } else if (e.key.length === 1) {
        e.preventDefault();
        reader.current.push(e.key);
      }
      focus();
    };
    focus();
    document.addEventListener('mousedown', keepFocus, true);
    document.addEventListener('keydown', routeKey, true);
    document.addEventListener('pointerup', later, true);
    document.addEventListener('touchend', later, true);
    document.addEventListener('visibilitychange', later);
    window.addEventListener('focus', later);
    window.addEventListener('pageshow', later);
    const timer = setInterval(focus, 1000);
    return () => {
      document.removeEventListener('mousedown', keepFocus, true);
      document.removeEventListener('keydown', routeKey, true);
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
      type="text"
      inputMode="none"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellcheck={false}
      enterKeyHint="enter"
      aria-hidden="true"
      tabIndex={-1}
      onInput={(e) => flushValue(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          flushValue(e.currentTarget);
          reader.current.enter();
        }
      }}
      onBlur={() => {
        if (active) setTimeout(() => ref.current?.focus({ preventScroll: true }), 0);
      }}
    />
  );
}
