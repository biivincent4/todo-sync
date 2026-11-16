import {
  describeRule,
  nextOccurrenceDue,
  nextSlot,
  occurrenceId,
  parseTimes,
  periodMinutes,
  RepeatRule,
  seriesStats,
} from '../recurrence';
import { buildNextOccurrence, closeOccurrence, startSeries } from '../series';
import { makeTask } from './factories';

// DST and calendar edge cases need a zone with daylight saving time (dates are built inside the tests).
process.env.TZ = 'America/New_York';

const t = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const fmt = (ms: number | null) => {
  if (ms == null) return null;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const rule = (r: Partial<RepeatRule> & Pick<RepeatRule, 'freq' | 'anchor'>): RepeatRule => ({
  interval: 1,
  end: { type: 'never' },
  ...r,
});

describe('nextSlot', () => {
  it('repeats every N hours from the anchor', () => {
    const r = rule({ freq: 'hourly', interval: 3, anchor: t(2026, 6, 1, 9) });
    expect(fmt(nextSlot(r, t(2026, 6, 1, 9)))).toBe('2026-06-01 12:00');
    expect(fmt(nextSlot(r, t(2026, 6, 1, 13, 30)))).toBe('2026-06-01 15:00');
    expect(fmt(nextSlot(r, t(2026, 5, 1)))).toBe('2026-06-01 09:00');
  });

  it('keeps hourly series inside an active window and resumes next morning', () => {
    const r = rule({ freq: 'hourly', interval: 3, anchor: t(2026, 6, 1, 8), window: { start: 8 * 60, end: 20 * 60 } });
    expect(fmt(nextSlot(r, t(2026, 6, 1, 8)))).toBe('2026-06-01 11:00');
    expect(fmt(nextSlot(r, t(2026, 6, 1, 17)))).toBe('2026-06-01 20:00');
    expect(fmt(nextSlot(r, t(2026, 6, 1, 20)))).toBe('2026-06-02 08:00');
    expect(fmt(nextSlot(r, t(2026, 6, 1, 3)))).toBe('2026-06-01 08:00');
  });

  it('fires several times a day at fixed times', () => {
    const r = rule({ freq: 'daily', anchor: t(2026, 6, 1, 8), times: [8 * 60, 13 * 60, 18 * 60] });
    expect(fmt(nextSlot(r, t(2026, 6, 1, 8)))).toBe('2026-06-01 13:00');
    expect(fmt(nextSlot(r, t(2026, 6, 1, 18)))).toBe('2026-06-02 08:00');
  });

  it('repeats daily and every N days', () => {
    expect(fmt(nextSlot(rule({ freq: 'daily', anchor: t(2026, 6, 1, 7, 30) }), t(2026, 6, 1, 7, 30)))).toBe(
      '2026-06-02 07:30',
    );
    const every3 = rule({ freq: 'daily', interval: 3, anchor: t(2026, 6, 1, 7) });
    expect(fmt(nextSlot(every3, t(2026, 6, 2)))).toBe('2026-06-04 07:00');
  });

  it('repeats on specific weekdays and every N weeks', () => {
    // 1 Jun 2026 is a Monday.
    const r = rule({ freq: 'weekly', anchor: t(2026, 6, 1, 9), weekdays: [1, 3, 5] });
    expect(fmt(nextSlot(r, t(2026, 6, 1, 9)))).toBe('2026-06-03 09:00');
    expect(fmt(nextSlot(r, t(2026, 6, 5, 9)))).toBe('2026-06-08 09:00');
    const biweekly = rule({ freq: 'weekly', interval: 2, anchor: t(2026, 6, 1, 9) });
    expect(fmt(nextSlot(biweekly, t(2026, 6, 1, 9)))).toBe('2026-06-15 09:00');
  });

  it('clamps monthly series to the last day of short months', () => {
    const r = rule({ freq: 'monthly', anchor: t(2026, 1, 31, 10) });
    expect(fmt(nextSlot(r, t(2026, 1, 31, 10)))).toBe('2026-02-28 10:00');
    expect(fmt(nextSlot(r, t(2026, 2, 28, 10)))).toBe('2026-03-31 10:00');
    expect(fmt(nextSlot(r, t(2026, 3, 31, 10)))).toBe('2026-04-30 10:00');
    const quarterly = rule({ freq: 'monthly', interval: 3, anchor: t(2026, 1, 15, 10) });
    expect(fmt(nextSlot(quarterly, t(2026, 1, 15, 10)))).toBe('2026-04-15 10:00');
  });

  it('moves 29 February to 28 February in non-leap years', () => {
    const r = rule({ freq: 'yearly', anchor: t(2028, 2, 29, 9) });
    expect(fmt(nextSlot(r, t(2028, 2, 29, 9)))).toBe('2029-02-28 09:00');
    expect(fmt(nextSlot(r, t(2031, 3, 1)))).toBe('2032-02-29 09:00');
  });

  it('keeps the local time of day across daylight-saving changes', () => {
    // US clocks spring forward on 8 Mar 2026 and fall back on 1 Nov 2026.
    const daily = rule({ freq: 'daily', anchor: t(2026, 3, 7, 9) });
    expect(fmt(nextSlot(daily, t(2026, 3, 7, 9)))).toBe('2026-03-08 09:00');
    expect(fmt(nextSlot(daily, t(2026, 10, 31, 9)))).toBe('2026-11-01 09:00');
    // Plain hourly series count real hours.
    const hourly = rule({ freq: 'hourly', interval: 1, anchor: t(2026, 3, 8, 1) });
    expect(nextSlot(hourly, t(2026, 3, 8, 1))! - t(2026, 3, 8, 1)).toBe(3_600_000);
  });
});

describe('nextOccurrenceDue', () => {
  const daily = rule({ freq: 'daily', anchor: t(2026, 6, 1, 8) });

  it('skips missed past slots instead of building a backlog', () => {
    expect(fmt(nextOccurrenceDue(daily, { index: 0, dueAt: t(2026, 6, 1, 8) }, t(2026, 6, 4, 10)))).toBe(
      '2026-06-05 08:00',
    );
  });

  it('follows the due date when completed early', () => {
    expect(fmt(nextOccurrenceDue(daily, { index: 0, dueAt: t(2026, 6, 3, 8) }, t(2026, 6, 1, 10)))).toBe(
      '2026-06-04 08:00',
    );
  });

  it('stops after N occurrences', () => {
    const r = { ...daily, end: { type: 'count' as const, count: 3 } };
    expect(nextOccurrenceDue(r, { index: 1, dueAt: t(2026, 6, 2, 8) }, t(2026, 6, 2, 9))).not.toBeNull();
    expect(nextOccurrenceDue(r, { index: 2, dueAt: t(2026, 6, 3, 8) }, t(2026, 6, 3, 9))).toBeNull();
  });

  it('stops after the end date (inclusive of that day)', () => {
    const r = { ...daily, end: { type: 'until' as const, until: t(2026, 6, 3) } };
    expect(fmt(nextOccurrenceDue(r, { index: 1, dueAt: t(2026, 6, 2, 8) }, t(2026, 6, 2, 9)))).toBe(
      '2026-06-03 08:00',
    );
    expect(nextOccurrenceDue(r, { index: 2, dueAt: t(2026, 6, 3, 8) }, t(2026, 6, 3, 9))).toBeNull();
  });
});

describe('helpers', () => {
  it('parses times of day', () => {
    expect(parseTimes('13:00, 8:00 18:30')).toEqual([480, 780, 1110]);
    expect(parseTimes('25:00')).toBeNull();
    expect(parseTimes('')).toBeNull();
  });

  it('describes rules', () => {
    expect(describeRule(rule({ freq: 'hourly', interval: 2, anchor: t(2026, 6, 1, 8), window: { start: 480, end: 1200 } }))).toBe(
      'Every 2 hours, 08:00–20:00',
    );
    expect(describeRule(rule({ freq: 'weekly', anchor: t(2026, 6, 1, 9), weekdays: [5, 1], end: { type: 'count', count: 4 } }))).toBe(
      'Weekly on Mon, Fri at 09:00, 4 times',
    );
  });

  it('estimates the period between occurrences', () => {
    expect(periodMinutes(rule({ freq: 'hourly', interval: 3, anchor: 0 }))).toBe(180);
    expect(periodMinutes(rule({ freq: 'daily', anchor: 0, times: [480, 780, 1080] }))).toBe(300);
  });

  it('counts completions and the current streak', () => {
    const occ = (occurrence: number, status: string, skipped = false) => ({ occurrence, status, skipped });
    expect(seriesStats([occ(0, 'done'), occ(1, 'done', true), occ(2, 'done'), occ(3, 'done'), occ(4, 'todo')])).toEqual({
      completed: 3,
      skipped: 1,
      streak: 2,
    });
  });
});

describe('series occurrences', () => {
  const NOW = t(2026, 6, 1, 9);
  const base = () => {
    const task = makeTask({ id: 'abc', dueAt: t(2026, 6, 1, 8), priority: 'high', listId: 'work', assigneeId: 'me', deliverableId: 'd1' });
    return { ...task, ...startSeries(task, { freq: 'daily', interval: 1, end: { type: 'never' } }, NOW) };
  };

  it('starts a series anchored at the due date', () => {
    const task = base();
    expect(task.series?.id).toBe('abc');
    expect(task.series?.rule.anchor).toBe(t(2026, 6, 1, 8));
    expect(task.occurrence).toBe(0);
  });

  it('builds the next occurrence with a deterministic id and copied fields', () => {
    const next = buildNextOccurrence(base(), NOW)!;
    expect(next.id).toBe(occurrenceId('abc', 1));
    expect(next.id).toBe('abc~1');
    expect(fmt(next.dueAt)).toBe('2026-06-02 08:00');
    expect(next).toMatchObject({ status: 'todo', priority: 'high', listId: 'work', assigneeId: 'me', deliverableId: 'd1', occurrence: 1 });
  });

  it('is idempotent: closing the same occurrence twice yields the same next occurrence', () => {
    const a = closeOccurrence(base(), 'complete', NOW).next!;
    const b = closeOccurrence(base(), 'complete', NOW + 60_000).next!;
    expect(a.id).toBe(b.id);
    expect(a.dueAt).toBe(b.dueAt);
  });

  it('marks skipped occurrences', () => {
    const { patch, next } = closeOccurrence(base(), 'skip', NOW);
    expect(patch).toMatchObject({ status: 'done', skipped: true });
    expect(next?.occurrence).toBe(1);
  });

  it('does not create occurrences for one-off tasks or ended series', () => {
    expect(buildNextOccurrence(makeTask(), NOW)).toBeNull();
    const ended = base();
    ended.series = { ...ended.series!, rule: { ...ended.series!.rule, end: { type: 'count', count: 1 } } };
    expect(buildNextOccurrence(ended, NOW)).toBeNull();
  });
});
