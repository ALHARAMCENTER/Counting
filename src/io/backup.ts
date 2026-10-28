import { getDB } from '../db/db';
import type { ScanEvent, Session, SessionEvent } from '../db/types';
import { parseCsv, toCsv } from './csv';
import { sha256Hex } from './checksum';

/**
 * Raw-log backup: every session, session event and scan row, unchanged, as
 * CSV. It is the safety copy written when a session closes, and the format a
 * supervisor device imports to merge counts from several devices.
 * Not meant to be edited in Excel: the last line carries a checksum and the
 * import refuses a file that does not match.
 */

export const BACKUP_HEADER = [
  'record',
  'uuid',
  'seq',
  'sessionId',
  'deviceId',
  'type',
  'barcode',
  'raw',
  'ts',
  'reversesUuid',
  'branch',
  'section',
  'stand',
  'employee',
] as const;

const MAGIC = '#COUNTING-BACKUP-V1';

type Row = string[];

export interface BackupData {
  sessions: Session[];
  sessionEvents: SessionEvent[];
  events: ScanEvent[];
}

function rowsOf(d: BackupData): Row[] {
  const rows: Row[] = [];
  for (const s of d.sessions)
    rows.push(['session', s.id, '', s.id, s.deviceId, '', '', '', s.createdAt, '', s.branch, s.section, String(s.stand), s.employee]);
  for (const e of d.sessionEvents) rows.push(['sessionEvent', e.uuid, String(e.seq ?? ''), e.sessionId, '', e.type, '', '', e.ts, '', '', '', '', '']);
  for (const e of d.events)
    rows.push(['scan', e.uuid, String(e.seq ?? ''), e.sessionId, e.deviceId, e.type, e.barcode, e.raw, e.ts, e.reversesUuid ?? '', '', '', '', '']);
  return rows;
}

const canonical = (rows: Row[]) => rows.map((r) => r.join('\u001f')).join('\u001e');

export async function backupToCsv(d: BackupData): Promise<{ csv: string; checksum: string; scans: number }> {
  const rows = rowsOf(d);
  const checksum = (await sha256Hex(canonical(rows))).toUpperCase();
  const csv = toCsv([[MAGIC], [...BACKUP_HEADER], ...rows, ['#CHECK', checksum]]);
  return { csv, checksum: checksum.slice(0, 12), scans: d.events.length };
}

export class BackupFormatError extends Error {
  constructor(public readonly reason: 'not-backup' | 'checksum' | 'malformed') {
    super(`Invalid backup file: ${reason}`);
    this.name = 'BackupFormatError';
  }
}

export async function parseBackup(text: string): Promise<BackupData> {
  const all = parseCsv(text.replace(/^﻿/, ''), ',');
  if (all[0]?.[0] !== MAGIC || all[1]?.join(',') !== BACKUP_HEADER.join(',')) throw new BackupFormatError('not-backup');
  const last = all[all.length - 1];
  if (last?.[0] !== '#CHECK') throw new BackupFormatError('malformed');
  const rows = all.slice(2, -1).map((r) => {
    const out = [...r];
    while (out.length < BACKUP_HEADER.length) out.push('');
    return out;
  });
  const expected = (await sha256Hex(canonical(rows))).toUpperCase();
  if (expected !== last[1]) throw new BackupFormatError('checksum');

  const d: BackupData = { sessions: [], sessionEvents: [], events: [] };
  for (const r of rows) {
    const [record, uuid, seq, sessionId, deviceId, type, barcode, raw, ts, reversesUuid, branch, section, stand, employee] = r as string[];
    if (record === 'session') {
      d.sessions.push({ id: uuid!, deviceId: deviceId!, branch: branch!, section: section!, stand: Number(stand), employee: employee!, createdAt: ts! });
    } else if (record === 'sessionEvent') {
      d.sessionEvents.push({ uuid: uuid!, seq: Number(seq), sessionId: sessionId!, type: type as SessionEvent['type'], ts: ts! });
    } else if (record === 'scan') {
      const e: ScanEvent = { uuid: uuid!, seq: Number(seq), sessionId: sessionId!, deviceId: deviceId!, type: type as ScanEvent['type'], barcode: barcode!, raw: raw!, ts: ts! };
      if (reversesUuid) e.reversesUuid = reversesUuid;
      d.events.push(e);
    } else throw new BackupFormatError('malformed');
  }
  return d;
}

export async function readBackupData(sessionIds?: readonly string[]): Promise<BackupData> {
  const db = getDB();
  const sessions = sessionIds ? (await db.sessions.bulkGet([...sessionIds])).filter((s): s is Session => !!s) : await db.sessions.toArray();
  const ids = new Set(sessions.map((s) => s.id));
  const sessionEvents = (await db.sessionEvents.orderBy('seq').toArray()).filter((e) => ids.has(e.sessionId));
  const events = (await db.events.orderBy('seq').toArray()).filter((e) => ids.has(e.sessionId));
  return { sessions, sessionEvents, events };
}

export interface MergeResult {
  sessionsAdded: number;
  rowsAdded: number;
  rowsSkipped: number;
}

/**
 * Adds rows from another device's backup. Rows are identified by uuid, so
 * importing the same file twice adds nothing (no double counting).
 * Original order is kept; local sequence numbers are assigned on insert.
 */
export async function mergeBackup(d: BackupData): Promise<MergeResult> {
  const db = getDB();
  const res: MergeResult = { sessionsAdded: 0, rowsAdded: 0, rowsSkipped: 0 };
  await db.transaction('rw', db.sessions, db.sessionEvents, db.events, async () => {
    for (const s of d.sessions) {
      if (await db.sessions.get(s.id)) continue;
      await db.sessions.add(s);
      res.sessionsAdded++;
    }
    const bySeq = <T extends { seq?: number }>(a: T, b: T) => (a.seq ?? 0) - (b.seq ?? 0);
    for (const e of [...d.sessionEvents].sort(bySeq)) {
      if (await db.sessionEvents.where('uuid').equals(e.uuid).count()) {
        res.rowsSkipped++;
        continue;
      }
      const { seq: _seq, ...rest } = e;
      await db.sessionEvents.add(rest);
      res.rowsAdded++;
    }
    for (const e of [...d.events].sort(bySeq)) {
      if (await db.events.where('uuid').equals(e.uuid).count()) {
        res.rowsSkipped++;
        continue;
      }
      const { seq: _seq, ...rest } = e;
      await db.events.add(rest);
      res.rowsAdded++;
    }
  });
  return res;
}
