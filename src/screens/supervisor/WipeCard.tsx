import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../../i18n';
import { canWipe, confirmExport, wipeCountData } from '../../io/exporter';
import type { ExportLogRow } from '../../db/types';
import { Icon } from '../../ui/Icon';

/**
 * Supervisor: delete count data, only after a full backup that the
 * supervisor confirms was received and opened, with nothing added since.
 */
export function WipeCard({ onWiped }: { onWiped: () => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ ok: boolean; backup?: ExportLogRow } | null>(null);
  const [sure, setSure] = useState(false);

  const refresh = () => canWipe().then(setState);
  useEffect(() => {
    refresh();
  }, []);
  if (!state) return null;
  const b = state.backup;

  return (
    <section class="card" data-testid="wipe-card">
      <h2>
        <Icon name="warning" /> {t('wipeTitle')}
      </h2>
      {!b && <p class="hint">{t('wipeNeedBackup')}</p>}
      {b && (
        <div class="field">
          <span>{t('lastBackup')}</span>
          <bdi dir="ltr" class="mono">
            {b.fileName}
          </bdi>
          <span>
            {t('checksumLabel')}: <bdi dir="ltr" class="mono">{b.checksum}</bdi>
          </span>
          {b.confirmedAt ? (
            <span class="banner banner-ok">
              <Icon name="check" size={22} /> {t('confirmedLabel')}
            </span>
          ) : (
            <button
              type="button"
              class="btn"
              data-testid="wipe-confirm-received"
              onClick={async () => {
                await confirmExport(b.id!);
                refresh();
              }}
            >
              <Icon name="check" /> {t('wipeConfirmReceived')}
            </button>
          )}
        </div>
      )}
      {b?.confirmedAt && !state.ok && <p class="banner banner-warn">{t('wipeChanged')}</p>}
      {state.ok && (
        <>
          {sure && <p class="error">{t('wipeSure')}</p>}
          <button
            type="button"
            class={sure ? 'btn btn-danger' : 'btn'}
            data-testid="wipe"
            onClick={async () => {
              if (!sure) return setSure(true);
              await wipeCountData();
              onWiped();
            }}
          >
            <Icon name="warning" /> {t('wipeBtn')}
          </button>
        </>
      )}
      <p class="hint">{t('clearHowTo')}</p>
    </section>
  );
}
