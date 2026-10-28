import { registerSW } from 'virtual:pwa-register';

type Listener = (ready: boolean) => void;

let updateReady = false;
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();

/**
 * Registers the service worker. A new version is never activated on its own:
 * the app shows a prompt, and the caller decides when it is safe (no active
 * counting session) to apply it.
 */
export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
      listeners.forEach((l) => l(true));
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
