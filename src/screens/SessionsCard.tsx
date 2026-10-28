import { useEffect, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../i18n';
import { AnotherSessionOpenError, reopenSession, sessionOverview } from '../db/log';
import type { Session } from '../db/types';
import type { SessionState } from '../domain/sessionState';
import { Icon } from '../ui/Icon';

type Row = { session: Session; state: SessionState; pieces: number };

/** Supervisor: sessions on this device; closed ones can be reopened (PIN already given). */
export function SessionsCard({ onReopened }: { onReopened: (id: string) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    sessionOverview().then(setRows);
  }, []);
  if (!rows || rows.length === 0) return null;

  const stateLabel = (s: SessionState) =>
    s === 'closed' ? t('stateClosed') : s === 'reviewing' ? t('stateReviewing') : t('stateActive');

  const reopen = async (id: string) => {
    try {
      await reopenSession(id);
      onReopened(id);
    } catch (e) {
      if (e instanceof AnotherSessionOpenError) setError(t('anotherOpen'));
      else throw e;
    }
  };

  return (
    <section class="card" data-testid="sessions">
      <h2>{t('sessionsTitle')}</h2>
      {error && (
        <p class="banner banner-warn" role="alert">
          <Icon name="warning" size={22} /> {error}
        </p>
      )}
      <ul class="list">
        {rows.map(({ session: s, state, pieces }) => (
          <li key={s.id} data-testid={`session-row-${s.section}-${s.stand}`}>
            <span class="session-info">
              <bdi>{s.section}</bdi> · {t('standLabel')} <bdi dir="ltr">{formatNumber(s.stand)}</bdi>
              <br />
              <span class="hint">
                <bdi>{s.employee}</bdi> · <bdi dir="ltr">{s.createdAt.slice(0, 16).replace('T', ' ')}</bdi> ·{' '}
                {t('piecesN', { n: pieces })} · {stateLabel(state)}
              </span>
            </span>
            {state === 'closed' &&
              (confirming === s.id ? (
                <button type="button" class="btn btn-small btn-danger" onClick={() => reopen(s.id)} data-testid="reopen-confirm">
                  {t('reopen')}?
                </button>
              ) : (
                <button type="button" class="btn btn-small" onClick={() => setConfirming(s.id)} data-testid="reopen">
                  {t('reopen')}
                </button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
