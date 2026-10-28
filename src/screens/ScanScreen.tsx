import { useEffect, useRef, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../i18n';
import { appendSessionEvent } from '../db/log';
import { catalogSize, DEMO_CATALOG } from '../db/catalog';
import { summarize } from '../domain/tally';
import { feedbackError, feedbackNotice } from '../lib/feedback';
import { allowScreenOff, keepScreenOn } from '../lib/wakeLock';
import { StaleUndoError, type ScanController, type ScanView, type UndoCandidate } from '../scan/ScanController';
import { batteryWarning, watchBattery, type BatteryState } from '../lib/battery';
import { ScannerInput } from '../scan/ScannerInput';
import { simulateScan } from '../scan/simulate';
import { exportBackup } from '../io/exporter';
import { Icon } from '../ui/Icon';

interface Props {
  controller: ScanController;
  /** Session was in 'reviewing' when the app restarted. */
  startInReview: boolean;
  simulator: boolean;
  /** Minutes without any scan before warning (0 = off). */
  idleMinutes: number;
  onClosed: () => void;
}

/** The worker's screen: no menus, two buttons, big numbers. */
export function ScanScreen({ controller, startInReview, simulator, idleMinutes, onClosed }: Props) {
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
  const [confirmUndo, setConfirmUndo] = useState<UndoCandidate | null>(null);
  const [undoStale, setUndoStale] = useState(false);
  const [battery, setBattery] = useState<BatteryState | null>(null);
  const [idle, setIdle] = useState(false);
  const s = controller.session;

  useEffect(() => watchBattery(setBattery), []);

  // "No scan for a long time" warning: once per quiet period, with a sound.
  useEffect(() => {
    if (!idleMinutes || reviewing) {
      setIdle(false);
      return;
    }
    const check = () => {
      const quiet = Date.now() - controller.current.lastInputAt > idleMinutes * 60_000;
      setIdle((was) => {
        if (quiet && !was) feedbackNotice();
        return quiet;
      });
    };
    check();
    const timer = setInterval(check, 10_000);
    return () => clearInterval(timer);
  }, [controller, idleMinutes, reviewing, view.lastInputAt]);

  const doUndo = async () => {
    const target = confirmUndo;
    setConfirmUndo(null);
    if (!target) return;
    try {
      await controller.undo(target.uuid);
      feedbackNotice();
    } catch (e) {
      if (e instanceof StaleUndoError) setUndoStale(true);
      else throw e;
    }
  };

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
      // Safety copy of this session's raw log, written as soon as it closes.
      try {
        await exportBackup([s.id]);
      } catch {
        /* the data is still in the database; export is also available later */
      }
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
      {batteryWarning(battery) !== 'none' && (
        <p
          class={batteryWarning(battery) === 'critical' ? 'banner banner-danger' : 'banner banner-warn'}
          role="alert"
          data-testid="battery-warning"
        >
          <Icon name="warning" size={22} />{' '}
          {batteryWarning(battery) === 'critical' ? t('batteryCritical') : t('batteryLow')}{' '}
          <bdi dir="ltr">{formatNumber(Math.round((battery?.level ?? 0) * 100))}%</bdi>
        </p>
      )}
      {idle && (
        <p class="banner banner-warn" role="alert" data-testid="idle-warning">
          <Icon name="warning" size={22} /> {t('idleTitle', { n: idleMinutes })}. {t('idleBody')}
        </p>
      )}
      {undoStale && (
        <p class="banner banner-warn" role="alert" data-testid="undo-stale">
          <Icon name="warning" size={22} /> {t('undoStale')}
        </p>
      )}

      <section class="last" data-testid="last">
        {last ? (
          <>
            <div class={last.type === 'unknown' ? 'last-name bad' : 'last-name'} data-testid="last-name">
              {last.name ?? (last.type === 'unknown' ? t('unknownItem') : '')}
            </div>
            <bdi class="last-barcode" dir="ltr" data-testid="last-barcode">
              {last.barcode}
            </bdi>
            {last.undone && (
              <div class="badge-undone" data-testid="undone">
                <Icon name="undo" size={22} /> {t('undone')}
              </div>
            )}
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
        <button
          type="button"
          class="btn btn-huge"
          disabled={!view.undoable || busy}
          onClick={() => {
            setUndoStale(false);
            setConfirmUndo(view.undoable);
          }}
          data-testid="undo"
        >
          <Icon name="undo" /> {t('undo')}
        </button>
        <button type="button" class="btn btn-huge btn-primary" disabled={busy} onClick={startReview} data-testid="finish">
          <Icon name="check" /> {t('finish')}
        </button>
      </footer>

      {simulator && <SimulatorPanel />}

      {confirmUndo && (
        <div class="dialog-backdrop">
          <div class="dialog" role="dialog" data-testid="undo-dialog">
            <h2>
              <Icon name="undo" /> {t('undoConfirmTitle')}
            </h2>
            <p class="dialog-name">{confirmUndo.name ?? t('unknownItem')}</p>
            <bdi dir="ltr" class="last-barcode">
              {confirmUndo.barcode}
            </bdi>
            <div class="scan-actions">
              <button type="button" class="btn btn-huge" onClick={() => setConfirmUndo(null)} data-testid="undo-no">
                {t('undoNo')}
              </button>
              <button type="button" class="btn btn-huge btn-danger" onClick={doUndo} data-testid="undo-yes">
                <Icon name="undo" /> {t('undoYes')}
              </button>
            </div>
          </div>
        </div>
      )}

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
