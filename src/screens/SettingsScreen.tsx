import { catalogs, DIR, LANGS, useI18n, type Lang } from '../i18n';
import { Icon } from '../ui/Icon';

interface Props {
  onLang: (l: Lang) => void;
  onBack: () => void;
}

/** Supervisor settings (reached only through the PIN gate). */
export function SettingsScreen({ onLang, onBack }: Props) {
  const { t, lang } = useI18n();
  return (
    <main class="screen">
      <header class="topbar">
        <button type="button" class="btn btn-icon" onClick={onBack} aria-label={t('back')} data-testid="back">
          <Icon name="back" flipRtl />
        </button>
        <h1>
          <Icon name="gear" /> {t('settings')}
        </h1>
      </header>

      <section class="card">
        <h2>
          <Icon name="globe" /> {t('language')}
        </h2>
        <div class="row-wrap">
          {LANGS.map((l) => (
            <button
              type="button"
              key={l}
              lang={l}
              dir={DIR[l]}
              class={l === lang ? 'btn btn-primary' : 'btn'}
              onClick={() => onLang(l)}
              data-testid={`set-lang-${l}`}
            >
              {catalogs[l].langName}
            </button>
          ))}
        </div>
      </section>

      <section class="card">
        <h2>
          <Icon name="lock" /> {t('privacyTitle')}
        </h2>
        <p>{t('privacyBody')}</p>
        <p class="hint">{t('pinNotSecurity')}</p>
      </section>

      <p class="hint">
        {t('version')}: <bdi dir="ltr">{__APP_VERSION__}</bdi>
      </p>
    </main>
  );
}
