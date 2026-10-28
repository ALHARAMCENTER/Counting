import { useEffect, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../i18n';
import { getCountSetup, type CountSetup } from '../db/settings';
import { findSessionsForStand } from '../db/log';
import { SECTION_KEYS, sectionLabel } from '../domain/sections';
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

type Step = 'employee' | 'section' | 'stand' | 'duplicate' | 'ready';
type Earlier = Awaited<ReturnType<typeof findSessionsForStand>>;

/** Name → section (list) → stand (number pad) → Start. */
export function StartSessionScreen({ onCancel, onStart }: Props) {
  const { t } = useI18n();
  const [setup, setSetup] = useState<CountSetup | null>(null);
  const [step, setStep] = useState<Step>('employee');
  const [employee, setEmployee] = useState('');
  const [section, setSection] = useState('');
  const [stand, setStand] = useState(0);
  const [standError, setStandError] = useState<string>();
  const [earlier, setEarlier] = useState<Earlier>([]);
  const [sure, setSure] = useState(false);

  useEffect(() => {
    getCountSetup().then(setSetup);
  }, []);

  if (!setup) return <main class="screen" />;

  const back = () => {
    if (step === 'employee') onCancel();
    else if (step === 'section') setStep('employee');
    else if (step === 'stand') setStep('section');
    else setStep('stand');
    setSure(false);
  };

  const header = (title: string) => (
    <header class="topbar">
      <button type="button" class="btn btn-icon" onClick={back} aria-label={t('back')} data-testid="back">
        <Icon name="back" flipRtl />
      </button>
      <h1>{title}</h1>
    </header>
  );

  if (!setup.branch) {
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
          {SECTION_KEYS.map((s, i) => (
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
              {sectionLabel(t, s)}
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
            onSubmit={async (v) => {
              const n = Number(v);
              if (!Number.isInteger(n) || n < 1 || n > setup.maxStand) {
                setStandError(`1 - ${formatNumber(setup.maxStand)}`);
                return;
              }
              setStandError(undefined);
              setStand(n);
              // Same stand counted before on this device: stop and warn.
              const found = await findSessionsForStand(setup.branch, section, n);
              setEarlier(found);
              setSure(false);
              setStep(found.length > 0 ? 'duplicate' : 'ready');
            }}
          />
        </div>
      </main>
    );
  }

  if (step === 'duplicate') {
    return (
      <main class="screen" data-testid="dup-stand">
        {header(t('dupStandTitle'))}
        <div class="banner banner-danger" role="alert">
          <p>
            <Icon name="warning" size={28} /> {t('dupStandBody')}
          </p>
        </div>
        <p class="where">
          <bdi>{sectionLabel(t, section)}</bdi>
          <span>
            {t('standLabel')} <bdi dir="ltr">{formatNumber(stand)}</bdi>
          </span>
        </p>
        <ul class="list">
          {earlier.map((e) => (
            <li key={e.session.id}>
              <span>
                <bdi>{e.session.employee}</bdi> · <bdi dir="ltr">{e.session.createdAt.slice(0, 16).replace('T', ' ')}</bdi>
              </span>
              <strong>{t('piecesN', { n: e.pieces })}</strong>
            </li>
          ))}
        </ul>
        <div class="stack">
          <button type="button" class="btn btn-huge btn-primary" onClick={back} data-testid="dup-back">
            <Icon name="back" flipRtl /> {t('dupStandBack')}
          </button>
          {sure && <p class="error">{t('dupStandSure')}</p>}
          <button
            type="button"
            class={sure ? 'btn btn-huge btn-danger' : 'btn btn-huge'}
            onClick={() => (sure ? setStep('ready') : setSure(true))}
            data-testid="dup-continue"
          >
            {t('dupStandAck')}
          </button>
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
        <dd>{sectionLabel(t, section)}</dd>
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
