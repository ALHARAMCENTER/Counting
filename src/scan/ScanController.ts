import { appendScan, getSessionScans } from '../db/log';
import { catalogSize, lookupBarcode } from '../db/catalog';
import type { ScanEvent, ScanEventType, Session } from '../db/types';
import { computeTally, type Tally } from '../domain/tally';
import { DoubleReadGuard, undoTarget } from '../domain/guards';
import { normalizeBarcode } from '../lib/barcode';
import { feedbackError, feedbackSuccess } from '../lib/feedback';

export interface LastScan {
  barcode: string;
  name?: string;
  type: ScanEventType;
  /** Net count of this barcode in the session after the scan. */
  countInSession: number;
  /** This piece was just taken back with Undo. */
  undone?: boolean;
}

export interface UndoCandidate {
  uuid: string;
  barcode: string;
  name?: string;
}

export type ScanAlert =
  | { kind: 'unknown'; barcode: string }
  | { kind: 'wrong-layout'; barcode: string }
  | { kind: 'save-failed'; barcode: string };

export interface ScanView {
  tally: Tally;
  last: LastScan | null;
  alert: ScanAlert | null;
  /** Rows saved while the alert was on screen. */
  savedDuringAlert: number;
  /** The only row Undo may cancel, or null. */
  undoable: UndoCandidate | null;
  /** Date.now() of the last line received from the reader. */
  lastInputAt: number;
}

export class StaleUndoError extends Error {
  constructor() {
    super('The last scan changed before Undo was confirmed');
    this.name = 'StaleUndoError';
  }
}

export interface ScanOptions {
  /** Same barcode again within this many ms is a reader double read. 0 = off. */
  doubleReadMs: number;
}

/**
 * Owns the scan pipeline for one session:
 *   line from reader → normalise → classify → durable write → feedback → UI.
 * Lines are processed strictly one at a time, in arrival order, so fast scans
 * are never lost or reordered while a write is in flight.
 */
export class ScanController {
  private events: ScanEvent[] = [];
  private queue: Promise<void> = Promise.resolve();
  private view: ScanView;
  private readonly listeners = new Set<(v: ScanView) => void>();
  private names = new Map<string, string>();
  private hasCatalog = false;
  private readonly guard: DoubleReadGuard;

  private constructor(
    readonly session: Session,
    private readonly deviceId: string,
    opts: ScanOptions,
  ) {
    this.guard = new DoubleReadGuard(opts.doubleReadMs);
    this.view = {
      tally: computeTally([]),
      last: null,
      alert: null,
      savedDuringAlert: 0,
      undoable: null,
      lastInputAt: Date.now(),
    };
  }

  static async load(session: Session, deviceId: string, opts: ScanOptions = { doubleReadMs: 0 }): Promise<ScanController> {
    const c = new ScanController(session, deviceId, opts);
    c.events = await getSessionScans(session.id);
    c.hasCatalog = (await catalogSize()) > 0;
    const tally = computeTally(c.events);
    const lastCounted = [...c.events].reverse().find((e) => e.type !== 'reversal' && e.type !== 'ignored_duplicate' && !tally.reversed.has(e.uuid));
    let last: LastScan | null = null;
    if (lastCounted) {
      const item = await lookupBarcode(lastCounted.barcode);
      last = {
        barcode: lastCounted.barcode,
        name: item?.name,
        type: lastCounted.type,
        countInSession: tally.byBarcode.get(lastCounted.barcode) ?? 0,
      };
    }
    c.view = { ...c.view, tally, last, undoable: await c.undoCandidate() };
    return c;
  }

  subscribe(l: (v: ScanView) => void): () => void {
    this.listeners.add(l);
    l(this.view);
    return () => this.listeners.delete(l);
  }

  get current(): ScanView {
    return this.view;
  }

  get allEvents(): readonly ScanEvent[] {
    return this.events;
  }

  /**
   * Accepts one complete line from the reader (Enter already received).
   * The double-read decision uses the arrival time, before any waiting.
   */
  handleLine(raw: string, at: number = performance.now()): Promise<void> {
    const n = normalizeBarcode(raw);
    if (n.barcode === '') return this.queue;
    this.update({ lastInputAt: Date.now() });
    const duplicate = this.guard.isDuplicate(n.barcode, at);
    const job = this.queue.then(() => (duplicate ? this.logDuplicate(n.barcode, n.raw) : this.process(raw)));
    this.queue = job.catch(() => undefined);
    return job;
  }

  /**
   * Runs `fn` in the same queue as scans, so a session step (review, resume,
   * close) happens exactly between the scans that arrived before and after it.
   */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const job = this.queue.then(fn);
    this.queue = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  }

  /** Resolves when every queued line has been written. */
  idle(): Promise<void> {
    return this.queue;
  }

  /**
   * Cancels the most recent scan with a reversal row. `uuid` is the row the
   * user confirmed; if another scan arrived meanwhile, nothing is written.
   */
  undo(uuid: string): Promise<void> {
    return this.enqueue(async () => {
      const target = undoTarget(this.events);
      if (!target || target.uuid !== uuid) throw new StaleUndoError();
      const row = await appendScan({
        sessionId: this.session.id,
        deviceId: this.deviceId,
        type: 'reversal',
        barcode: target.barcode,
        raw: '',
        reversesUuid: target.uuid,
      });
      this.events.push(row);
      const tally = computeTally(this.events);
      this.update({
        tally,
        last: {
          barcode: target.barcode,
          name: this.names.get(target.barcode),
          type: target.type,
          countInSession: tally.byBarcode.get(target.barcode) ?? 0,
          undone: true,
        },
        undoable: null,
      });
    });
  }

  private async undoCandidate(): Promise<UndoCandidate | null> {
    const t = undoTarget(this.events);
    if (!t) return null;
    const name = this.names.get(t.barcode) ?? (await lookupBarcode(t.barcode))?.name;
    if (name !== undefined) this.names.set(t.barcode, name);
    return { uuid: t.uuid, barcode: t.barcode, name };
  }

  private async logDuplicate(barcode: string, raw: string): Promise<void> {
    try {
      const row = await appendScan({ sessionId: this.session.id, deviceId: this.deviceId, type: 'ignored_duplicate', barcode, raw });
      this.events.push(row);
      this.update({ tally: computeTally(this.events) });
    } catch {
      // Not a piece: nothing to recount. A failure here needs no alert.
    }
  }

  acknowledgeAlert(): void {
    this.update({ alert: null, savedDuringAlert: 0 });
  }

  private async process(raw: string): Promise<void> {
    const n = normalizeBarcode(raw);

    let type: ScanEventType = 'scan';
    let name: string | undefined;
    if (n.wrongLayout) {
      type = 'unknown';
    } else if (this.hasCatalog) {
      name = this.names.get(n.barcode) ?? (await lookupBarcode(n.barcode))?.name;
      if (name === undefined) type = 'unknown';
      else this.names.set(n.barcode, name);
    }

    let row: ScanEvent;
    try {
      // 1) Durable write first. Nothing is shown or played before it commits.
      row = await appendScan({
        sessionId: this.session.id,
        deviceId: this.deviceId,
        type,
        barcode: n.barcode,
        raw: n.raw,
      });
    } catch {
      feedbackError();
      this.update({ alert: { kind: 'save-failed', barcode: n.barcode } });
      return;
    }

    this.events.push(row);
    const tally = computeTally(this.events);
    const last: LastScan = { barcode: n.barcode, name, type, countInSession: tally.byBarcode.get(n.barcode) ?? 0 };

    // 2) Feedback, 3) UI.
    const hadAlert = this.view.alert !== null;
    let alert = this.view.alert;
    if (n.wrongLayout) alert = { kind: 'wrong-layout', barcode: n.barcode };
    else if (type === 'unknown') alert = { kind: 'unknown', barcode: n.barcode };

    if (alert && (type === 'unknown' || hadAlert)) feedbackError();
    else feedbackSuccess();

    this.update({
      tally,
      last,
      alert,
      savedDuringAlert: hadAlert ? this.view.savedDuringAlert + 1 : 0,
      undoable: { uuid: row.uuid, barcode: n.barcode, name },
    });
  }

  private update(patch: Partial<ScanView>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((l) => l(this.view));
  }
}
