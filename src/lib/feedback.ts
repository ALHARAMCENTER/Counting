/**
 * Sound + vibration feedback. Audio must be unlocked by a user gesture
 * (the "Start" tap), after which tones play without further interaction.
 */
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    // A silent blip finishes the unlock on some Android builds.
    tone(1, 0.01, 0);
  } catch {
    ctx = null;
  }
}

function tone(freq: number, seconds: number, gain = 0.4, at = 0, type: OscillatorType = 'square'): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.setValueAtTime(0, t0 + seconds);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.02);
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/** Short, high, single beep. */
export function feedbackSuccess(): void {
  if (ctx?.state === 'suspended') void ctx.resume();
  tone(1760, 0.07, 0.35, 0, 'sine');
  vibrate(40);
}

/** Low, long, repeated buzz: clearly different from success. */
export function feedbackError(): void {
  if (ctx?.state === 'suspended') void ctx.resume();
  tone(220, 0.25, 0.5, 0);
  tone(180, 0.25, 0.5, 0.32);
  tone(220, 0.25, 0.5, 0.64);
  vibrate([300, 100, 300, 100, 300]);
}

/** Neutral double beep for confirmations (undo, close). */
export function feedbackNotice(): void {
  tone(880, 0.06, 0.3, 0, 'sine');
  tone(880, 0.06, 0.3, 0.12, 'sine');
  vibrate([60, 60, 60]);
}
