/**
 * Repeating tasks. A series is described by a rule plus an anchor (the first
 * due time). Each open task is one occurrence; completing or skipping it creates
 * the next occurrence with a deterministic id, so doing that twice (offline, or
 * on two devices) writes the same document instead of a duplicate.
 */

export type RepeatFreq = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RepeatEnd =
  | { type: 'never' }
  | { type: 'until'; until: number }
  | { type: 'count'; count: number };

export interface RepeatRule {
  freq: RepeatFreq;
  /** Every N hours/days/weeks/months/years (>= 1). */
  interval: number;
  /** First due time; fixes the time of day, weekday, day of month and month. */
  anchor: number;
  /** daily: fixed times of day, in minutes after midnight (e.g. 08:00 = 480). */
  times?: number[];
  /** weekly: days of the week, 0 = Sunday ... 6 = Saturday. */
  weekdays?: number[];
  /** hourly: only repeat inside this daily window (minutes after midnight). */
  window?: { start: number; end: number } | null;
  end: RepeatEnd;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(t: number): Date {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole calendar days between two local dates (DST-safe). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b.getTime()).getTime() - startOfDay(a.getTime()).getTime()) / DAY_MS);
}

/** Monday of the week containing d. */
function startOfWeek(d: Date): Date {
  const s = startOfDay(d.getTime());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function at(day: Date, minutes: number): number {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60).getTime();
}

export function minutesOfDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

export function formatMinutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Parse "8:00, 13:00,18:30" into sorted unique minutes; null if anything is invalid. */
export function parseTimes(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const p of parts) {
    const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(p);
    if (!m || +m[1] > 23 || +(m[2] ?? 0) > 59) return null;
    out.push(+m[1] * 60 + +(m[2] ?? 0));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Times of day at which a rule fires on an eligible day. */
function timesForDay(rule: RepeatRule): number[] {
  if (rule.freq === 'hourly' && rule.window) {
    const out: number[] = [];
    const step = Math.max(1, rule.interval) * 60;
    for (let m = rule.window.start; m <= rule.window.end && m < 24 * 60; m += step) out.push(m);
    return out;
  }
  if (rule.freq === 'daily' && rule.times?.length) return [...rule.times].sort((a, b) => a - b);
  return [minutesOfDay(rule.anchor)];
}

function dayIsEligible(rule: RepeatRule, day: Date): boolean {
  const anchor = new Date(rule.anchor);
  const n = Math.max(1, rule.interval);
  switch (rule.freq) {
    case 'hourly':
      return true;
    case 'daily':
      return daysBetween(anchor, day) % n === 0;
    case 'weekly': {
      const weekdays = rule.weekdays?.length ? rule.weekdays : [anchor.getDay()];
      if (!weekdays.includes(day.getDay())) return false;
      const weeks = Math.round(daysBetween(startOfWeek(anchor), startOfWeek(day)) / 7);
      return weeks % n === 0;
    }
    case 'monthly': {
      const months = (day.getFullYear() - anchor.getFullYear()) * 12 + day.getMonth() - anchor.getMonth();
      if (months % n !== 0) return false;
      // Day 31 falls back to the last day of shorter months.
      return day.getDate() === Math.min(anchor.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
    }
    case 'yearly': {
      const years = day.getFullYear() - anchor.getFullYear();
      if (years % n !== 0 || day.getMonth() !== anchor.getMonth()) return false;
      // 29 Feb falls back to 28 Feb in non-leap years.
      return day.getDate() === Math.min(anchor.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
    }
  }
}

/** First occurrence of the rule strictly after `after` (ignores end conditions). */
export function nextSlot(rule: RepeatRule, after: number): number | null {
  const from = Math.max(after, rule.anchor - 1);
  if (rule.freq === 'hourly' && !rule.window) {
    // Plain "every N hours" counts real elapsed hours, so DST changes don't shift it.
    const step = Math.max(1, rule.interval) * HOUR_MS;
    const k = Math.floor((from - rule.anchor) / step) + 1;
    return rule.anchor + Math.max(0, k) * step;
  }
  const maxDays = 370 * Math.max(1, rule.interval) + 400;
  const day = startOfDay(from);
  for (let i = 0; i <= maxDays; i++) {
    if (dayIsEligible(rule, day)) {
      for (const m of timesForDay(rule)) {
        const t = at(day, m);
        if (t > from) return t;
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return null;
}

/** Due time for occurrence `index + 1`, or null when the series has ended. */
export function nextOccurrenceDue(
  rule: RepeatRule,
  current: { index: number; dueAt: number | null },
  now: number,
): number | null {
  if (rule.end.type === 'count' && current.index + 1 >= rule.end.count) return null;
  // Missed occurrences in the past are skipped, so a late completion doesn't
  // leave a backlog (important for hourly series).
  const next = nextSlot(rule, Math.max(current.dueAt ?? now, now));
  if (next == null) return null;
  if (rule.end.type === 'until') {
    const until = new Date(rule.end.until);
    until.setHours(23, 59, 59, 999);
    if (next > until.getTime()) return null;
  }
  return next;
}

/** Deterministic id of the occurrence with the given index. */
export function occurrenceId(seriesId: string, index: number): string {
  return index === 0 ? seriesId : `${seriesId}~${index}`;
}

/** Rough time between occurrences, used to keep reminders from piling up. */
export function periodMinutes(rule: RepeatRule): number {
  const n = Math.max(1, rule.interval);
  switch (rule.freq) {
    case 'hourly':
      return n * 60;
    case 'daily': {
      const times = rule.times?.length ? [...rule.times].sort((a, b) => a - b) : [];
      if (times.length < 2) return n * 1440;
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      gaps.push(1440 - times[times.length - 1] + times[0]);
      return Math.min(...gaps);
    }
    case 'weekly':
      return (rule.weekdays?.length ?? 1) > 1 ? 1440 : n * 7 * 1440;
    case 'monthly':
      return n * 28 * 1440;
    case 'yearly':
      return n * 365 * 1440;
  }
}

export function describeRule(rule: RepeatRule): string {
  const n = Math.max(1, rule.interval);
  const time = formatMinutes(minutesOfDay(rule.anchor));
  const anchor = new Date(rule.anchor);
  let base: string;
  switch (rule.freq) {
    case 'hourly':
      base = n === 1 ? 'Every hour' : `Every ${n} hours`;
      if (rule.window) base += `, ${formatMinutes(rule.window.start)}–${formatMinutes(rule.window.end)}`;
      break;
    case 'daily':
      base = n === 1 ? 'Daily' : `Every ${n} days`;
      base += rule.times?.length ? ` at ${rule.times.map(formatMinutes).join(', ')}` : ` at ${time}`;
      break;
    case 'weekly': {
      const days = (rule.weekdays?.length ? rule.weekdays : [anchor.getDay()])
        .slice()
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => WEEKDAY_SHORT[d]);
      base = `${n === 1 ? 'Weekly' : `Every ${n} weeks`} on ${days.join(', ')} at ${time}`;
      break;
    }
    case 'monthly':
      base = `${n === 1 ? 'Monthly' : `Every ${n} months`} on day ${anchor.getDate()} at ${time}`;
      break;
    case 'yearly':
      base = `${n === 1 ? 'Yearly' : `Every ${n} years`} on ${anchor.getDate()} ${MONTHS[anchor.getMonth()]} at ${time}`;
      break;
  }
  if (rule.end.type === 'count') base += `, ${rule.end.count} times`;
  if (rule.end.type === 'until') {
    const u = new Date(rule.end.until);
    base += `, until ${u.getDate()} ${MONTHS[u.getMonth()]} ${u.getFullYear()}`;
  }
  return base;
}

export interface SeriesStats {
  completed: number;
  skipped: number;
  /** Consecutive completed (not skipped) occurrences, most recent first. */
  streak: number;
}

export function seriesStats(
  occurrences: readonly { occurrence: number; status: string; skipped?: boolean | null }[],
): SeriesStats {
  const closed = occurrences.filter((o) => o.status === 'done').sort((a, b) => b.occurrence - a.occurrence);
  let streak = 0;
  for (const o of closed) {
    if (o.skipped) break;
    streak++;
  }
  return {
    completed: closed.filter((o) => !o.skipped).length,
    skipped: closed.filter((o) => o.skipped).length,
    streak,
  };
}
