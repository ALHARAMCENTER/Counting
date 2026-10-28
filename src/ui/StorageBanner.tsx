import { useI18n } from '../i18n';
import type { PersistState } from '../lib/storage';
import { Icon } from './Icon';

export function StorageBanner({ state, onRetry }: { state: PersistState | null; onRetry: () => void }) {
  const { t } = useI18n();
  if (state === null) return null;
  if (state === 'persisted') {
    return (
      <p class="banner banner-ok" data-testid="storage-ok">
        <Icon name="check" size={22} /> {t('storageOk')}
      </p>
    );
  }
  return (
    <div class="banner banner-warn" role="alert" data-testid="storage-warn">
      <p>
        <Icon name="warning" size={22} /> {state === 'not-persisted' ? t('storageNotPersisted') : t('storageUnknown')}
      </p>
      <button type="button" class="btn btn-small" onClick={onRetry}>
        <Icon name="refresh" size={20} /> {t('retry')}
      </button>
    </div>
  );
}
