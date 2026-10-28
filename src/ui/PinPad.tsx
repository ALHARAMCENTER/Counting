import { useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

interface Props {
  title: string;
  hint?: string;
  error?: string;
  busy?: boolean;
  onSubmit: (pin: string) => void;
  onCancel?: () => void;
}

const MAX = 8;

/** Large on-screen keypad. Digits are always Latin and laid out left-to-right. */
export function PinPad({ title, hint, error, busy, onSubmit, onCancel }: Props) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');

  const press = (d: string) => setPin((p) => (p.length < MAX ? p + d : p));
  const del = () => setPin((p) => p.slice(0, -1));
  const submit = () => {
    if (busy) return;
    onSubmit(pin);
    setPin('');
  };

  return (
    <div class="pinpad">
      <h2>
        <Icon name="lock" /> {title}
      </h2>
      {hint && <p class="hint">{hint}</p>}
      <div class="pin-dots" dir="ltr" aria-live="polite" data-testid="pin-dots">
        {pin.length === 0 ? <span class="pin-placeholder">----</span> : '●'.repeat(pin.length)}
      </div>
      {error && (
        <p class="error" role="alert">
          <Icon name="warning" size={22} /> {error}
        </p>
      )}
      <div class="keys" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button type="button" key={d} class="key" onClick={() => press(d)} data-testid={`key-${d}`}>
            {d}
          </button>
        ))}
        <button type="button" class="key key-muted" onClick={del} aria-label="delete" data-testid="key-del">
          <Icon name="backspace" />
        </button>
        <button type="button" class="key" onClick={() => press('0')} data-testid="key-0">
          0
        </button>
        <button type="button" class="key key-ok" onClick={submit} disabled={busy} data-testid="key-ok">
          <Icon name="check" />
        </button>
      </div>
      {onCancel && (
        <button type="button" class="btn btn-secondary" onClick={onCancel}>
          <Icon name="back" flipRtl /> {t('cancel')}
        </button>
      )}
    </div>
  );
}
