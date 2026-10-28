import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../../i18n';
import { getDB } from '../../db/db';
import type { CatalogItem } from '../../db/types';
import { getCountSetup } from '../../db/settings';
import { reconcile } from '../../domain/reconcile';
import { loadSessions } from '../../io/exporter';
import { buildCountBundle, type CountBundle } from '../../io/countExport';
import { safeText, toCsv } from '../../io/csv';
import { buildXlsx } from '../../io/xlsx';
import { CSV_TYPE, XLSX_TYPE, downloadFile, fileSafe, stamp } from '../../lib/download';
import { Icon } from '../../ui/Icon';

/** Supervisor: counted vs system, differences only, largest first. */
export function ReconcileScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const [bundle, setBundle] = useState<CountBundle | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [tolerance, setTolerance] = useState(0);

  useEffect(() => {
    (async () => {
      setCatalog(await getDB().catalog.toArray());
      const sessions = await loadSessions();
      const names = [...new Set(sessions.map((s) => s.session.branch))].sort();
      setBranches(names);
      const own = (await getCountSetup()).branch;
      setBranch(names.includes(own) ? own : (names[0] ?? ''));
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const sessions = (await loadSessions()).filter((s) => s.session.branch === branch);
      setOpenCount(sessions.filter((s) => s.state !== 'closed').length);
      setBundle(await buildCountBundle(sessions));
    })();
  }, [branch]);

  const result = useMemo(
    () => (catalog && bundle ? reconcile(catalog, new Map(bundle.count), tolerance) : null),
    [catalog, bundle, tolerance],
  );

  const tableRows = () => [
    ['Barcode', 'Name', 'System', 'Counted', 'Diff', 'In system'],
    ...(result?.rows ?? []).map((r) => [r.barcode, safeText(r.name), r.system, r.counted, r.diff, r.inSystem ? 'yes' : 'NO']),
  ];
  const fileBase = () => `diff-${fileSafe(branch)}-${stamp()}`;
  const manualPieces = bundle?.manual.reduce((a, [, q]) => a + q, 0) ?? 0;

  return (
    <main class="screen" data-testid="reconcile">
      <header class="topbar">
        <button type="button" class="btn btn-icon" onClick={onBack} aria-label={t('back')} data-testid="back">
          <Icon name="back" flipRtl />
        </button>
        <h1>{t('reconcileTitle')}</h1>
      </header>

      {catalog && catalog.length === 0 && (
        <p class="banner banner-warn" role="alert">
          <Icon name="warning" size={22} /> {t('needCatalog')}
        </p>
      )}

      <div class="row-wrap">
        {branches.length > 1 && (
          <label class="field grow">
            <span>{t('branchLabel')}</span>
            <select class="text-input" value={branch} onChange={(e) => setBranch(e.currentTarget.value)}>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        )}
        <label class="field grow">
          <span>{t('tolerance')}</span>
          <input
            class="text-input"
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={0}
            value={tolerance}
            data-testid="tolerance"
            onInput={(e) => setTolerance(Math.max(0, Math.trunc(Number(e.currentTarget.value) || 0)))}
          />
        </label>
      </div>

      {openCount > 0 && (
        <p class="banner banner-warn" role="alert">
          <Icon name="warning" size={22} /> {t('openSessionsWarn')}
        </p>
      )}
      {manualPieces > 0 && <p class="hint">{t('manualNotIncluded', { n: manualPieces })}</p>}

      {result && (
        <>
          <p class="export-facts">
            <span>
              {t('systemQty')}: <bdi dir="ltr">{formatNumber(result.systemTotal)}</bdi>
            </span>
            <span>
              {t('countedQty')}: <bdi dir="ltr">{formatNumber(result.countedTotal)}</bdi>
            </span>
            <span>{t('comparedN', { n: result.compared })}</span>
          </p>
          <div class="row-wrap">
            <button
              type="button"
              class="btn"
              data-testid="diff-csv"
              onClick={() => downloadFile(`${fileBase()}.csv`, toCsv(tableRows()), CSV_TYPE)}
            >
              {t('csv')}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="diff-xlsx"
              onClick={async () =>
                downloadFile(
                  `${fileBase()}.xlsx`,
                  await buildXlsx([{ name: 'Differences', rows: tableRows(), textColumns: [0], widths: [24, 30, 9, 9, 9, 9] }]),
                  XLSX_TYPE,
                )
              }
            >
              {t('excel')}
            </button>
          </div>
          {result.rows.length === 0 ? (
            <p class="banner banner-ok" data-testid="no-diffs">
              <Icon name="check" size={22} /> {t('noDiffs')}
            </p>
          ) : (
            <div class="table-wrap">
              <table class="diff-table" data-testid="diff-table">
                <thead>
                  <tr>
                    <th>{t('colBarcode')}</th>
                    <th>{t('systemQty')}</th>
                    <th>{t('countedQty')}</th>
                    <th>{t('diff')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.barcode}>
                      <td>
                        <bdi dir="ltr" class="mono">
                          {r.barcode}
                        </bdi>
                        <div class="hint">{r.inSystem ? r.name : t('notInSystem')}</div>
                      </td>
                      <td>
                        <bdi dir="ltr">{formatNumber(r.system)}</bdi>
                      </td>
                      <td>
                        <bdi dir="ltr">{formatNumber(r.counted)}</bdi>
                      </td>
                      <td class={r.diff < 0 ? 'bad' : 'good'}>
                        <bdi dir="ltr">{(r.diff > 0 ? '+' : '') + formatNumber(r.diff)}</bdi>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
