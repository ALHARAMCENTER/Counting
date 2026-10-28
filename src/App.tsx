import { useEffect, useMemo, useState } from 'preact/hooks';
import { applyDocumentLang, detectDeviceLang, I18nContext, makeT, type Lang } from './i18n';
import { getDeviceId, getLang, getPinRecord, setLang } from './db/settings';
import { requestPersistence, type PersistState } from './lib/storage';
import { applyPendingUpdate, onUpdateReady } from './lib/sw';
import { LanguageScreen } from './screens/LanguageScreen';
import { PinSetupScreen } from './screens/PinSetupScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { InsecureScreen } from './screens/InsecureScreen';
import { PinGate } from './ui/PinGate';

type Route = 'loading' | 'insecure' | 'language' | 'pin-setup' | 'home' | 'settings-gate' | 'settings';

export function App() {
  const [lang, setLangState] = useState<Lang>(() => detectDeviceLang(navigator.languages ?? [navigator.language]));
  const [route, setRoute] = useState<Route>('loading');
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

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
      await getDeviceId();
      const saved = await getLang();
      if (!saved) return setRoute('language');
      setLangState(saved);
      if (!(await getPinRecord())) return setRoute('pin-setup');
      setRoute('home');
    })();
  }, []);

  useEffect(() => {
    if (route === 'home' && persist === null) requestPersistence().then(setPersist);
  }, [route, persist]);

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
      screen = <SettingsScreen onLang={pickLang} onBack={() => setRoute('home')} />;
      break;
  }

  return <I18nContext.Provider value={i18n}>{screen}</I18nContext.Provider>;
}
