/** Battery level watcher (Chrome/Android only; absent on iPhone). */
export interface BatteryState {
  level: number; // 0..1
  charging: boolean;
}

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

export function watchBattery(cb: (s: BatteryState) => void): () => void {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
  if (!nav.getBattery) return () => {};
  let bm: BatteryManagerLike | null = null;
  let stopped = false;
  const emit = () => bm && cb({ level: bm.level, charging: bm.charging });
  nav
    .getBattery()
    .then((b) => {
      if (stopped) return;
      bm = b;
      b.addEventListener('levelchange', emit);
      b.addEventListener('chargingchange', emit);
      emit();
    })
    .catch(() => {});
  return () => {
    stopped = true;
    bm?.removeEventListener('levelchange', emit);
    bm?.removeEventListener('chargingchange', emit);
  };
}

export type BatteryWarning = 'none' | 'low' | 'critical';

export function batteryWarning(s: BatteryState | null): BatteryWarning {
  if (!s || s.charging) return 'none';
  if (s.level <= 0.1) return 'critical';
  if (s.level <= 0.2) return 'low';
  return 'none';
}
