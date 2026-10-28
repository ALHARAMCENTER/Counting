import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Guard: spreadsheets and data folders must never be committable.
const ignored = (path: string) => {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', path]);
    return true;
  } catch {
    return false;
  }
};

describe('.gitignore privacy rules', () => {
  it.each(['stock.csv', 'a/b/count.xlsx', 'old.xls', 'data/x.txt', 'src/data/y.json', 'private/z', 'samples/other.csv'])(
    'ignores %s',
    (p) => expect(ignored(p)).toBe(true),
  );

  it('keeps the single fake sample file', () => {
    expect(ignored('samples/sample-system.csv')).toBe(false);
  });
});
