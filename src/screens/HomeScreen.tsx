import { useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { feedbackError } from '../lib/feedback';
import { ScannerInput } from '../scan/ScannerInput';
import type { PersistState } from '../lib/storage';
import { Icon } from '../ui/Icon';
import { StorageBanner } from '../ui/StorageBanner';

interface Props {
  persist: PersistState | null;
  onRetryPersist: () => void;
  updateReady: boolean;
  onUpdate: () => void;
  onSettings: () => void;
  onStart: () => void;
  onExport: () => void;
  closedNotice: boolean;
}

export function HomeScreen({ persist, onRetryPersist, updateReady, onUpdate, onSettings, onStart, onExport, closedNotice }: Props) {
  const { t } = useI18n();
  const [blocked, setBlocked] = useState(false);
  return (
    <main class="screen">
      {/* No session open: a scan here is refused loudly, never silently lost. */}
      <ScannerInput
        active
        onLine={() => {
          feedbackError();
          setBlocked(true);
        }}
      />
      <header class="topbar">
        <h1>{t('homeTitle')}</h1>
      </header>
      {blocked && (
        <p class="banner banner-warn" role="alert" data-testid="not-saved">
          <Icon name="warning" size={22} /> {t('notSaved')}
        </p>
      )}
      {closedNotice && (
        <p class="banner banner-ok" data-testid="closed-notice">
          <Icon name="check" size={22} /> {t('sessionClosed')}
        </p>
      )}
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
        <button type="button" class="btn btn-huge btn-primary" onClick={onStart} data-testid="start">
          <Icon name="play" /> {t('startCount')}
        </button>
      </div>
      <footer class="footer">
        <button type="button" class="btn btn-secondary" onClick={onExport} data-testid="open-export">
          <Icon name="download" /> {t('export')}
        </button>
        <button type="button" class="btn btn-secondary" onClick={onSettings} data-testid="open-settings">
          <Icon name="gear" /> {t('settings')}
        </button>
      </footer>
    </main>
  );
}
