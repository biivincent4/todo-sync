const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day key, e.g. "2026-11-15". */
export function dayKey(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfDay(d: Date | number): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfDay(d: Date | number): number {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export type DueBucket = 'overdue' | 'today' | 'upcoming' | 'none';

export function dueBucket(dueAt: number | null, now: number): DueBucket {
  if (dueAt == null) return 'none';
  if (dueAt < now) return 'overdue';
  if (dueAt <= endOfDay(now)) return 'today';
  return 'upcoming';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDue(dueAt: number, now: number = Date.now()): string {
  const d = new Date(dueAt);
  const time = formatTime(dueAt);
  const diffDays = Math.round((startOfDay(dueAt) - startOfDay(now)) / 86_400_000);
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${formatTime(ms)}`;
}

export function formatLead(minutes: number): string {
  if (minutes === 0) return 'At due time';
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'} before`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
  return `${minutes} min before`;
}

/** Next occurrence (> now) of hour:minute local time. */
export function nextTimeOfDay(now: number, hour: number, minute: number): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Next occurrence (> now) of an ISO weekday (1=Mon..7=Sun) at hour:00 local time. */
export function nextWeekday(now: number, isoWeekday: number, hour: number): number {
  const d = new Date(now);
  const current = d.getDay() === 0 ? 7 : d.getDay();
  let add = (isoWeekday - current + 7) % 7;
  d.setHours(hour, 0, 0, 0);
  if (add === 0 && d.getTime() <= now) add = 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}

/** Wall-clock time for event handlers (keeps Date.now() out of render paths). */
export function clock(): number {
  return Date.now();
}
