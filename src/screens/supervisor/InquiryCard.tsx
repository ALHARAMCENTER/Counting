import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../../i18n';
import { clearInquiryLink, getInquiryLink, setInquiryLink } from '../../db/settings';
import { parseInquiryLink } from '../../lib/inquiry';
import { Icon } from '../../ui/Icon';

/**
 * Supervisor: the link of the company's inquiry page. Only here (behind the
 * PIN) can it be set or opened. What was pasted is never shown again.
 */
export function InquiryCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [link, setLink] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    getInquiryLink().then((l) => setSaved(!!l));
  }, []);
  if (saved === null) return null;

  const save = async () => {
    const r = parseInquiryLink(link);
    if (!r.ok) return setInvalid(true);
    await setInquiryLink(r.url);
    setLink('');
    setInvalid(false);
    setSaved(true);
  };

  return (
    <section class="card" data-testid="inquiry-card">
      <h2>
        <Icon name="search" /> {t('inquiryTitle')}
      </h2>
      <p class="hint">{t('inquiryNote')}</p>

      {saved ? (
        <>
          <p class="banner banner-ok" data-testid="inquiry-saved">
            <Icon name="check" size={22} /> {t('inquirySaved')}
          </p>
          <button type="button" class="btn btn-huge btn-primary" onClick={onOpen} data-testid="inquiry-open">
            <Icon name="search" /> {t('inquiryOpen')}
          </button>
          <button
            type="button"
            class="btn btn-small"
            data-testid="inquiry-remove"
            onClick={async () => {
              await clearInquiryLink();
              setSaved(false);
            }}
          >
            {t('inquiryRemove')}
          </button>
        </>
      ) : (
        <form
          class="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label class="field">
            <span>{t('inquiryLinkLabel')}</span>
            <input
              class="text-input"
              dir="ltr"
              data-testid="inquiry-link"
              type="url"
              autoComplete="off"
              autoCapitalize="off"
              spellcheck={false}
              value={link}
              onInput={(e) => {
                setLink(e.currentTarget.value);
                setInvalid(false);
              }}
            />
          </label>
          {invalid && (
            <p class="banner banner-danger" role="alert" data-testid="inquiry-invalid">
              <Icon name="warning" size={22} /> {t('inquiryInvalid')}
            </p>
          )}
          <button type="submit" class="btn btn-primary" disabled={!link.trim()} data-testid="inquiry-save">
            <Icon name="check" /> {t('save')}
          </button>
        </form>
      )}
    </section>
  );
}
