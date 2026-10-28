import { useI18n } from '../i18n';
import type { PersistState } from '../lib/storage';
import { Icon } from '../ui/Icon';
import { StorageBanner } from '../ui/StorageBanner';

interface Props {
  persist: PersistState | null;
  onRetryPersist: () => void;
  updateReady: boolean;
  onUpdate: () => void;
  onSettings: () => void;
}

export function HomeScreen({ persist, onRetryPersist, updateReady, onUpdate, onSettings }: Props) {
  const { t } = useI18n();
  return (
    <main class="screen">
      <header class="topbar">
        <h1>{t('homeTitle')}</h1>
      </header>
      <StorageBanner state={persist} onRetry={onRetryPersist} />
      {updateReady && (
        <div class="banner banner-info" data-testid="update-banner">
          <p>{t('updateAvailable')}</p>
          <button type="button" class="btn btn-small" onClick={onUpdate}>
            <Icon name="refresh" size={20} /> {t('updateNow')}
          </button>
        </div>
      )}
      <div class="stack grow center">
        {/* Session flow arrives in phase B. */}
        <button type="button" class="btn btn-huge btn-primary" disabled data-testid="start">
          <Icon name="play" /> {t('startCount')}
        </button>
      </div>
      <footer class="footer">
        <button type="button" class="btn btn-secondary" onClick={onSettings} data-testid="open-settings">
          <Icon name="gear" /> {t('settings')}
        </button>
      </footer>
    </main>
  );
}
