import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { cleanBranchName, getBranches, MAX_BRANCHES, setBranches } from '../db/settings';
import { Icon } from '../ui/Icon';

/** Supervisor: the branches workers choose from. Changes are saved at once. */
export function BranchesCard() {
  const { t } = useI18n();
  const [list, setList] = useState<string[] | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    getBranches().then(setList);
  }, []);
  if (!list) return null;

  const save = async (next: string[]) => {
    setList(next);
    await setBranches(next);
  };
  const add = () => {
    const v = cleanBranchName(name);
    setName('');
    if (v && !list.includes(v) && list.length < MAX_BRANCHES) void save([...list, v]);
  };

  return (
    <section class="card" data-testid="branches-card">
      <h2>
        <Icon name="gear" /> {t('branchesTitle')}
      </h2>
      <ul class="list">
        {list.map((b) => (
          <li key={b}>
            <bdi dir="ltr" class="mono">
              {b}
            </bdi>
            <button type="button" class="btn btn-small" data-testid={`branch-remove-${b}`} onClick={() => save(list.filter((x) => x !== b))}>
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>
      <form
        class="row-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          class="text-input grow"
          data-testid="branch-new"
          value={name}
          maxLength={20}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <button type="submit" class="btn" data-testid="branch-add">
          {t('addBranch')}
        </button>
      </form>
    </section>
  );
}
