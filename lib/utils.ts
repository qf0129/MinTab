/** Generate a UUID without dashes (matches the server-side device id format). */
export function compactUuid(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Short human distance from `timestamp` to now ("刚刚", "3 小时前").
 *
 * Used next to absolute timestamps so the most recent upload reads at a glance;
 * clock skew into the future collapses to "刚刚" instead of a negative value.
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  if (diff < 365 * DAY) return `${Math.floor(diff / (30 * DAY))} 个月前`;
  return `${Math.floor(diff / (365 * DAY))} 年前`;
}
