import { getDB, CountingDB, setDB } from '../db/db';
import { getSessionScans, listSessions } from '../db/log';
import type { ExportLogRow, SettingRow } from '../db/types';
import { getCountSetup } from '../db/settings';
import { CSV_TYPE, XLSX_TYPE, downloadFile, fileSafe, stamp } from '../lib/download';
import { backupToCsv, readBackupData } from './backup';
import { buildCountBundle, checkRow, type CountBundle, type SessionWithLog } from './countExport';
import { safeText, toCsv } from './csv';
import { buildXlsx } from './xlsx';
import Dexie from 'dexie';
import { sectionFileName } from '../domain/sections';

export async function loadSessions(ids?: readonly string[]): Promise<SessionWithLog[]> {
  const all = await listSessions();
  const chosen = ids ? all.filter((s) => ids.includes(s.session.id)) : all;
  // Oldest first in files.
  chosen.reverse();
  return Promise.all(chosen.map(async (s) => ({ ...s, events: await getSessionScans(s.session.id) })));
}

export async function bundleFor(ids?: readonly string[]): Promise<CountBundle> {
  return buildCountBundle(await loadSessions(ids));
}

async function logExport(row: Omit<ExportLogRow, 'id' | 'ts' | 'dbEvents' | 'dbSessionEvents'>): Promise<number> {
  const db = getDB();
  return (await db.exportsLog.add({
    ...row,
    ts: new Date().toISOString(),
    dbEvents: await db.events.count(),
    dbSessionEvents: await db.sessionEvents.count(),
  })) as number;
}

function baseName(bundle: CountBundle, branch: string, scope: 'session' | 'all'): string {
  const s = bundle.sessions[0]?.session;
  const what = scope === 'session' && s ? `${fileSafe(s.section)}-${s.stand}` : 'ALL';
  return `count-${fileSafe(branch || s?.branch || 'branch')}-${what}-${stamp()}`;
}

const sessionsSheetRows = (b: CountBundle): (string | number)[][] => [
  ['Branch', 'Section', 'Stand', 'Employee', 'Started', 'State', 'Pieces', 'Session ID', 'Device ID'],
  ...b.sessions.map(({ session: s, state, pieces }) => [
    safeText(s.branch),
    safeText(sectionFileName(s.section)),
    s.stand,
    safeText(s.employee),
    s.createdAt,
    state,
    pieces,
    s.id,
    s.deviceId,
  ]),
];

/** Count file(s): Barcode + Qty, then the verification row. */
export async function exportCount(scope: 'session' | 'all', ids: readonly string[] | undefined, format: 'csv' | 'xlsx') {
  const bundle = await bundleFor(ids);
  const branch = (await getCountSetup()).branch;
  const name = baseName(bundle, branch, scope);
  const check = checkRow(bundle);

  if (format === 'csv') {
    downloadFile(`${name}.csv`, toCsv([['Barcode', 'Qty'], ...bundle.count, check]), CSV_TYPE);
    if (bundle.manual.length) {
      downloadFile(`${name}-manual.csv`, toCsv([['Manual entry', 'Qty'], ...bundle.manual.map(([k, q]) => [safeText(k), q])]), CSV_TYPE);
    }
  } else {
    const data = await buildXlsx([
      { name: 'Count', rows: [['Barcode', 'Qty'], ...bundle.count], textColumns: [0], widths: [24, 8] },
      { name: 'Unknown', rows: [['Barcode', 'Qty'], ...bundle.unknown], textColumns: [0], widths: [24, 8] },
      { name: 'Manual', rows: [['Manual entry', 'Qty'], ...bundle.manual.map(([k, q]) => [safeText(k), q])], textColumns: [0], widths: [30, 8] },
      { name: 'Sessions', rows: sessionsSheetRows(bundle), widths: [14, 14, 6, 16, 22, 10, 8, 38, 38] },
      {
        name: 'Check',
        rows: [
          ['Total pieces', bundle.totalPieces],
          ['Checksum', bundle.checksum],
          ['Barcodes', bundle.count.length],
          ['Unknown pieces', bundle.unknown.reduce((a, [, q]) => a + q, 0)],
          ['Manual pieces', bundle.manual.reduce((a, [, q]) => a + q, 0)],
          ['Double reads ignored', bundle.ignoredDuplicates],
          ['Exported at', new Date().toISOString()],
        ],
        widths: [22, 26],
      },
    ]);
    downloadFile(`${name}.xlsx`, data, XLSX_TYPE);
  }
  const fileName = `${name}.${format}`;
  await logExport({
    scope,
    sessionId: scope === 'session' ? ids?.[0] : undefined,
    fileName,
    totalScans: bundle.totalPieces,
    checksum: bundle.checksum,
  });
  return { bundle, fileName };
}

/** Raw-log backup of some or all sessions (the file used for merging and before wiping). */
export async function exportBackup(ids?: readonly string[]): Promise<{ fileName: string; checksum: string; id: number }> {
  const data = await readBackupData(ids);
  const { csv, checksum, scans } = await backupToCsv(data);
  const branch = (await getCountSetup()).branch;
  const s = data.sessions[0];
  const what = ids && ids.length === 1 && s ? `${fileSafe(s.section)}-${s.stand}` : 'ALL';
  const fileName = `backup-${fileSafe(branch || s?.branch || 'branch')}-${what}-${stamp()}.csv`;
  downloadFile(fileName, csv, CSV_TYPE);
  const id = await logExport({ scope: ids ? 'backup' : 'backup-all', sessionId: ids?.[0], fileName, totalScans: scans, checksum });
  return { fileName, checksum, id };
}

export async function latestFullBackup(): Promise<ExportLogRow | undefined> {
  const rows = await getDB().exportsLog.orderBy('ts').reverse().toArray();
  return rows.find((r) => r.scope === 'backup-all');
}

export async function confirmExport(id: number): Promise<void> {
  await getDB().exportsLog.update(id, { confirmedAt: new Date().toISOString() });
}

/**
 * Wiping is allowed only after a full backup that the supervisor confirmed
 * was received and opened, and only if nothing was added since that backup.
 */
export async function canWipe(): Promise<{ ok: boolean; backup?: ExportLogRow }> {
  const backup = await latestFullBackup();
  if (!backup?.confirmedAt) return { ok: false, backup };
  const db = getDB();
  const unchanged = backup.dbEvents === (await db.events.count()) && backup.dbSessionEvents === (await db.sessionEvents.count());
  return { ok: unchanged, backup };
}

/** Deletes all count data and the system file; keeps language, PIN and setup. */
export async function wipeCountData(): Promise<void> {
  const check = await canWipe();
  if (!check.ok) throw new Error('A confirmed full backup is required before wiping');
  const db = getDB();
  const keep: SettingRow[] = await db.settings.toArray();
  const name = db.name;
  db.close();
  await Dexie.delete(name);
  const fresh = new CountingDB(name);
  setDB(fresh);
  await fresh.settings.bulkPut(keep);
}
