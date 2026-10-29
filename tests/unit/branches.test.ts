import { describe, expect, it } from 'vitest';
import { useFreshDB } from './helpers';
import { DEFAULT_BRANCHES, cleanBranchName, getBranches, getLastBranch, setBranches, setLastBranch } from '../../src/db/settings';

useFreshDB();

describe('branches', () => {
  it('start with the five branches', async () => {
    expect(DEFAULT_BRANCHES).toEqual(['701', '706', '707', '711', '803']);
    expect(await getBranches()).toEqual(['701', '706', '707', '711', '803']);
  });

  it('the supervisor can add and remove; the list is kept, even when emptied', async () => {
    await setBranches(['701', '999']);
    expect(await getBranches()).toEqual(['701', '999']);
    await setBranches([]);
    expect(await getBranches()).toEqual([]);
  });

  it('remembers the last branch used', async () => {
    expect(await getLastBranch()).toBeUndefined();
    await setLastBranch('707');
    expect(await getLastBranch()).toBe('707');
  });

  it('cleans names: trimmed, single spaces, at most 20 characters', () => {
    expect(cleanBranchName('  70  1 ')).toBe('70 1');
    expect(cleanBranchName('x'.repeat(30))).toHaveLength(20);
    expect(cleanBranchName('   ')).toBe('');
  });
});
