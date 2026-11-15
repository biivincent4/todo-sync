import { filterTasks, isFilterActive, EMPTY_FILTER } from '../filter';
import { makeTask } from './factories';

const NOW = new Date(2026, 10, 15, 9, 0).getTime();
const H = 3_600_000;

describe('filterTasks', () => {
  const tasks = [
    makeTask({ id: 'overdue', dueAt: NOW - H, listId: 'work', title: 'Report' }),
    makeTask({ id: 'today', dueAt: NOW + H, assigneeId: 'me' }),
    makeTask({ id: 'later', dueAt: NOW + 72 * H, status: 'doing', notes: 'call the bank' }),
    makeTask({ id: 'none' }),
  ];
  const ctx = { now: NOW, uid: 'me' };
  const ids = (f: Partial<typeof EMPTY_FILTER>, listId?: string) =>
    filterTasks(tasks, { ...EMPTY_FILTER, ...f }, { ...ctx, listId }).map((t) => t.id);

  it('filters by due bucket', () => {
    expect(ids({ due: 'overdue' })).toEqual(['overdue']);
    expect(ids({ due: 'today' })).toEqual(['today']);
    expect(ids({ due: 'upcoming' })).toEqual(['later']);
    expect(ids({ due: 'none' })).toEqual(['none']);
  });

  it('filters by status, list, assignee and search text', () => {
    expect(ids({ status: 'doing' })).toEqual(['later']);
    expect(ids({}, 'work')).toEqual(['overdue']);
    expect(ids({ assignedToMe: true })).toEqual(['today']);
    expect(ids({ query: 'BANK' })).toEqual(['later']);
    expect(ids({ query: 'report' })).toEqual(['overdue']);
  });

  it('knows when a filter is active', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, assignedToMe: true })).toBe(true);
  });
});
