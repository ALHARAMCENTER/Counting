import { catalogs, LANGS, DIR, type Lang } from '../i18n';
import { Icon } from '../ui/Icon';

/** First-run language picker. Each option is written in its own language. */
export function LanguageScreen({ current, onPick }: { current: Lang; onPick: (l: Lang) => void }) {
  return (
    <main class="screen center">
      <h1 class="title-multi">
        <Icon name="globe" size={40} />
        {LANGS.map((l) => (
          <span key={l} dir={DIR[l]} lang={l}>
            {catalogs[l].chooseLanguage}
          </span>
        ))}
      </h1>
      <div class="stack">
        {LANGS.map((l) => (
          <button
            type="button"
            key={l}
            lang={l}
            dir={DIR[l]}
            class={l === current ? 'btn btn-huge btn-primary' : 'btn btn-huge'}
            onClick={() => onPick(l)}
            data-testid={`lang-${l}`}
          >
            {catalogs[l].langName}
          </button>
        ))}
      </div>
    </main>
  );
}
