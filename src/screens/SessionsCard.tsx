import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { AnotherSessionOpenError, reopenSession, sessionOverview } from '../db/log';
import { getDeviceId } from '../db/settings';
import { DeleteCountDialog } from './DeleteCountDialog';
import type { Session } from '../db/types';
import type { SessionState } from '../domain/sessionState';
import { Icon } from '../ui/Icon';
import { formatLocalMinute } from '../lib/time';
import { sectionLabel } from '../domain/sections';

type Row = { session: Session; state: SessionState; pieces: number };

/** Supervisor: sessions on this device; closed ones can be reopened (PIN already given). */
export function SessionsCard({ onReopened }: { onReopened: (id: string) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  const refresh = () => sessionOverview().then(setRows);
  useEffect(() => {
    refresh();
    getDeviceId().then(setDeviceId);
  }, []);
  if (!rows) return null;
  if (rows.length === 0 && !deletedNotice) return null;

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
      {deletedNotice && (
        <p class="banner banner-ok" data-testid="deleted-notice">
          <Icon name="check" size={22} /> {t('countDeleted')}
        </p>
      )}
      <ul class="list">
        {rows.map(({ session: s, state, pieces }) => (
          <li key={s.id} data-testid="session-row">
            <span class="session-info">
              <bdi dir="ltr">{s.branch}</bdi> · <bdi>{sectionLabel(t, s.section)}</bdi>
              <br />
              <span class="hint">
                <bdi>{s.employee}</bdi> · <bdi dir="ltr">{formatLocalMinute(s.createdAt)}</bdi> ·{' '}
                {t('piecesN', { n: pieces })} · {stateLabel(state)}
              </span>
            </span>
            <span class="row-wrap">
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
              {/* A count of this device that is still open cannot be deleted. */}
              {(state === 'closed' || s.deviceId !== deviceId) && (
                <button type="button" class="btn btn-small" onClick={() => setDeleting({ session: s, state, pieces })} data-testid="delete-count">
                  {t('remove')}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {deleting && (
        <DeleteCountDialog
          session={deleting.session}
          pieces={deleting.pieces}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setDeletedNotice(true);
            refresh();
          }}
        />
      )}
    </section>
  );
}
