import { t } from './i18n';

/** Generate a UUID without dashes (matches the server-side device id format). */
export function compactUuid(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Short human distance from `timestamp` to now ("刚刚", "3 hours ago").
 *
 * Used next to absolute timestamps so the most recent upload reads at a glance;
 * clock skew into the future collapses to "just now" instead of a negative value.
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  if (diff < MINUTE) return t('time_justNow');
  if (diff < HOUR) return t('time_minutes', { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t('time_hours', { count: Math.floor(diff / HOUR) });
  if (diff < 30 * DAY) return t('time_days', { count: Math.floor(diff / DAY) });
  if (diff < 365 * DAY) return t('time_months', { count: Math.floor(diff / (30 * DAY)) });
  return t('time_years', { count: Math.floor(diff / (365 * DAY)) });
}
