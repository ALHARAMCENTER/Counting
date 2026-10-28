/**
 * Keeps the screen on while a session is open. The browser drops the lock when
 * the page is hidden, so it is requested again whenever the page is visible.
 */
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!wanted || sentinel || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

const onVisible = () => void acquire();

export function keepScreenOn(): void {
  if (wanted) return;
  wanted = true;
  document.addEventListener('visibilitychange', onVisible);
  void acquire();
}

export function allowScreenOff(): void {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisible);
  void sentinel?.release();
  sentinel = null;
}

export const isWakeLockSupported = () => 'wakeLock' in navigator;
