/**
 * Turns the camera's stream of readings into counted pieces.
 * A camera sees the same label many times a second, so:
 *  - a code counts only after it was read `confirmReads` times in a row
 *    (a single misread of a blurred frame never counts);
 *  - once counted, the same code is ignored until it has been out of view for
 *    `releaseAfterMs`: move the next piece in and it counts again;
 *  - two different labels in view never trade places and count over and over.
 */
export interface StabilizerOptions {
  confirmReads: number;
  /** Reads of the candidate must follow each other within this time. */
  confirmWithinMs: number;
  /** A counted code is counted again only after it was absent this long. */
  releaseAfterMs: number;
}

export const DEFAULT_STABILIZER: StabilizerOptions = { confirmReads: 2, confirmWithinMs: 1000, releaseAfterMs: 900 };

export class CodeStabilizer {
  private candidate: { code: string; reads: number; lastAt: number } | null = null;
  /** Counted codes still in view: code → last time it was seen. */
  private counted = new Map<string, number>();

  constructor(private readonly o: StabilizerOptions = DEFAULT_STABILIZER) {}

  /**
   * Feed one frame's result (the code read in it, or null).
   * Returns the code when it must be counted now, otherwise null.
   */
  feed(code: string | null, now: number): string | null {
    for (const [c, seen] of this.counted) if (now - seen >= this.o.releaseAfterMs) this.counted.delete(c);
    if (this.candidate && now - this.candidate.lastAt > this.o.confirmWithinMs) this.candidate = null;
    if (code === null) return null;

    if (this.counted.has(code)) {
      this.counted.set(code, now); // still in view: stays locked
      return null;
    }
    if (this.candidate && this.candidate.code === code) {
      this.candidate.reads++;
      this.candidate.lastAt = now;
    } else {
      this.candidate = { code, reads: 1, lastAt: now };
    }
    if (this.candidate.reads < this.o.confirmReads) return null;
    this.candidate = null;
    this.counted.set(code, now);
    return code;
  }

  reset(): void {
    this.candidate = null;
    this.counted.clear();
  }
}
