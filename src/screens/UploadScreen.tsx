import { useEffect, useState } from 'preact/hooks';
import { formatNumber, useI18n } from '../i18n';
import { getSetting, setSetting } from '../db/settings';
import { loadSessions, scanListForUpload } from '../io/exporter';
import { computeTally } from '../domain/tally';
import { sectionLabel } from '../domain/sections';
import { formatLocalMinute } from '../lib/time';
import { ChannelError, fileHash, sendRequest } from '../link/channel';
import { lockedBranch, type DeviceLink } from '../link/deviceLink';
import type { Session } from '../db/types';
import type { SessionState } from '../domain/sessionState';
import { Icon } from '../ui/Icon';

/**
 * Send closed counts of one branch to the office system:
 * choose counts → the office computer previews them in the system → the user
 * checks the preview (it must match this device) → approves → confirms → upload.
 * The office computer previews again and uploads only if nothing changed.
 */

interface Entry {
  session: Session;
  state: SessionState;
  pieces: number;
}

type PreviewRow = [string, string, string, string, string, number];

interface Preview {
  branch: string;
  msg: string;
  codes: number;
  qty: number;
  rows: PreviewRow[];
  bad: string[];
  app: { pieces: number; codes: number };
  mismatch: boolean;
  token: string;
  locked: boolean;
}

interface Done {
  dry: boolean;
  msg: string;
}

type Step = 'pick' | 'sending' | 'preview' | 'confirm' | 'committing' | 'done';

const UPLOADED_KEY = 'uploadedSessions';
const PREVIEW_TIMEOUT = 200_000;
const COMMIT_TIMEOUT = 200_000;

export const getUploaded = async () => (await getSetting<Record<string, string>>(UPLOADED_KEY)) ?? {};

export function UploadScreen({ link, onBack }: { link: DeviceLink | null; onBack: () => void }) {
  const { t } = useI18n();
  const fixed = lockedBranch(link);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const [branch, setBranch] = useState<string | null>(fixed);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>('pick');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    (async () => {
      const [all, up] = await Promise.all([loadSessions(), getUploaded()]);
      setUploaded(up);
      setEntries(all.reverse().map((s) => ({ session: s.session, state: s.state, pieces: computeTally(s.events).total })));
    })();
  }, []);

  // Default choice: the closed counts of the branch that were not sent yet.
  useEffect(() => {
    if (!entries || !branch) return;
    setChosen(new Set(entries.filter((e) => e.session.branch === branch && e.state === 'closed' && !uploaded[e.session.id]).map((e) => e.session.id)));
  }, [entries, branch, uploaded]);

  const header = (
    <header class="topbar">
      <button
        type="button"
        class="btn btn-icon"
        onClick={() => (step === 'confirm' ? setStep('preview') : onBack())}
        aria-label={t('back')}
        data-testid="back"
        disabled={step === 'sending' || step === 'committing'}
      >
        <Icon name="back" flipRtl />
      </button>
      <h1>{t('uploadTitle')}</h1>
    </header>
  );

  if (!link) {
    return (
      <main class="screen" data-testid="upload-screen">
        {header}
        <p class="banner banner-warn" role="alert" data-testid="upload-no-link">
          <Icon name="warning" size={22} /> {t('noLink')}
        </p>
      </main>
    );
  }
  if (!entries) return <main class="screen" />;

  const errorText = (e: unknown) =>
    e instanceof ChannelError
      ? t(e.code === 'send' ? 'uploadErrSend' : e.code === 'timeout' ? 'uploadErrTimeout' : 'uploadErrReply')
      : t('uploadErrReply');

  const ids = [...chosen];
  const pieces = entries.filter((e) => chosen.has(e.session.id)).reduce((n, e) => n + e.pieces, 0);

  const sendPreview = async () => {
    if (!branch || ids.length === 0) return;
    setError('');
    setStep('sending');
    try {
      const file = await scanListForUpload(ids);
      const r = await sendRequest(link, { k: 'cprev', b: branch, h: await fileHash(file.data), n: file.pieces }, file.data, PREVIEW_TIMEOUT);
      if (!r.ok) {
        setError(t('uploadErrServer', { msg: String(r.error ?? '') }));
        setStep('pick');
        return;
      }
      setPreview(r as unknown as Preview);
      setStep('preview');
    } catch (e) {
      setError(errorText(e));
      setStep('pick');
    }
  };

  const commit = async () => {
    if (!preview?.token) return;
    setError('');
    setStep('committing');
    try {
      const r = await sendRequest(link, { k: 'ccommit', t: preview.token }, null, COMMIT_TIMEOUT);
      if (!r.ok) {
        setError(t('uploadErrServer', { msg: String(r.error ?? '') }));
        setPreview({ ...preview, token: '' }); // a token is used once: preview again
        setStep('preview');
        return;
      }
      const d = { dry: r.dry === true, msg: String(r.msg ?? '') };
      if (!d.dry) {
        const at = new Date().toISOString();
        const next = { ...uploaded };
        for (const id of ids) next[id] = at;
        await setSetting(UPLOADED_KEY, next);
        setUploaded(next);
      }
      setDone(d);
      setStep('done');
    } catch (e) {
      // The result is unknown (the upload may have happened): never retry by itself.
      setError(errorText(e));
      setPreview({ ...preview, token: '' });
      setStep('preview');
    }
  };

  const errorBanner = error && (
    <p class="banner banner-warn" role="alert" data-testid="upload-error">
      <Icon name="warning" size={22} /> {error}
    </p>
  );

  // ----- 1. branch (supervisor link only) -----
  if (!branch) {
    const withCounts = [...new Set(entries.map((e) => e.session.branch))];
    return (
      <main class="screen" data-testid="upload-screen">
        {header}
        <h2>{t('uploadPickBranch')}</h2>
        {withCounts.length === 0 && <p class="hint">{t('noSessions')}</p>}
        <div class="stack">
          {withCounts.map((b) => (
            <button type="button" key={b} class="btn btn-huge" data-testid={`upload-branch-${b}`} onClick={() => setBranch(b)}>
              <bdi dir="ltr">{b}</bdi>
            </button>
          ))}
        </div>
      </main>
    );
  }

  // ----- 5. result -----
  if (step === 'done' && done) {
    return (
      <main class="screen" data-testid="upload-screen">
        {header}
        <p class={done.dry ? 'banner banner-info' : 'banner banner-ok'} data-testid={done.dry ? 'upload-dry' : 'upload-done'}>
          <Icon name={done.dry ? 'lock' : 'check'} size={22} /> {done.dry ? t('uploadDry') : t('uploadDone')}
        </p>
        {done.msg && <p class="hint" data-testid="upload-done-msg">{done.msg}</p>}
        <button type="button" class="btn btn-huge btn-primary" onClick={onBack} data-testid="upload-finish">
          {t('ok')}
        </button>
      </main>
    );
  }

  // ----- 2..4. preview, confirmation -----
  if ((step === 'preview' || step === 'confirm' || step === 'committing') && preview) {
    const p = preview;
    const matches = !p.mismatch && p.bad.length === 0 && p.rows.length > 0;
    const cell = (v: number | string, id: string) => (
      <bdi dir="ltr" data-testid={id}>
        {typeof v === 'number' ? formatNumber(v) : v}
      </bdi>
    );
    return (
      <main class="screen" data-testid="upload-screen">
        {header}
        {errorBanner}
        <section class="card" data-testid="upload-preview">
          <h2>
            {t('uploadPreviewTitle')} · {t('linkedBranch', { b: p.branch })}
          </h2>
          {p.msg && <p class="hint" data-testid="upload-erp-msg">{p.msg}</p>}
          <table class="upload-sum">
            <thead>
              <tr>
                <th />
                <th>{t('uploadSystem')}</th>
                <th>{t('uploadDevice')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>{t('uploadCodes')}</th>
                <td>{cell(p.codes, 'erp-codes')}</td>
                <td>{cell(p.app.codes, 'app-codes')}</td>
              </tr>
              <tr>
                <th>{t('uploadPieces')}</th>
                <td>{cell(p.qty, 'erp-qty')}</td>
                <td>{cell(p.app.pieces, 'app-pieces')}</td>
              </tr>
            </tbody>
          </table>
          {matches ? (
            <p class="banner banner-ok" data-testid="upload-match">
              <Icon name="check" size={22} /> {t('uploadMatch')}
            </p>
          ) : (
            p.bad.length === 0 && (
              <p class="banner banner-warn" role="alert" data-testid="upload-mismatch">
                <Icon name="warning" size={22} /> {t('uploadMismatch')}
              </p>
            )
          )}
          {p.bad.length > 0 && (
            <div class="banner banner-warn" role="alert" data-testid="upload-bad">
              <p>
                <Icon name="warning" size={22} /> {t('uploadBad')}
              </p>
              <ul class="list mono">
                {p.bad.map((b) => (
                  <li key={b}>
                    <bdi dir="ltr">{b}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {step === 'preview' && p.token && (
          <>
            {p.locked && <p class="hint" data-testid="upload-locked">{t('uploadLockedNote')}</p>}
            <button type="button" class="btn btn-huge btn-primary" data-testid="upload-approve" onClick={() => setStep('confirm')}>
              <Icon name="check" /> {t('uploadApprove')}
            </button>
          </>
        )}
        {step === 'confirm' && (
          <section class="card danger" role="alertdialog" data-testid="upload-confirm">
            <h2>
              <Icon name="warning" /> {t('uploadConfirmTitle')}
            </h2>
            <p>{t('uploadConfirmBody', { b: p.branch, codes: p.codes, pieces: p.qty })}</p>
            {p.locked && <p class="hint">{t('uploadLockedNote')}</p>}
            <div class="row-wrap">
              <button type="button" class="btn btn-huge btn-danger" data-testid="upload-confirm-yes" onClick={commit}>
                {t('uploadConfirmYes')}
              </button>
              <button type="button" class="btn btn-huge" data-testid="upload-confirm-no" onClick={() => setStep('preview')}>
                {t('cancel')}
              </button>
            </div>
          </section>
        )}
        {step === 'committing' && (
          <p class="banner banner-info" data-testid="upload-committing">
            {t('uploadCommitting')}
          </p>
        )}
        {step === 'preview' && !p.token && (
          <button type="button" class="btn btn-huge" data-testid="upload-again" onClick={() => setStep('pick')}>
            <Icon name="refresh" /> {t('retry')}
          </button>
        )}

        {p.rows.length > 0 && (
          <section class="card">
            <table class="upload-rows" data-testid="upload-rows">
              <thead>
                <tr>
                  <th>{t('uploadColCode')}</th>
                  <th>{t('uploadColModel')}</th>
                  <th>{t('uploadColPrice')}</th>
                  <th>{t('uploadColQty')}</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r[0]}>
                    <td>
                      <bdi dir="ltr" class="mono">
                        {r[0]}
                      </bdi>
                    </td>
                    <td>
                      <bdi dir="ltr">{r[1]}</bdi>
                    </td>
                    <td>
                      <bdi dir="ltr">{r[4]}</bdi>
                    </td>
                    <td>
                      <bdi dir="ltr">{formatNumber(r[5])}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    );
  }

  // ----- 1b. choose counts / sending -----
  const ofBranch = entries.filter((e) => e.session.branch === branch);
  return (
    <main class="screen" data-testid="upload-screen">
      {header}
      {errorBanner}
      <h2>
        {t('linkedBranch', { b: branch })} · {t('uploadChoose')}
      </h2>
      {ofBranch.length === 0 && <p class="hint">{t('uploadNothing')}</p>}
      <ul class="list">
        {ofBranch.map((e) => {
          const closed = e.state === 'closed';
          const sent = uploaded[e.session.id];
          return (
            <li key={e.session.id}>
              <label class="row-wrap">
                <input
                  type="checkbox"
                  data-testid="upload-pick"
                  disabled={!closed || step === 'sending'}
                  checked={chosen.has(e.session.id)}
                  onChange={(ev) => {
                    const next = new Set(chosen);
                    if (ev.currentTarget.checked) next.add(e.session.id);
                    else next.delete(e.session.id);
                    setChosen(next);
                  }}
                />
                <span>
                  <bdi>{sectionLabel(t, e.session.section)}</bdi> · <bdi>{e.session.employee}</bdi> ·{' '}
                  <bdi dir="ltr">{formatLocalMinute(e.session.createdAt)}</bdi> · <bdi dir="ltr">{formatNumber(e.pieces)}</bdi>
                  {!closed && <span class="hint"> — {t('uploadOpenNote')}</span>}
                  {sent && <span class="hint"> — {t('uploadedBadge')}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p class="export-facts">
        <span>
          {t('uploadPieces')}: <bdi dir="ltr" data-testid="upload-pieces">{formatNumber(pieces)}</bdi>
        </span>
      </p>
      {step === 'sending' ? (
        <p class="banner banner-info" data-testid="upload-sending">
          {t('uploadSending')}
        </p>
      ) : (
        <button type="button" class="btn btn-huge btn-primary" disabled={ids.length === 0} data-testid="upload-preview-btn" onClick={sendPreview}>
          {t('uploadPreviewBtn')}
        </button>
      )}
    </main>
  );
}
