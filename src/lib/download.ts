/** Saves a file through the browser (Downloads folder on Android). */
export function downloadFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const CSV_TYPE = 'text/csv;charset=utf-8';
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * File-name safe text. Only ASCII letters, digits and - . _ are kept: Arabic
 * and Urdu names are replaced or dropped by some phones and browsers when a
 * file is saved, so the details live inside the file, not in its name.
 */
export function fileSafe(s: string, fallback = 'x'): string {
  const ascii = s
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 40);
  return /[A-Za-z0-9]/.test(ascii) ? ascii : fallback;
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
