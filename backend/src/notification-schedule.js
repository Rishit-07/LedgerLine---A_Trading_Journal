/* Pure time rules for quiet hours and the daily summary. No database, easy to test. */
export const QUIET = { off: null, '22-07': [22, 7], '23-06': [23, 6] };
export const SUMMARY_HOUR = 20;

export function localHour(date, tz) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(date));
  } catch {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(date));
  }
}
export function inQuietHours(quiet, date, tz) {
  const window = QUIET[quiet];
  if (!window) return false;
  const hour = localHour(date, tz);
  const [from, to] = window;
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
}
/** Should a non-urgent push or email go out now, or wait? */
export function deliverNow({ quiet, delivery, tz }, date = new Date()) {
  if (inQuietHours(quiet, date, tz)) return false;
  if (delivery === 'daily') return localHour(date, tz) >= SUMMARY_HOUR;
  return true;
}
