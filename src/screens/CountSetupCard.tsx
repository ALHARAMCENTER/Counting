import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { getCountSetup, setCountSetup, type CountSetup } from '../db/settings';
import { Icon } from '../ui/Icon';

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Supervisor: branch of this device. */
export function CountSetupCard() {
  const { t } = useI18n();
  const [setup, setSetup] = useState<CountSetup | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getCountSetup().then(setSetup);
  }, []);
  if (!setup) return null;

  const change = (s: CountSetup) => {
    setSaved(false);
    setSetup(s);
  };

  return (
    <section class="card">
      <h2>
        <Icon name="gear" /> {t('countSetup')}
      </h2>

      <label class="field">
        <span>{t('branchLabel')}</span>
        <input
          class="text-input"
          data-testid="setup-branch"
          value={setup.branch}
          maxLength={40}
          onInput={(e) => change({ ...setup, branch: e.currentTarget.value })}
        />
      </label>


      <button
        type="button"
        class="btn btn-primary"
        data-testid="setup-save"
        onClick={async () => {
          await setCountSetup({ ...setup, branch: clean(setup.branch) });
          setSaved(true);
        }}
      >
        <Icon name="check" /> {t('save')}
      </button>
      {saved && <p class="banner banner-ok">{t('ok')}</p>}
    </section>
  );
}
