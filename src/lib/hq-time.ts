// Time formatting shared by the HQ pages.

export const HQ_TIMEZONE = 'Asia/Tbilisi';

/** "3m ago" / "in 2h" — works for past and future timestamps. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  const fmt = (n: number, unit: string) => (diffSec < 0 ? `${n}${unit} ago` : `in ${n}${unit}`);
  if (abs < 60) return diffSec < 0 ? 'just now' : 'in <1m';
  if (abs < 3600) return fmt(Math.round(abs / 60), 'm');
  if (abs < 86400) return fmt(Math.round(abs / 3600), 'h');
  return fmt(Math.round(abs / 86400), 'd');
}

/** Absolute time in Tbilisi (or another IANA zone), e.g. "2 Nov, 08:00". */
export function formatTbilisi(iso: string | null | undefined, timeZone: string = HQ_TIMEZONE): string {
  if (!iso) return '—';
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
  } catch {
    zone = HQ_TIMEZONE; // unknown zone string: fall back rather than crash the table
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}
