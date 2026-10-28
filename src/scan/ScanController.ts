import { appendScan, getSessionScans } from '../db/log';
import { catalogSize, lookupBarcode } from '../db/catalog';
import type { ScanEvent, ScanEventType, Session } from '../db/types';
import { computeTally, type Tally } from '../domain/tally';
import { normalizeBarcode } from '../lib/barcode';
import { feedbackError, feedbackSuccess } from '../lib/feedback';

export interface LastScan {
  barcode: string;
  name?: string;
  type: ScanEventType;
  /** Net count of this barcode in the session after the scan. */
  countInSession: number;
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

  private constructor(
    readonly session: Session,
    private readonly deviceId: string,
  ) {
    this.view = { tally: computeTally([]), last: null, alert: null, savedDuringAlert: 0 };
  }

  static async load(session: Session, deviceId: string): Promise<ScanController> {
    const c = new ScanController(session, deviceId);
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
    c.view = { tally, last, alert: null, savedDuringAlert: 0 };
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

  /** Accepts one complete line from the reader (Enter already received). */
  handleLine(raw: string): Promise<void> {
    const job = this.queue.then(() => this.process(raw));
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

  acknowledgeAlert(): void {
    this.update({ alert: null, savedDuringAlert: 0 });
  }

  private async process(raw: string): Promise<void> {
    const n = normalizeBarcode(raw);
    if (n.barcode === '') return;

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
    });
  }

  private update(patch: Partial<ScanView>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((l) => l(this.view));
  }
}
