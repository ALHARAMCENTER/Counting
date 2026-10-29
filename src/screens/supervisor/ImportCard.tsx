import { useEffect, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../../i18n';
import { analyzeImport, branchValues, guessColumns, type ColumnMap, type Table } from '../../io/catalogImport';
import { readTableFile } from '../../io/readTable';
import { catalogSize, replaceCatalog } from '../../db/catalog';
import { getLastBranch } from '../../db/settings';
import { Icon } from '../../ui/Icon';

const rowsText = (r: number[]) => r.slice(0, 10).join(', ') + (r.length > 10 ? ' …' : '');

/** Supervisor: load the system stock file (CSV or XLSX), processed on the device only. */
export function ImportCard() {
  const { t } = useI18n();
  const [table, setTable] = useState<(Table & { encoding?: string }) | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    catalogSize().then(setLoaded);
  }, [done]);

  const onFile = async (f: File | undefined) => {
    setDone(null);
    if (!f) return;
    const tbl = await readTableFile(f);
    const guess = guessColumns(tbl.rows[0] ?? []);
    const branch = (await getLastBranch()) ?? '';
    const values = branchValues(tbl, guess.branch);
    guess.branchValue = values.includes(branch) ? branch : (values[0] ?? '');
    setTable(tbl);
    setMap(guess);
  };

  const header = table?.rows[0] ?? [];
  const analysis = table && map ? analyzeImport(table, map) : null;

  const select = (key: 'barcode' | 'name' | 'qty' | 'branch', label: string, optional: boolean) =>
    map && (
      <label class="field">
        <span>{label}</span>
        <select
          class="text-input"
          data-testid={`col-${key}`}
          value={map[key]}
          onChange={(e) => {
            const next = { ...map, [key]: Number(e.currentTarget.value) };
            if (key === 'branch') next.branchValue = branchValues(table!, next.branch)[0] ?? '';
            setMap(next);
          }}
        >
          {optional && <option value={-1}>{t('none')}</option>}
          {header.map((h, i) => (
            <option key={i} value={i}>
              {h || `#${i + 1}`}
            </option>
          ))}
        </select>
      </label>
    );

  return (
    <section class="card" data-testid="import-card">
      <h2>{t('importTitle')}</h2>
      {loaded !== null && <p class="hint">{t('catalogNow', { n: loaded })}</p>}
      <label class="btn">
        {t('chooseFile')}
        <input
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv"
          class="visually-hidden"
          data-testid="import-file"
          onChange={(e) => onFile(e.currentTarget.files?.[0])}
        />
      </label>

      {table && map && analysis && (
        <>
          {table.encoding && (
            <p class="hint">
              {t('encodingLabel')}: <bdi dir="ltr">{table.encoding}</bdi>
            </p>
          )}
          {select('barcode', t('colBarcode'), false)}
          {select('name', t('colName'), true)}
          {select('qty', t('colQty'), true)}
          {select('branch', t('colBranch'), true)}
          {map.branch >= 0 && (
            <label class="field">
              <span>{t('branchLabel')}</span>
              <select
                class="text-input"
                data-testid="branch-value"
                value={map.branchValue}
                onChange={(e) => setMap({ ...map, branchValue: e.currentTarget.value })}
              >
                {branchValues(table, map.branch).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}

          <dl class="facts small" data-testid="import-stats">
            <dt>{t('importRows')}</dt>
            <dd>{formatNumber(analysis.dataRows)}</dd>
            <dt>{t('importItems')}</dt>
            <dd data-testid="import-items">{formatNumber(analysis.items.length)}</dd>
            {analysis.skippedOtherBranch > 0 && (
              <>
                <dt>{t('importSkippedBranch')}</dt>
                <dd>{formatNumber(analysis.skippedOtherBranch)}</dd>
              </>
            )}
            {analysis.emptyBarcode > 0 && (
              <>
                <dt>{t('emptyBarcodeRows')}</dt>
                <dd>{formatNumber(analysis.emptyBarcode)}</dd>
              </>
            )}
            {analysis.duplicates.length > 0 && (
              <>
                <dt>{t('importDup')}</dt>
                <dd>{formatNumber(analysis.duplicates.length)}</dd>
              </>
            )}
          </dl>

          {analysis.scientific.length > 0 && (
            <p class="banner banner-danger" role="alert" data-testid="import-sci">
              <Icon name="warning" size={22} /> {t('importSci')}: <bdi dir="ltr">{rowsText(analysis.scientific)}</bdi>
            </p>
          )}
          {analysis.badQty.length > 0 && (
            <p class="banner banner-danger" role="alert">
              <Icon name="warning" size={22} /> {t('importBadQty')}: <bdi dir="ltr">{rowsText(analysis.badQty)}</bdi>
            </p>
          )}
          {analysis.unsafeNumbers.length > 0 && (
            <p class="banner banner-danger" role="alert">
              <Icon name="warning" size={22} /> {t('importUnsafe')}: <bdi dir="ltr">{rowsText(analysis.unsafeNumbers)}</bdi>
            </p>
          )}
          {analysis.numericCells.length > 0 && (
            <p class="banner banner-warn">
              <Icon name="warning" size={22} /> {t('importNumeric')}: <bdi dir="ltr">{rowsText(analysis.numericCells)}</bdi>
            </p>
          )}

          {analysis.canImport ? (
            <button
              type="button"
              class="btn btn-primary"
              data-testid="import-confirm"
              onClick={async () => {
                await replaceCatalog(analysis.items);
                setDone(analysis.items.length);
                setTable(null);
                setMap(null);
              }}
            >
              <Icon name="check" /> {t('importConfirm')}
            </button>
          ) : (
            <p class="error">{t('importBlocked')}</p>
          )}
        </>
      )}
      {done !== null && (
        <p class="banner banner-ok" data-testid="import-done">
          {t('importDoneN', { n: done })}
        </p>
      )}
    </section>
  );
}
