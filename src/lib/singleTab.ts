/**
 * Only one window/tab of the app may run at a time: two copies would both
 * listen to the reader or fight over the same session. Uses the Web Locks API;
 * the lock is held for the life of the page.
 */
export async function claimSingleTab(): Promise<boolean> {
  const locks = navigator.locks;
  if (!locks?.request) return true; // unsupported: allow
  return new Promise<boolean>((resolve) => {
    void locks.request('counting-app-instance', { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>(() => {}); // never released while the page lives
    });
  });
}
