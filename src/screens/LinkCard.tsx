import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { getDeviceLink, lockedBranch, parseLink, setDeviceLink, type DeviceLink } from '../link/deviceLink';
import { Icon } from '../ui/Icon';

/**
 * Supervisor: link this device to a branch by pasting the branch link (needed
 * when the app was installed to the home screen without its link), or remove it.
 */
export function LinkCard() {
  const { t } = useI18n();
  const [link, setLink] = useState<DeviceLink | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);

  useEffect(() => {
    getDeviceLink().then(setLink);
  }, []);
  if (link === undefined) return null;

  const branch = lockedBranch(link);
  const save = async (next: DeviceLink | null) => {
    await setDeviceLink(next);
    setLink(next);
    setText('');
  };

  return (
    <section class="card" data-testid="link-card">
      <h2>
        <Icon name="lock" /> {t('linkCardTitle')}
      </h2>
      <p data-testid="link-current">{link ? (branch ? t('linkedBranch', { b: branch }) : t('supervisorAll')) : t('linkCardNone')}</p>
      <form
        class="row-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseLink(text);
          setBad(!parsed);
          if (parsed) void save(parsed);
        }}
      >
        <input
          class="text-input grow"
          data-testid="link-paste"
          placeholder={t('linkCardPaste')}
          autoComplete="off"
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button type="submit" class="btn" data-testid="link-save" disabled={!text.trim()}>
          {t('linkCardSave')}
        </button>
      </form>
      {bad && <p class="error">{t('linkCardBad')}</p>}
      {link && (
        <button type="button" class="btn btn-small" data-testid="link-remove" onClick={() => save(null)}>
          {t('linkCardRemove')}
        </button>
      )}
    </section>
  );
}
