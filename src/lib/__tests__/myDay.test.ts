import { dayKey } from '../dates';
import { getSuggestions, isInMyDay, mergeTasks, myDayProgress, myDayTasks } from '../myDay';
import { makeTask } from './factories';

// 15 Nov 2026, 09:00 local time
const NOW = new Date(2026, 10, 15, 9, 0).getTime();
const TODAY = dayKey(NOW);
const YESTERDAY = dayKey(new Date(2026, 10, 14));
const H = 3_600_000;

describe('My Day', () => {
  it('only counts tasks planned for today by this user (clears each morning)', () => {
    const today = makeTask({ id: 'today', myDay: { me: TODAY } });
    const old = makeTask({ id: 'old', myDay: { me: YESTERDAY } });
    const someoneElse = makeTask({ id: 'other', myDay: { you: TODAY } });
    expect(myDayTasks([today, old, someoneElse], 'me', TODAY).map((t) => t.id)).toEqual(['today']);
    expect(isInMyDay(old, 'me', TODAY)).toBe(false);
  });

  it('suggests overdue, due today, carry-over and high priority tasks in that order', () => {
    const tasks = [
      makeTask({ id: 'high', priority: 'high' }),
      makeTask({ id: 'carry', myDay: { me: YESTERDAY } }),
      makeTask({ id: 'dueToday', dueAt: NOW + 2 * H }),
      makeTask({ id: 'overdue', dueAt: NOW - 30 * H }),
      makeTask({ id: 'upcoming', dueAt: NOW + 72 * H }),
      makeTask({ id: 'plain' }),
    ];
    const s = getSuggestions(tasks, 'me', NOW);
    expect(s.map((x) => [x.task.id, x.reason])).toEqual([
      ['overdue', 'overdue'],
      ['dueToday', 'today'],
      ['carry', 'carryover'],
      ['high', 'high'],
    ]);
  });

  it('never suggests done tasks, tasks already planned today, or tasks assigned to others', () => {
    const tasks = [
      makeTask({ id: 'done', status: 'done', dueAt: NOW - H }),
      makeTask({ id: 'planned', priority: 'high', myDay: { me: TODAY } }),
      makeTask({ id: 'theirs', priority: 'high', assigneeId: 'you' }),
      makeTask({ id: 'mineAssigned', priority: 'high', assigneeId: 'me', createdBy: 'you' }),
    ];
    expect(getSuggestions(tasks, 'me', NOW).map((x) => x.task.id)).toEqual(['mineAssigned']);
  });

  it('reports progress', () => {
    const tasks = [makeTask({ status: 'done' }), makeTask(), makeTask({ status: 'doing' })];
    expect(myDayProgress(tasks)).toEqual({ done: 1, total: 3, label: '1 of 3 done' });
  });

  it('merges task sources without duplicates', () => {
    const a = makeTask({ id: 'a', workspaceId: 'w1' });
    const a2 = { ...a, title: 'updated' };
    const b = makeTask({ id: 'a', workspaceId: 'w2' });
    const merged = mergeTasks([a], [a2, b]);
    expect(merged).toHaveLength(2);
    expect(merged.find((t) => t.workspaceId === 'w1')?.title).toBe('updated');
  });
});
