import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { Icon, type IconName } from '../ui/Icon';

const SECTIONS: { title: MessageKey; icon: IconName; items: MessageKey[] }[] = [
  { title: 'helpInstallTitle', icon: 'download', items: ['helpInstall1', 'helpInstall2', 'helpInstall3'] },
  { title: 'helpReaderTitle', icon: 'play', items: ['helpReader1', 'helpReader2', 'helpReader3', 'helpReader4', 'helpReader5'] },
  { title: 'helpScannerCfgTitle', icon: 'gear', items: ['helpScannerCfg1', 'helpScannerCfg2', 'helpScannerCfg3', 'helpScannerCfg4'] },
  { title: 'helpPrivacyTitle', icon: 'lock', items: ['helpPrivacy1', 'helpPrivacy2', 'helpPrivacy3', 'helpPrivacy4', 'clearHowTo'] },
];

/** Offline help in the device language (the README is intentionally empty). */
export function HelpScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <main class="screen" data-testid="help">
      <header class="topbar">
        <button type="button" class="btn btn-icon" onClick={onBack} aria-label={t('back')} data-testid="back">
          <Icon name="back" flipRtl />
        </button>
        <h1>{t('helpTitle')}</h1>
      </header>
      {SECTIONS.map((s) => (
        <section class="card" key={s.title}>
          <h2>
            <Icon name={s.icon} /> {t(s.title)}
          </h2>
          <ol class="help-list">
            {s.items.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
