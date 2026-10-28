import { useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { SUPERVISOR_PIN } from '../config';
import { PinPad } from './PinPad';

/** Asks for the supervisor PIN before calling onSuccess. */
export function PinGate({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string>();

  const check = (pin: string) => {
    if (pin === SUPERVISOR_PIN) onSuccess();
    else setError(t('pinWrong'));
  };

  return <PinPad title={t('pinRequired')} error={error} onSubmit={check} onCancel={onCancel} />;
}
