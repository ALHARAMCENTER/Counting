import { registerSW } from 'virtual:pwa-register';

type Listener = (ready: boolean) => void;

let updateReady = false;
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();

/** How often an open app asks the server whether a new version exists. */
const CHECK_EVERY_MS = 15 * 60_000;

/**
 * Registers the service worker and keeps looking for new versions.
 * A new version waits until the app decides it is safe to apply it (the home
 * screen, never in the middle of a count): see App.tsx.
 * An installed app does not look for updates by itself unless it is started
 * again, so it asks: every 15 minutes, when it comes back to the foreground,
 * and when the network returns.
 */
export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
      listeners.forEach((l) => l(true));
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      setInterval(check, CHECK_EVERY_MS);
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}

export function onUpdateReady(l: Listener): () => void {
  listeners.add(l);
  l(updateReady);
  return () => listeners.delete(l);
}

export async function applyPendingUpdate(): Promise<void> {
  await applyUpdate?.(true);
}
