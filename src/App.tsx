import { useEffect, useMemo, useState } from 'preact/hooks';
import { applyDocumentLang, detectDeviceLang, I18nContext, makeT, type Lang } from './i18n';
import { getDeviceId, getLang, getPinRecord, getSimulator, setLang } from './db/settings';
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
  | 'scan';

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
      const id = await getDeviceId();
      setDeviceId(id);
      setSim(await getSimulator());
      const saved = await getLang();
      if (!saved) return setRoute('language');
      setLangState(saved);
      if (!(await getPinRecord())) return setRoute('pin-setup');
      // Back to the session that was open when the app stopped.
      const open = await findActiveSession();
      if (open) {
        setActive({ controller: await ScanController.load(open.session, id), startInReview: open.state === 'reviewing' });
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
    const session = await openSession({ ...c, deviceId });
    setActive({ controller: await ScanController.load(session, deviceId), startInReview: false });
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
            setRoute('home');
          }}
        />
      );
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
