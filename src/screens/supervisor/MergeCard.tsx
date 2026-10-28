import { useState } from 'preact/hooks';
import { useI18n } from '../../i18n';
import { BackupFormatError, mergeBackup, parseBackup } from '../../io/backup';
import { decodeBytes } from '../../io/csv';
import { Icon } from '../../ui/Icon';

/** Supervisor: import backup files from other devices (no double counting). */
export function MergeCard() {
  const { t } = useI18n();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let added = 0;
    let skipped = 0;
    for (const f of Array.from(files)) {
      try {
        const data = await parseBackup(decodeBytes(new Uint8Array(await f.arrayBuffer())).text);
        const r = await mergeBackup(data);
        added += r.rowsAdded;
        skipped += r.rowsSkipped;
      } catch (e) {
        if (e instanceof BackupFormatError) return setMsg({ ok: false, text: `${t('mergeBad')} (${f.name})` });
        throw e;
      }
    }
    setMsg({ ok: true, text: t('mergeDone', { n: added, m: skipped }) });
  };

  return (
    <section class="card" data-testid="merge-card">
      <h2>{t('mergeTitle')}</h2>
      <label class="btn">
        {t('chooseFile')}
        <input
          type="file"
          multiple
          accept=".csv,text/csv"
          class="visually-hidden"
          data-testid="merge-file"
          onChange={(e) => onFiles(e.currentTarget.files)}
        />
      </label>
      {msg && (
        <p class={msg.ok ? 'banner banner-ok' : 'banner banner-danger'} role="alert" data-testid="merge-msg">
          <Icon name={msg.ok ? 'check' : 'warning'} size={22} /> {msg.text}
        </p>
      )}
    </section>
  );
}
