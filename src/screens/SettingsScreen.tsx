import { useEffect, useState } from 'preact/hooks';
import { catalogs, DIR, LANGS, useI18n, type Lang } from '../i18n';
import { getSimulator, setSimulator } from '../db/settings';
import { DEMO_CATALOG, replaceCatalog } from '../db/catalog';
import { Icon } from '../ui/Icon';
import { BranchesCard } from './BranchesCard';
import { SessionsCard } from './SessionsCard';
import { TuningCard } from './TuningCard';
import { ImportCard } from './supervisor/ImportCard';
import { MergeCard } from './supervisor/MergeCard';
import { WipeCard } from './supervisor/WipeCard';
import { PinGate } from '../ui/PinGate';

interface Props {
  onLang: (l: Lang) => void;
  onBack: () => void;
  onReopened: (sessionId: string) => void;
  onReconcile: () => void;
  onHelp: () => void;
  onWiped: () => void;
  /** Supervisor PIN given during this visit to settings. */
  unlocked: boolean;
  onUnlock: () => void;
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Settings open without the PIN (language, help, differences). Everything that
 * can change or remove count data sits under "Supervisor settings", which asks
 * for the PIN once per visit.
 */
export function SettingsScreen({ onLang, onBack, onReopened, onReconcile, onHelp, onWiped, unlocked, onUnlock }: Props) {
  const { t, lang } = useI18n();
  const [askPin, setAskPin] = useState(false);
  const [sim, setSim] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  useEffect(() => {
    getSimulator().then(setSim);
  }, []);

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

      <button type="button" class="btn" onClick={onHelp} data-testid="open-help">
        {t('help')}
      </button>

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

      {isIOS() && (
        <p class="banner banner-warn" data-testid="ios-note">
          <Icon name="warning" size={22} /> {t('iosNote')}
        </p>
      )}

      <button type="button" class="btn btn-huge btn-primary" onClick={onReconcile} data-testid="open-reconcile">
        {t('openReconcile')}
      </button>

      {unlocked ? (
        <>
          <h2 class="section-title">
            <Icon name="lock" /> {t('supervisorSettings')}
          </h2>
          <ImportCard />

          <SessionsCard onReopened={onReopened} />

          <MergeCard />

          <BranchesCard />

          <TuningCard />

          <section class="card">
            <h2>{t('simulator')}</h2>
            <div class="row-wrap">
              <button
                type="button"
                class={sim ? 'btn btn-primary' : 'btn'}
                data-testid="sim-toggle"
                onClick={async () => {
                  await setSimulator(!sim);
                  setSim(!sim);
                }}
              >
                {sim ? t('on') : t('off')}
              </button>
              {sim && (
                <button
                  type="button"
                  class="btn"
                  data-testid="load-demo"
                  onClick={async () => {
                    await replaceCatalog(DEMO_CATALOG);
                    setDemoLoaded(true);
                  }}
                >
                  {t('loadDemo')}
                </button>
              )}
            </div>
            {demoLoaded && <p class="banner banner-ok">{t('demoLoaded')}</p>}
          </section>

          <WipeCard onWiped={onWiped} />

        </>
      ) : askPin ? (
        <PinGate onSuccess={onUnlock} onCancel={() => setAskPin(false)} />
      ) : (
        <button type="button" class="btn btn-huge" onClick={() => setAskPin(true)} data-testid="unlock-supervisor">
          <Icon name="lock" /> {t('supervisorSettings')}
        </button>
      )}

      <section class="card">
        <h2>
          <Icon name="lock" /> {t('privacyTitle')}
        </h2>
        <p>{t('privacyBody')}</p>
        <p class="hint">{t('pinNotSecurity')}</p>
      </section>

      <p class="hint">
        {t('version')}: <bdi dir="ltr">{__APP_VERSION__} · {__BUILD_ID__}</bdi>
      </p>
    </main>
  );
}
