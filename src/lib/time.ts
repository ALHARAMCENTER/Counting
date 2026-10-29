const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Local time text of an ISO timestamp, "YYYY-MM-DD HH:MM:SS".
 * Timestamps are stored in UTC; everything a person reads (screens and
 * files) uses the device's own time zone. `offsetMinutes` is for tests.
 */
export function formatLocalTime(iso: string, offsetMinutes = -new Date(iso).getTimezoneOffset()): string {
  const d = new Date(new Date(iso).getTime() + offsetMinutes * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Same, without seconds, for lists on screen. */
export const formatLocalMinute = (iso: string) => formatLocalTime(iso).slice(0, 16);
