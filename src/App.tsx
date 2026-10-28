import { useEffect, useMemo, useState } from 'preact/hooks';
import { applyDocumentLang, detectDeviceLang, I18nContext, makeT, type Lang } from './i18n';
import { getDeviceId, getLang, getPinRecord, getSimulator, getTuning, setLang, DEFAULT_TUNING, type ScanTuning } from './db/settings';
import { claimSingleTab } from './lib/singleTab';
import { keyboardHub } from './scan/hub';
import { getSession } from './db/log';
import { Icon } from './ui/Icon';
import { ExportScreen } from './screens/ExportScreen';
import { HelpScreen } from './screens/HelpScreen';
import { ReconcileScreen } from './screens/supervisor/ReconcileScreen';
import { findActiveSession, openSession } from './db/log';
import { ScanController } from './scan/ScanController';
import { unlockAudio } from './lib/feedback';
import { StartSessionScreen, type SessionChoice } from './screens/StartSessionScreen';
import { ScanScreen } from './screens/ScanScreen';
import { requestPersistence, type PersistState } from './lib/storage';
import { applyPendingUpdate, onUpdateReady } from './lib/sw';
import { LanguageScreen } from './screens/LanguageScreen';
import { PinSetupScreen } from './screens/PinSetupScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { InsecureScreen } from './screens/InsecureScreen';
import { PinGate } from './ui/PinGate';

type Route =
  | 'loading'
  | 'insecure'
  | 'language'
  | 'pin-setup'
  | 'home'
  | 'settings-gate'
  | 'settings'
  | 'start-session'
  | 'scan'
  | 'other-tab'
  | 'export'
  | 'reconcile'
  | 'help';

interface ActiveScan {
  controller: ScanController;
  startInReview: boolean;
}

export function App() {
  const [lang, setLangState] = useState<Lang>(() => detectDeviceLang(navigator.languages ?? [navigator.language]));
  const [route, setRoute] = useState<Route>('loading');
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [active, setActive] = useState<ActiveScan | null>(null);
  const [simulator, setSim] = useState(false);
  const [closedNotice, setClosedNotice] = useState(false);
  const [tuning, setTuningState] = useState<ScanTuning>(DEFAULT_TUNING);

  const i18n = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  useEffect(() => applyDocumentLang(lang), [lang]);
  useEffect(() => onUpdateReady(setUpdateReady), []);

  useEffect(() => {
    // Wake Lock, Web Crypto, service workers and persistent storage all need https.
    if (!window.isSecureContext || !crypto.subtle) {
      setRoute('insecure');
      return;
    }
    (async () => {
      // A second window would also listen to the reader: refuse it.
      if (!(await claimSingleTab())) return setRoute('other-tab');
      const id = await getDeviceId();
      setDeviceId(id);
      setSim(await getSimulator());
      const tune = await getTuning();
      setTuningState(tune);
      const saved = await getLang();
      if (!saved) return setRoute('language');
      setLangState(saved);
      if (!(await getPinRecord())) return setRoute('pin-setup');
      // Back to the session that was open when the app stopped.
      const open = await findActiveSession();
      if (open) {
        setActive({
          controller: await ScanController.load(open.session, id, { doubleReadMs: tune.doubleReadMs }),
          startInReview: open.state === 'reviewing',
        });
        return setRoute('scan');
      }
      setRoute('home');
    })();
  }, []);

  useEffect(() => {
    if (route === 'home' && persist === null) requestPersistence().then(setPersist);
  }, [route, persist]);

  const startSession = async (c: SessionChoice) => {
    unlockAudio(); // inside the tap that started the session
    // Scans that arrive while the session opens wait for the scan screen.
    keyboardHub.holdForNextConsumer();
    try {
      const session = await openSession({ ...c, deviceId });
      setActive({
        controller: await ScanController.load(session, deviceId, { doubleReadMs: tuning.doubleReadMs }),
        startInReview: false,
      });
      setRoute('scan');
    } catch (e) {
      keyboardHub.cancelHold();
      throw e;
    }
  };

  /** After a supervisor reopened a closed session. */
  const resumeSession = async (sessionId: string) => {
    const session = await getSession(sessionId);
    if (!session) return;
    setActive({
      controller: await ScanController.load(session, deviceId, { doubleReadMs: tuning.doubleReadMs }),
      startInReview: false,
    });
    setRoute('scan');
  };

  const pickLang = async (l: Lang) => {
    await setLang(l);
    setLangState(l);
  };

  let screen;
  switch (route) {
    case 'loading':
      screen = <main class="screen" />;
      break;
    case 'insecure':
      screen = <InsecureScreen />;
      break;
    case 'other-tab':
      screen = (
        <main class="screen center danger" data-testid="other-tab">
          <Icon name="warning" size={64} />
          <h1>{i18n.t('otherTabTitle')}</h1>
          <p>{i18n.t('otherTabBody')}</p>
          <button type="button" class="btn btn-huge" onClick={() => location.reload()}>
            <Icon name="refresh" /> {i18n.t('retry')}
          </button>
        </main>
      );
      break;
    case 'language':
      screen = (
        <LanguageScreen
          current={lang}
          onPick={async (l) => {
            await pickLang(l);
            setRoute((await getPinRecord()) ? 'home' : 'pin-setup');
          }}
        />
      );
      break;
    case 'pin-setup':
      screen = <PinSetupScreen onDone={() => setRoute('home')} />;
      break;
    case 'home':
      screen = (
        <HomeScreen
          persist={persist}
          onRetryPersist={() => requestPersistence().then(setPersist)}
          updateReady={updateReady}
          onUpdate={applyPendingUpdate}
          onSettings={() => setRoute('settings-gate')}
          onExport={() => setRoute('export')}
          onStart={() => {
            setClosedNotice(false);
            setRoute('start-session');
          }}
          closedNotice={closedNotice}
        />
      );
      break;
    case 'settings-gate':
      screen = (
        <main class="screen center">
          <PinGate onSuccess={() => setRoute('settings')} onCancel={() => setRoute('home')} />
        </main>
      );
      break;
    case 'settings':
      screen = (
        <SettingsScreen
          onLang={pickLang}
          onBack={async () => {
            setSim(await getSimulator());
            setTuningState(await getTuning());
            setRoute('home');
          }}
          onReconcile={() => setRoute('reconcile')}
          onHelp={() => setRoute('help')}
          onWiped={() => location.reload()}
          onReopened={async (id) => {
            setSim(await getSimulator());
            setTuningState(await getTuning());
            await resumeSession(id);
          }}
        />
      );
      break;
    case 'export':
      screen = <ExportScreen onBack={() => setRoute('home')} />;
      break;
    case 'help':
      screen = <HelpScreen onBack={() => setRoute('settings')} />;
      break;
    case 'reconcile':
      screen = <ReconcileScreen onBack={() => setRoute('settings')} />;
      break;
    case 'start-session':
      screen = <StartSessionScreen onCancel={() => setRoute('home')} onStart={startSession} />;
      break;
    case 'scan':
      screen = active && (
        <ScanScreen
          key={active.controller.session.id}
          controller={active.controller}
          startInReview={active.startInReview}
          simulator={simulator}
          idleMinutes={tuning.idleMinutes}
          onClosed={() => {
            setActive(null);
            setClosedNotice(true);
            setRoute('home');
          }}
        />
      );
      break;
  }

  return <I18nContext.Provider value={i18n}>{screen}</I18nContext.Provider>;
}
