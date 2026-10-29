import { useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { deleteSession } from '../db/log';
import type { Session } from '../db/types';
import { sectionLabel } from '../domain/sections';
import { confirmExport, exportBackup } from '../io/exporter';
import { formatLocalMinute } from '../lib/time';
import { Icon } from '../ui/Icon';

interface Props {
  session: Session;
  pieces: number;
  onClose: () => void;
  onDeleted: () => void;
}

interface Copy {
  id: number;
  fileName: string;
  checksum: string;
}

/**
 * Deleting one count, in three steps so nothing is lost by accident:
 * save a copy → confirm it arrived and opened → delete (two taps).
 */
export function DeleteCountDialog({ session, pieces, onClose, onDeleted }: Props) {
  const { t } = useI18n();
  const [copy, setCopy] = useState<Copy | null>(null);
  const [received, setReceived] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveCopy = async () => {
    setBusy(true);
    try {
      setCopy(await exportBackup([session.id]));
    } finally {
      setBusy(false);
    }
  };

  const confirmReceived = async () => {
    await confirmExport(copy!.id);
    setReceived(true);
  };

  const remove = async () => {
    if (!sure) return setSure(true);
    setBusy(true);
    try {
      await deleteSession(session.id, { fileName: copy!.fileName, checksum: copy!.checksum });
      onDeleted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" data-testid="delete-dialog">
        <h2>
          <Icon name="warning" /> {t('deleteTitle')}
        </h2>
        <p class="dialog-name">
          <bdi dir="ltr">{session.branch}</bdi> · <bdi>{sectionLabel(t, session.section)}</bdi>
        </p>
        <p class="hint">
          <bdi>{session.employee}</bdi> · <bdi dir="ltr">{formatLocalMinute(session.createdAt)}</bdi> ·{' '}
          <strong>{t('piecesN', { n: pieces })}</strong>
        </p>
        <p class="banner banner-warn">{t('deleteWarn')}</p>

        {!copy ? (
          <>
            <p>{t('deleteStep1')}</p>
            <button type="button" class="btn btn-primary" disabled={busy} onClick={saveCopy} data-testid="delete-save-copy">
              <Icon name="download" /> {t('saveCopy')}
            </button>
          </>
        ) : (
          <>
            <p class="hint">
              {t('copySaved')} <bdi dir="ltr" class="mono">{copy.fileName}</bdi>
              <br />
              {t('checksumLabel')}: <bdi dir="ltr" class="mono">{copy.checksum}</bdi>
            </p>
            {!received ? (
              <button type="button" class="btn" onClick={confirmReceived} data-testid="delete-received">
                <Icon name="check" /> {t('deleteConfirmReceived')}
              </button>
            ) : (
              <>
                {sure && <p class="error">{t('wipeSure')}</p>}
                <button type="button" class="btn btn-danger" disabled={busy} onClick={remove} data-testid="delete-forever">
                  <Icon name="warning" /> {t('deleteForever')}
                </button>
              </>
            )}
          </>
        )}

        <button type="button" class="btn" onClick={onClose} data-testid="delete-cancel">
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

