import { useEffect, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../i18n';
import { getCountSetup, getSetting, setCountSetup, setSetting } from '../db/settings';
import { findSessionsForStand } from '../db/log';
import { SECTION_KEYS, sectionLabel } from '../domain/sections';
import { unlockAudio } from '../lib/feedback';
import { keyboardHub } from '../scan/hub';
import { Icon } from '../ui/Icon';
import { formatLocalMinute } from '../lib/time';
import { PinPad } from '../ui/PinPad';

export interface SessionChoice {
  branch: string;
  employee: string;
  section: string;
  stand: number;
}

interface Props {
  onCancel: () => void;
  onStart: (c: SessionChoice) => void;
}

type Step = 'branch' | 'employee' | 'section' | 'stand' | 'duplicate';
type Earlier = Awaited<ReturnType<typeof findSessionsForStand>>;

/** Stand numbers are typed freely (up to 4 digits). */
const STAND_MAX_DIGITS = 4;

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

/**
 * Fast start: name (pre-filled with the last one) → section (one tap) →
 * stand number (typed) → scanning starts on ✓. The branch is asked only the
 * first time on a device.
 */
export function StartSessionScreen({ onCancel, onStart }: Props) {
  const { t } = useI18n();
  const [branch, setBranch] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('employee');
  const [employee, setEmployee] = useState('');
  const [section, setSection] = useState('');
  const [stand, setStand] = useState(0);
  const [standError, setStandError] = useState<string>();
  const [earlier, setEarlier] = useState<Earlier>([]);
  const [sure, setSure] = useState(false);

  useEffect(() => {
    (async () => {
      const b = (await getCountSetup()).branch;
      setBranch(b);
      setEmployee((await getSetting<string>('lastEmployee')) ?? '');
      if (!b) setStep('branch');
    })();
  }, []);

  if (branch === null) return <main class="screen" />;

  const back = () => {
    setSure(false);
    if (step === 'branch' || step === 'employee') onCancel();
    else if (step === 'section') setStep('employee');
    else if (step === 'stand') setStep('section');
    else setStep('stand');
  };

  const start = (n: number) => {
    void setSetting('lastEmployee', employee);
    onStart({ branch, employee, section, stand: n });
  };

  const header = (title: string) => (
    <header class="topbar">
      <button type="button" class="btn btn-icon" onClick={back} aria-label={t('back')} data-testid="back">
        <Icon name="back" flipRtl />
      </button>
      <h1>{title}</h1>
    </header>
  );

  const textStep = (opts: { title: string; value: string; set: (v: string) => void; testId: string; onNext: (v: string) => void }) => {
    const v = clean(opts.value);
    return (
      <main class="screen">
        {header(opts.title)}
        <form
          class="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (v) opts.onNext(v);
          }}
        >
          <input
            class="text-input"
            data-testid={opts.testId}
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={40}
            value={opts.value}
            onInput={(e) => opts.set(e.currentTarget.value)}
            autoFocus
          />
          <button type="submit" class="btn btn-huge btn-primary" disabled={!v} data-testid={`${opts.testId}-next`}>
            {t('next')}
          </button>
        </form>
      </main>
    );
  };

  if (step === 'branch') {
    return textStep({
      title: t('branchLabel'),
      value: branch,
      set: setBranch,
      testId: 'branch',
      onNext: async (v) => {
        await setCountSetup({ branch: v });
        setBranch(v);
        setStep('employee');
      },
    });
  }

  if (step === 'employee') {
    return textStep({
      title: t('employeeTitle'),
      value: employee,
      set: setEmployee,
      testId: 'employee',
      onNext: (v) => {
        setEmployee(v);
        setStep('section');
      },
    });
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
                setStandError(undefined);
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
        {header(`${sectionLabel(t, section)} · ${t('standTitle')}`)}
        <div class="center">
          <PinPad
            title={t('standTitle')}
            mask={false}
            maxLength={STAND_MAX_DIGITS}
            error={standError}
            onSubmit={async (v) => {
              // This tap starts the count: unlock sound now, inside the gesture.
              unlockAudio();
              const n = Number(v);
              if (!Number.isInteger(n) || n < 1) {
                setStandError(t('standInvalid'));
                return;
              }
              setStandError(undefined);
              setStand(n);
              // Scans from this instant on wait for the scan screen.
              keyboardHub.holdForNextConsumer();
              // Same stand counted before on this device: stop and warn.
              const found = await findSessionsForStand(branch, section, n);
              if (found.length > 0) {
                keyboardHub.cancelHold();
                setEarlier(found);
                setSure(false);
                setStep('duplicate');
              } else start(n);
            }}
          />
        </div>
      </main>
    );
  }

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
              <bdi>{e.session.employee}</bdi> · <bdi dir="ltr">{formatLocalMinute(e.session.createdAt)}</bdi>
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
          onClick={() => {
            unlockAudio();
            if (sure) {
              keyboardHub.holdForNextConsumer();
              start(stand);
            }
            else setSure(true);
          }}
          data-testid="dup-continue"
        >
          {t('dupStandAck')}
        </button>
      </div>
    </main>
  );
}
