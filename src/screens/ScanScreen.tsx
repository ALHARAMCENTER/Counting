import { useEffect, useRef, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../i18n';
import { appendSessionEvent } from '../db/log';
import { catalogSize, DEMO_CATALOG } from '../db/catalog';
import { summarize } from '../domain/tally';
import { feedbackError, feedbackNotice } from '../lib/feedback';
import { allowScreenOff, keepScreenOn } from '../lib/wakeLock';
import type { ScanController, ScanView } from '../scan/ScanController';
import { ScannerInput } from '../scan/ScannerInput';
import { simulateScan } from '../scan/simulate';
import { Icon } from '../ui/Icon';

interface Props {
  controller: ScanController;
  /** Session was in 'reviewing' when the app restarted. */
  startInReview: boolean;
  simulator: boolean;
  onClosed: () => void;
}

/** The worker's screen: no menus, two buttons, big numbers. */
export function ScanScreen({ controller, startInReview, simulator, onClosed }: Props) {
  const { t } = useI18n();
  const [view, setView] = useState<ScanView>(controller.current);
  const [reviewing, setReviewingState] = useState(startInReview);
  // Read by the input handler synchronously: a scan right after a tap must
  // see the new mode even before the screen re-renders.
  const reviewingRef = useRef(startInReview);
  const setReviewing = (v: boolean) => {
    reviewingRef.current = v;
    setReviewingState(v);
  };
  const [hasCatalog, setHasCatalog] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const s = controller.session;

  useEffect(() => controller.subscribe(setView), [controller]);
  useEffect(() => {
    catalogSize().then((n) => setHasCatalog(n > 0));
  }, []);
  useEffect(() => {
    keepScreenOn();
    return allowScreenOff;
  }, []);

  // Session steps go through the scan queue: every scan that arrived before
  // the tap is saved first, every scan after it lands in the right state.
  const startReview = async () => {
    setBusy(true);
    try {
      await controller.enqueue(() => appendSessionEvent(s.id, 'review'));
      setBlocked(false);
      setReviewing(true);
    } finally {
      setBusy(false);
    }
  };
  const resume = async () => {
    setBusy(true);
    setReviewing(false);
    try {
      await controller.enqueue(() => appendSessionEvent(s.id, 'resume'));
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    setBusy(true);
    try {
      await controller.enqueue(() => appendSessionEvent(s.id, 'close'));
      feedbackNotice();
      onClosed();
    } finally {
      setBusy(false);
    }
  };

  // One input element for both modes, so focus is never lost on the switch.
  // On the summary screen a scan is refused loudly, never silently dropped.
  const onLine = (line: string) => {
    if (reviewingRef.current) {
      feedbackError();
      setBlocked(true);
    } else void controller.handleLine(line);
  };
  const input = <ScannerInput active onLine={onLine} />;

  const { last, tally, alert } = view;

  if (reviewing) {
    const sum = summarize(tally);
    return (
      <main class="screen" data-testid="summary">
        {input}
        <header class="topbar">
          <h1>{t('summaryTitle')}</h1>
        </header>
        {blocked && (
          <p class="banner banner-warn" role="alert" data-testid="not-saved">
            <Icon name="warning" size={22} /> {t('notSaved')}
          </p>
        )}
        <p class="where">
          <bdi>{s.branch}</bdi>
          <bdi>{s.section}</bdi>
          <span>
            {t('standLabel')} <bdi dir="ltr">{formatNumber(s.stand)}</bdi>
          </span>
        </p>
        <dl class="summary">
          <dt>{t('pieces')}</dt>
          <dd data-testid="sum-pieces">{formatNumber(sum.pieces)}</dd>
          <dt>{t('models')}</dt>
          <dd data-testid="sum-models">{formatNumber(sum.models)}</dd>
          <dt>{t('unknownCount')}</dt>
          <dd data-testid="sum-unknown" class={sum.unknownPieces ? 'bad' : ''}>
            {formatNumber(sum.unknownPieces)}
          </dd>
          {sum.manualPieces > 0 && (
            <>
              <dt>{t('manualCount')}</dt>
              <dd>{formatNumber(sum.manualPieces)}</dd>
            </>
          )}
          {sum.ignoredDuplicates > 0 && (
            <>
              <dt>{t('ignoredCount')}</dt>
              <dd>{formatNumber(sum.ignoredDuplicates)}</dd>
            </>
          )}
        </dl>
        <div class="stack">
          <button type="button" class="btn btn-huge btn-ok" disabled={busy} onClick={close} data-testid="confirm-close">
            <Icon name="check" /> {t('confirmClose')}
          </button>
          <button type="button" class="btn btn-huge" disabled={busy} onClick={resume} data-testid="back-to-scan">
            <Icon name="back" flipRtl /> {t('backToScan')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main class="screen scan-screen">
      {input}
      <header class="scan-top">
        <bdi>{s.branch}</bdi>
        <bdi>{s.section}</bdi>
        <span>
          {t('standLabel')} <bdi dir="ltr">{formatNumber(s.stand)}</bdi>
        </span>
      </header>

      {!hasCatalog && <p class="banner banner-info">{t('noCatalog')}</p>}

      <section class="last" data-testid="last">
        {last ? (
          <>
            <div class={last.type === 'unknown' ? 'last-name bad' : 'last-name'} data-testid="last-name">
              {last.name ?? (last.type === 'unknown' ? t('unknownItem') : '')}
            </div>
            <bdi class="last-barcode" dir="ltr" data-testid="last-barcode">
              {last.barcode}
            </bdi>
            <div class="last-count">
              <bdi dir="ltr" data-testid="last-count">
                ×{formatNumber(last.countInSession)}
              </bdi>
              <span class="hint">{t('inThisSession')}</span>
            </div>
          </>
        ) : (
          <div class="last-name muted">{t('scanNow')}</div>
        )}
      </section>

      <div class="total">
        <span>{t('sessionTotal')}</span>
        <bdi dir="ltr" data-testid="total">
          {formatNumber(tally.total)}
        </bdi>
      </div>

      <footer class="scan-actions">
        {/* Undo arrives in phase C. */}
        <button type="button" class="btn btn-huge" disabled data-testid="undo">
          <Icon name="undo" /> {t('undo')}
        </button>
        <button type="button" class="btn btn-huge btn-primary" disabled={busy} onClick={startReview} data-testid="finish">
          <Icon name="check" /> {t('finish')}
        </button>
      </footer>

      {simulator && <SimulatorPanel />}

      {alert && (
        <div class="alert-overlay" role="alertdialog" data-testid="alert">
          <Icon name="warning" size={96} />
          <h1>
            {alert.kind === 'unknown'
              ? t('unknownTitle')
              : alert.kind === 'wrong-layout'
                ? t('wrongLayoutTitle')
                : t('saveFailedTitle')}
          </h1>
          <bdi dir="ltr" class="alert-barcode">
            {alert.barcode}
          </bdi>
          <p>
            {alert.kind === 'unknown'
              ? t('unknownBody')
              : alert.kind === 'wrong-layout'
                ? t('wrongLayoutBody')
                : t('saveFailedBody')}
          </p>
          {view.savedDuringAlert > 0 && <p>{t('savedDuringAlert', { n: view.savedDuringAlert })}</p>}
          <button
            type="button"
            class="btn btn-huge alert-continue"
            onClick={() => controller.acknowledgeAlert()}
            data-testid="alert-continue"
          >
            <Icon name="check" /> {t('continueBtn')}
          </button>
        </div>
      )}
    </main>
  );
}

/** Development only: types barcodes through the real input path. */
function SimulatorPanel() {
  const fakeUnknown = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  return (
    <div class="sim" data-testid="simulator" dir="ltr">
      {DEMO_CATALOG.map((d) => (
        <button type="button" key={d.barcode} class="btn btn-small" onClick={() => simulateScan(d.barcode)}>
          {d.barcode}
        </button>
      ))}
      <button type="button" class="btn btn-small" onClick={() => simulateScan(fakeUnknown())}>
        ? unknown
      </button>
      <button type="button" class="btn btn-small" onClick={() => simulateScan('ثثثشفصظ')}>
        ع layout
      </button>
      <button
        type="button"
        class="btn btn-small"
        onClick={async () => {
          await simulateScan(DEMO_CATALOG[0]!.barcode, 0);
          await simulateScan(DEMO_CATALOG[0]!.barcode, 0);
        }}
      >
        ×2 fast
      </button>
    </div>
  );
}
