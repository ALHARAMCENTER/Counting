/**
 * Data model. The scan log (`events`) and the session log (`sessionEvents`)
 * are append-only: rows are never updated or deleted. Quantities and session
 * state are always derived from these logs.
 *
 * Barcodes are always strings — never numbers — so leading zeros survive.
 */

export type ScanEventType =
  /** A barcode found in the imported system catalogue (or no catalogue loaded). */
  | 'scan'
  /** A barcode not found in the catalogue. Counted, flagged for review. */
  | 'unknown'
  /** Typed in by hand (damaged label etc.). Exported separately. */
  | 'manual'
  /** Cancels exactly one earlier row, referenced by `reversesUuid`. */
  | 'reversal'
  /** Same barcode again within the double-read window. Logged, never counted. */
  | 'ignored_duplicate';

export interface ScanEvent {
  /** Auto-increment insertion order on this device. */
  seq?: number;
  uuid: string;
  deviceId: string;
  sessionId: string;
  type: ScanEventType;
  /** Normalised barcode text (trimmed, Latin digits, upper-case). */
  barcode: string;
  /** Exactly what arrived from the reader / keyboard, for audit. */
  raw: string;
  /** ISO 8601 timestamp from the device clock. */
  ts: string;
  /** Present only on `reversal` rows. */
  reversesUuid?: string;
}

export type SessionEventType =
  | 'open'
  /** Summary screen shown, waiting for confirmation. */
  | 'review'
  /** Back from the summary screen to scanning. */
  | 'resume'
  | 'close'
  /** Supervisor reopened a closed session with the PIN. */
  | 'reopen';

export interface SessionEvent {
  seq?: number;
  uuid: string;
  sessionId: string;
  type: SessionEventType;
  ts: string;
}

/** Immutable description of a session, written once at open. */
export interface Session {
  id: string;
  deviceId: string;
  branch: string;
  section: string;
  stand: number;
  employee: string;
  createdAt: string;
}

/** One row of the imported system stock file. */
export interface CatalogItem {
  barcode: string;
  name: string;
  /** Stock according to the system for this device's branch, if provided. */
  systemQty?: number;
  importId: string;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface ExportLogRow {
  id?: number;
  ts: string;
  scope: 'session' | 'all' | 'diff' | 'backup' | 'backup-all';
  sessionId?: string;
  fileName: string;
  totalScans: number;
  checksum: string;
  /** Set when the supervisor confirmed that the file arrived and opened. */
  confirmedAt?: string;
  /** Rows in the database when the file was made (wipe safety check). */
  dbEvents?: number;
  dbSessionEvents?: number;
}
