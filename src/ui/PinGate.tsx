import { useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { getPinRecord } from '../db/settings';
import { verifyPin } from '../lib/pin';
import { PinPad } from './PinPad';

/** Asks for the supervisor PIN before calling onSuccess. */
export function PinGate({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const check = async (pin: string) => {
    setBusy(true);
    try {
      const rec = await getPinRecord();
      if (rec && (await verifyPin(pin, rec))) onSuccess();
      else setError(t('pinWrong'));
    } finally {
      setBusy(false);
    }
  };

  return <PinPad title={t('pinRequired')} error={error} busy={busy} onSubmit={check} onCancel={onCancel} />;
}
