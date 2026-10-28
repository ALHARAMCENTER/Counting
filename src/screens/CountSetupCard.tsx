import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { getCountSetup, setCountSetup, type CountSetup } from '../db/settings';
import { Icon } from '../ui/Icon';

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Supervisor: branch of this device, list of sections, number of stands. */
export function CountSetupCard() {
  const { t } = useI18n();
  const [setup, setSetup] = useState<CountSetup | null>(null);
  const [newSection, setNewSection] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getCountSetup().then(setSetup);
  }, []);
  if (!setup) return null;

  const change = (s: CountSetup) => {
    setSaved(false);
    setSetup(s);
  };
  const addSection = () => {
    const v = clean(newSection);
    if (v && !setup.sections.includes(v)) change({ ...setup, sections: [...setup.sections, v] });
    setNewSection('');
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

      <div class="field">
        <span>{t('sections')}</span>
        <ul class="list">
          {setup.sections.map((s) => (
            <li key={s}>
              <span>{s}</span>
              <button
                type="button"
                class="btn btn-small"
                onClick={() => change({ ...setup, sections: setup.sections.filter((x) => x !== s) })}
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
        <form
          class="row-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            addSection();
          }}
        >
          <input
            class="text-input grow"
            data-testid="setup-new-section"
            value={newSection}
            maxLength={40}
            onInput={(e) => setNewSection(e.currentTarget.value)}
          />
          <button type="submit" class="btn" data-testid="setup-add-section">
            {t('addSection')}
          </button>
        </form>
      </div>

      <label class="field">
        <span>{t('maxStand')}</span>
        <input
          class="text-input"
          data-testid="setup-max-stand"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          dir="ltr"
          value={setup.maxStand}
          onInput={(e) => {
            const n = Math.trunc(Number(e.currentTarget.value));
            if (n >= 1 && n <= 999) change({ ...setup, maxStand: n });
          }}
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
