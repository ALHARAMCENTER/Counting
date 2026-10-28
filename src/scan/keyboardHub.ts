import { LineReader } from '../lib/lineReader';

export type LineConsumer = (line: string) => void;

/**
 * The single receiver of reader input for the whole app, installed at start-up
 * and never removed. Characters are collected here, not in a screen, so a
 * barcode is always delivered WHOLE when its Enter arrives:
 *  - a screen that is changing can never lose the first characters of a scan
 *    (a truncated barcode could match another model);
 *  - while a session is being opened, complete lines wait and are handed to
 *    the scan screen as soon as it registers;
 *  - with no consumer at all, the whole line is refused (onRefused).
 */
export class KeyboardHub {
  private consumer: LineConsumer | null = null;
  private buffering = false;
  private pending: string[] = [];
  private lastCharAt = -Infinity;
  private readonly reader = new LineReader((line) => this.dispatch(line));

  constructor(
    private readonly onRefused: (line: string) => void,
    /** A pause longer than this inside a line means the rest never came (cable pulled). */
    private readonly maxGapMs = 1000,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Printable characters as they arrive. */
  push(text: string): void {
    const t = this.now();
    if (this.reader.pending !== '' && t - this.lastCharAt > this.maxGapMs) this.reader.clear();
    this.lastCharAt = t;
    this.reader.push(text);
  }

  enter(): void {
    this.reader.enter();
  }

  /** The current screen takes the lines (and any waiting ones). */
  setConsumer(c: LineConsumer): void {
    this.consumer = c;
    this.buffering = false;
    for (const line of this.pending.splice(0)) c(line);
  }

  /** Only the consumer that registered can unregister (screens may overlap while switching). */
  releaseConsumer(c: LineConsumer): void {
    if (this.consumer === c) this.consumer = null;
  }

  /** A session is being opened: keep complete lines for the scan screen. */
  holdForNextConsumer(): void {
    this.consumer = null;
    this.buffering = true;
  }

  /** Opening failed: drop the hold (waiting lines are refused). */
  cancelHold(): void {
    this.buffering = false;
    for (const line of this.pending.splice(0)) this.onRefused(line);
  }

  private dispatch(line: string): void {
    if (this.consumer) this.consumer(line);
    else if (this.buffering) this.pending.push(line);
    else this.onRefused(line);
  }
}

const isTextField = (t: EventTarget | null) =>
  t instanceof HTMLElement && !t.hasAttribute('data-scanner') && (t.isContentEditable || t.matches('input, textarea, select'));

/**
 * Listens on the whole document (capture phase), so keys are caught wherever
 * focus happens to be. Real text fields (names, settings) keep normal typing.
 * Enter from the reader never "clicks" a focused button.
 */
export function installKeyboardHub(hub: KeyboardHub): void {
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || isTextField(e.target)) return;
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        hub.enter();
      } else if (e.key.length === 1) {
        e.preventDefault();
        hub.push(e.key);
      }
      // Other keys (Shift, IME "Unidentified"/229 …): text arrives through the
      // scanner field's input event instead.
    },
    true,
  );
}
