export type PersistState = 'persisted' | 'not-persisted' | 'unsupported';

/** Ask the browser to protect our storage from automatic eviction. */
export async function requestPersistence(): Promise<PersistState> {
  const s = navigator.storage;
  if (!s?.persist || !s.persisted) return 'unsupported';
  try {
    if (await s.persisted()) return 'persisted';
    return (await s.persist()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'unsupported';
  }
}
