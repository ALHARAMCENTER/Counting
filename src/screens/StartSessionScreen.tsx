import { useEffect, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../i18n';
import { getCountSetup, type CountSetup } from '../db/settings';
import { Icon } from '../ui/Icon';
import { PinPad } from '../ui/PinPad';

export interface SessionChoice {
  branch: string;
  employee: string;
  section: string;
  stand: number;
}

interface Props {
  onCancel: () => void;
  /** Called from the final "Start" tap (a user gesture: audio can be unlocked). */
  onStart: (c: SessionChoice) => void;
}

type Step = 'employee' | 'section' | 'stand' | 'ready';

/** Name → section (list) → stand (number pad) → Start. */
export function StartSessionScreen({ onCancel, onStart }: Props) {
  const { t } = useI18n();
  const [setup, setSetup] = useState<CountSetup | null>(null);
  const [step, setStep] = useState<Step>('employee');
  const [employee, setEmployee] = useState('');
  const [section, setSection] = useState('');
  const [stand, setStand] = useState(0);
  const [standError, setStandError] = useState<string>();

  useEffect(() => {
    getCountSetup().then(setSetup);
  }, []);

  if (!setup) return <main class="screen" />;

  const back = () => {
    if (step === 'employee') onCancel();
    else if (step === 'section') setStep('employee');
    else if (step === 'stand') setStep('section');
    else setStep('stand');
  };

  const header = (title: string) => (
    <header class="topbar">
      <button type="button" class="btn btn-icon" onClick={back} aria-label={t('back')} data-testid="back">
        <Icon name="back" flipRtl />
      </button>
      <h1>{title}</h1>
    </header>
  );

  if (!setup.branch || setup.sections.length === 0) {
    return (
      <main class="screen">
        {header(t('startCount'))}
        <p class="banner banner-warn" data-testid="setup-missing">
          <Icon name="warning" size={22} /> {t('setupMissing')}
        </p>
      </main>
    );
  }

  if (step === 'employee') {
    const name = employee.trim().replace(/\s+/g, ' ');
    return (
      <main class="screen">
        {header(t('employeeTitle'))}
        <form
          class="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (name) {
              setEmployee(name);
              setStep('section');
            }
          }}
        >
          <input
            class="text-input"
            data-testid="employee"
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={40}
            value={employee}
            onInput={(e) => setEmployee(e.currentTarget.value)}
            autoFocus
          />
          <button type="submit" class="btn btn-huge btn-primary" disabled={!name} data-testid="employee-next">
            {t('next')}
          </button>
        </form>
      </main>
    );
  }

  if (step === 'section') {
    return (
      <main class="screen">
        {header(t('sectionTitle'))}
        <div class="stack">
          {setup.sections.map((s, i) => (
            <button
              type="button"
              key={s}
              class="btn btn-huge"
              data-testid={`section-${i}`}
              onClick={() => {
                setSection(s);
                setStep('stand');
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (step === 'stand') {
    return (
      <main class="screen">
        {header(t('standTitle'))}
        <div class="center">
          <PinPad
            title={`${t('standTitle')} (1 - ${formatNumber(setup.maxStand)})`}
            mask={false}
            maxLength={String(setup.maxStand).length}
            error={standError}
            onSubmit={(v) => {
              const n = Number(v);
              if (!Number.isInteger(n) || n < 1 || n > setup.maxStand) {
                setStandError(`1 - ${formatNumber(setup.maxStand)}`);
                return;
              }
              setStandError(undefined);
              setStand(n);
              setStep('ready');
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main class="screen">
      {header(t('readyTitle'))}
      <dl class="facts" data-testid="ready-facts">
        <dt>{t('branchLabel')}</dt>
        <dd>{setup.branch}</dd>
        <dt>{t('sectionLabel')}</dt>
        <dd>{section}</dd>
        <dt>{t('standLabel')}</dt>
        <dd>
          <bdi dir="ltr">{formatNumber(stand)}</bdi>
        </dd>
        <dt>{t('employeeLabel')}</dt>
        <dd>{employee}</dd>
      </dl>
      <button
        type="button"
        class="btn btn-huge btn-primary"
        data-testid="start-scanning"
        onClick={() => onStart({ branch: setup.branch, employee, section, stand })}
      >
        <Icon name="play" /> {t('startScanning')}
      </button>
    </main>
  );
}
