import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { getInquiryLink } from '../db/settings';
import { parseInquiryLink } from '../lib/inquiry';
import { keyboardHub } from '../scan/hub';
import { Icon } from '../ui/Icon';

/**
 * The company's inquiry page, shown inside the app (supervisor only).
 * It is a separate page that talks to the outside by itself; this screen only
 * frames it. The camera is delegated so the page can scan labels.
 */
export function InquiryScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [hint, setHint] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    getInquiryLink().then((l) => {
      const r = l ? parseInquiryLink(l) : null;
      setUrl(r?.ok ? r.url : null); // re-checked: only the allowed host is ever framed
    });
  }, []);

  // A scan that lands outside the page (focus not inside it) is not counted
  // anywhere: say so, instead of a confusing error sound.
  useEffect(() => {
    const consumer = () => {
      setHint(true);
      frame.current?.focus();
    };
    keyboardHub.setConsumer(consumer);
    return () => keyboardHub.releaseConsumer(consumer);
  }, []);

  return (
    <main class="inquiry-screen" data-testid="inquiry-screen">
      <header class="topbar inquiry-top">
        <button type="button" class="btn btn-icon" onClick={onBack} aria-label={t('back')} data-testid="back">
          <Icon name="back" flipRtl />
        </button>
        <h1>
          <Icon name="search" /> {t('inquiryTitle')}
        </h1>
      </header>
      {hint && (
        <p class="banner banner-info" role="status" data-testid="inquiry-hint">
          {t('inquiryScanHint')}
        </p>
      )}
      {url === null && (
        <p class="banner banner-warn" role="alert">
          <Icon name="warning" size={22} /> {t('inquiryInvalid')}
        </p>
      )}
      {url && (
        <iframe
          ref={frame}
          class="inquiry-frame"
          data-testid="inquiry-frame"
          src={url}
          title={t('inquiryTitle')}
          allow="camera; clipboard-write; fullscreen"
          referrerpolicy="no-referrer"
          onLoad={() => frame.current?.focus()}
        />
      )}
    </main>
  );
}
