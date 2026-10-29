import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { getBranches, getLastBranch, getSetting, setLastBranch, setSetting } from '../db/settings';
import { SECTION_KEYS, sectionLabel } from '../domain/sections';
import { Icon } from '../ui/Icon';

export interface SessionChoice {
  branch: string;
  employee: string;
  section: string;
}

interface Props {
  onCancel: () => void;
  onStart: (c: SessionChoice) => void;
}

type Step = 'employee' | 'branch' | 'section';

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

/**
 * Fast start: name (pre-filled with the last one) → branch (one tap, from the
 * supervisor's list) → section (one tap) → scanning starts. With a single
 * branch in the list that step is skipped.
 */
export function StartSessionScreen({ onCancel, onStart }: Props) {
  const { t } = useI18n();
  const [branches, setBranchList] = useState<string[] | null>(null);
  const [lastBranch, setLast] = useState('');
  const [step, setStep] = useState<Step>('employee');
  const [employee, setEmployee] = useState('');
  const [branch, setBranch] = useState('');

  useEffect(() => {
    (async () => {
      // Load everything first, then show it together: the name field must not
      // appear and then be overwritten by a slow read after the worker typed.
      const [list, lastB, lastE] = await Promise.all([getBranches(), getLastBranch(), getSetting<string>('lastEmployee')]);
      setLast(lastB ?? '');
      setEmployee((typed) => typed || lastE || ''); // never replace what was already typed
      setBranchList(list);
    })();
  }, []);

  if (branches === null) return <main class="screen" />;

  const back = () => {
    if (step === 'employee') onCancel();
    else if (step === 'branch') setStep('employee');
    else setStep(branches.length > 1 ? 'branch' : 'employee');
  };

  const begin = (section: string) => {
    void setSetting('lastEmployee', employee);
    void setLastBranch(branch);
    onStart({ branch, employee, section });
  };

  const header = (title: string) => (
    <header class="topbar">
      <button type="button" class="btn btn-icon" onClick={back} aria-label={t('back')} data-testid="back">
        <Icon name="back" flipRtl />
      </button>
      <h1>{title}</h1>
    </header>
  );

  if (branches.length === 0) {
    return (
      <main class="screen">
        {header(t('startCount'))}
        <p class="banner banner-warn" role="alert" data-testid="no-branches">
          <Icon name="warning" size={22} /> {t('noBranches')}
        </p>
      </main>
    );
  }

  if (step === 'employee') {
    const name = clean(employee);
    return (
      <main class="screen">
        {header(t('employeeTitle'))}
        <form
          class="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name) return;
            setEmployee(name);
            if (branches.length === 1) {
              setBranch(branches[0]!);
              setStep('section');
            } else setStep('branch');
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

  if (step === 'branch') {
    return (
      <main class="screen">
        {header(t('branchTitle'))}
        <div class="stack">
          {branches.map((b) => (
            <button
              type="button"
              key={b}
              class={b === lastBranch ? 'btn btn-huge btn-primary' : 'btn btn-huge'}
              data-testid={`branch-${b}`}
              onClick={() => {
                setBranch(b);
                setStep('section');
              }}
            >
              <bdi dir="ltr">{b}</bdi>
              {b === lastBranch && <Icon name="check" />}
            </button>
          ))}
        </div>
        {lastBranch && branches.includes(lastBranch) && <p class="hint">{t('lastBranchHint')}</p>}
      </main>
    );
  }

  return (
    <main class="screen">
      {header(`${t('branchLabel')} ${branch} · ${t('sectionTitle')}`)}
      <div class="stack">
        {SECTION_KEYS.map((s, i) => (
          <button type="button" key={s} class="btn btn-huge" data-testid={`section-${i}`} onClick={() => begin(s)}>
            {sectionLabel(t, s)}
          </button>
        ))}
      </div>
    </main>
  );
}
