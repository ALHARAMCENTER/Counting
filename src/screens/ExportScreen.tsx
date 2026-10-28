import { useEffect, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../i18n';
import type { CountBundle } from '../io/countExport';
import { bundleFor, exportBackup, exportCount, loadSessions } from '../io/exporter';
import type { Session } from '../db/types';
import type { SessionState } from '../domain/sessionState';
import { Icon } from '../ui/Icon';

interface Entry {
  session: Session;
  state: SessionState;
  bundle: CountBundle;
}

/**
 * Export without PIN: exporting never changes data. Each line shows the same
 * total and check code that the file will contain.
 */
export function ExportScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [all, setAll] = useState<CountBundle | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [done, setDone] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sessions = await loadSessions();
      setAll(await bundleFor());
      setEntries(
        await Promise.all(
          sessions.reverse().map(async (s) => ({ session: s.session, state: s.state, bundle: await bundleFor([s.session.id]) })),
        ),
      );
    })();
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      setDone(await fn());
    } finally {
      setBusy(false);
    }
  };

  const buttons = (scope: 'session' | 'all', ids: string[] | undefined, testId: string) => (
    <div class="row-wrap">
      <button
        type="button"
        class="btn"
        disabled={busy}
        data-testid={`${testId}-csv`}
        onClick={() => run(async () => (await exportCount(scope, ids, 'csv')).fileName)}
      >
        {t('csv')}
      </button>
      <button
        type="button"
        class="btn btn-primary"
        disabled={busy}
        data-testid={`${testId}-xlsx`}
        onClick={() => run(async () => (await exportCount(scope, ids, 'xlsx')).fileName)}
      >
        {t('excel')}
      </button>
    </div>
  );

  const facts = (b: CountBundle, testId: string) => (
    <p class="export-facts">
      <span>
        {t('totalLabel')}: <bdi dir="ltr" data-testid={`${testId}-total`}>{formatNumber(b.totalPieces)}</bdi>
      </span>
      <span>
        {t('checksumLabel')}: <bdi dir="ltr" class="mono" data-testid={`${testId}-checksum`}>{b.checksum}</bdi>
      </span>
    </p>
  );

  const anyOpen = entries?.some((e) => e.state !== 'closed');

  return (
    <main class="screen" data-testid="export-screen">
      <header class="topbar">
        <button type="button" class="btn btn-icon" onClick={onBack} aria-label={t('back')} data-testid="back">
          <Icon name="back" flipRtl />
        </button>
        <h1>{t('exportTitle')}</h1>
      </header>

      {done && (
        <p class="banner banner-ok" data-testid="export-done">
          <Icon name="check" size={22} /> {t('exportDone', { name: '' })}
          <bdi dir="ltr" class="mono">
            {done}
          </bdi>
        </p>
      )}
      {anyOpen && (
        <p class="banner banner-warn" role="alert">
          <Icon name="warning" size={22} /> {t('openSessionsWarn')}
        </p>
      )}

      {entries && entries.length === 0 && <p class="hint">{t('noSessions')}</p>}

      {all && entries && entries.length > 0 && (
        <>
          <section class="card" data-testid="export-all">
            <h2>{t('exportAll')}</h2>
            {facts(all, 'all')}
            {buttons('all', undefined, 'all')}
          </section>

          <section class="card">
            <h2>{t('backupAll')}</h2>
            <p class="hint">{t('backupHint')}</p>
            <button
              type="button"
              class="btn"
              disabled={busy}
              data-testid="backup-all"
              onClick={() => run(async () => (await exportBackup()).fileName)}
            >
              <Icon name="lock" /> {t('backupAll')}
            </button>
          </section>

          {entries.map((e) => (
            <section class="card" key={e.session.id} data-testid={`export-${e.session.section}-${e.session.stand}`}>
              <h2>
                <bdi>{e.session.section}</bdi> · {t('standLabel')} <bdi dir="ltr">{formatNumber(e.session.stand)}</bdi>
              </h2>
              <p class="hint">
                <bdi>{e.session.employee}</bdi> · <bdi dir="ltr">{e.session.createdAt.slice(0, 16).replace('T', ' ')}</bdi> ·{' '}
                {e.state === 'closed' ? t('stateClosed') : t('stateActive')}
              </p>
              {facts(e.bundle, 'session')}
              {buttons('session', [e.session.id], `s-${e.session.stand}`)}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
