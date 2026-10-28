import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { getTuning, setTuning, type ScanTuning } from '../db/settings';
import { Icon } from '../ui/Icon';

/** Supervisor: double-read window and no-scan warning. */
export function TuningCard() {
  const { t } = useI18n();
  const [tuning, set] = useState<ScanTuning | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    getTuning().then(set);
  }, []);
  if (!tuning) return null;

  const num = (key: keyof ScanTuning, max: number) => (e: Event) => {
    const n = Math.trunc(Number((e.currentTarget as HTMLInputElement).value));
    if (n >= 0 && n <= max) {
      setSaved(false);
      set({ ...tuning, [key]: n });
    }
  };

  return (
    <section class="card">
      <h2>
        <Icon name="warning" /> {t('tuningTitle')}
      </h2>
      <label class="field">
        <span>{t('doubleReadMs')}</span>
        <input class="text-input" type="number" inputMode="numeric" dir="ltr" min={0} max={2000} value={tuning.doubleReadMs} onInput={num('doubleReadMs', 2000)} data-testid="tune-double" />
      </label>
      <label class="field">
        <span>{t('idleMinutes')}</span>
        <input class="text-input" type="number" inputMode="numeric" dir="ltr" min={0} max={120} value={tuning.idleMinutes} onInput={num('idleMinutes', 120)} data-testid="tune-idle" />
      </label>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="tune-save"
        onClick={async () => {
          await setTuning(tuning);
          setSaved(true);
        }}
      >
        <Icon name="check" /> {t('save')}
      </button>
      {saved && <p class="banner banner-ok">{t('ok')}</p>}
    </section>
  );
}
