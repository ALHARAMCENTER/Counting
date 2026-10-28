/**
 * Turns keyboard-wedge input into complete lines. A line is accepted only when
 * Enter arrives; partial input is kept until then. Text that already contains
 * line breaks (paste, some IMEs) is split into separate lines.
 */
export class LineReader {
  private buffer = '';

  constructor(private readonly onLine: (line: string) => void) {}

  /** Append text as typed. Embedded CR/LF terminate lines. */
  push(text: string): void {
    const parts = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < parts.length; i++) {
      this.buffer += parts[i];
      if (i < parts.length - 1) this.enter();
    }
  }

  /** Enter key pressed: emit the buffered line (if not blank) and reset. */
  enter(): void {
    const line = this.buffer;
    this.buffer = '';
    if (line.trim() !== '') this.onLine(line);
  }

  get pending(): string {
    return this.buffer;
  }

  clear(): void {
    this.buffer = '';
  }
}
