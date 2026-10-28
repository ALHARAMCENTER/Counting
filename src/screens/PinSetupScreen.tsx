import { useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { setPinRecord } from '../db/settings';
import { hashPin, isValidPin } from '../lib/pin';
import { PinPad } from '../ui/PinPad';

/** First-run: the supervisor creates the PIN (entered twice). */
export function PinSetupScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (pin: string) => {
    if (first === null) {
      if (!isValidPin(pin)) return setError(t('pinTooShort'));
      setError(undefined);
      setFirst(pin);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      return setError(t('pinMismatch'));
    }
    setBusy(true);
    try {
      await setPinRecord(await hashPin(pin));
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="screen center">
      <PinPad
        key={first === null ? 'first' : 'confirm'}
        title={first === null ? t('pinSetupTitle') : t('pinConfirm')}
        hint={first === null ? `${t('pinSetupHint')} ${t('pinNotSecurity')}` : undefined}
        error={error}
        busy={busy}
        onSubmit={submit}
      />
    </main>
  );
}
