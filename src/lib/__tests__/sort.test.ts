import { canReorderWithinColumn, orderBetween, orderForDrop, sortTasks } from '../sort';
import { makeTask } from './factories';

const H = 3_600_000;

describe('sortTasks', () => {
  it('defaults to due date earliest first, priority breaks ties, undated last', () => {
    const undatedHigh = makeTask({ id: 'undated', priority: 'high', dueAt: null });
    const lateLow = makeTask({ id: 'late', priority: 'low', dueAt: 5 * H });
    const earlyLow = makeTask({ id: 'earlyLow', priority: 'low', dueAt: 1 * H });
    const earlyHigh = makeTask({ id: 'earlyHigh', priority: 'high', dueAt: 1 * H });
    const earlyMed = makeTask({ id: 'earlyMed', priority: 'medium', dueAt: 1 * H });

    const ids = sortTasks([undatedHigh, lateLow, earlyLow, earlyHigh, earlyMed], 'due').map((t) => t.id);
    expect(ids).toEqual(['earlyHigh', 'earlyMed', 'earlyLow', 'late', 'undated']);
  });

  it('keeps multiple undated tasks at the bottom ordered by priority', () => {
    const a = makeTask({ id: 'a', priority: 'low' });
    const b = makeTask({ id: 'b', priority: 'high' });
    const c = makeTask({ id: 'c', dueAt: 10 * H });
    expect(sortTasks([a, b, c], 'due').map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by priority then due date', () => {
    const lowSoon = makeTask({ id: 'lowSoon', priority: 'low', dueAt: H });
    const highLate = makeTask({ id: 'highLate', priority: 'high', dueAt: 9 * H });
    const highSoon = makeTask({ id: 'highSoon', priority: 'high', dueAt: 2 * H });
    expect(sortTasks([lowSoon, highLate, highSoon], 'priority').map((t) => t.id)).toEqual([
      'highSoon',
      'highLate',
      'lowSoon',
    ]);
  });

  it('sorts by creation date newest first', () => {
    const old = makeTask({ id: 'old', createdAt: 1 });
    const fresh = makeTask({ id: 'fresh', createdAt: 99 });
    expect(sortTasks([old, fresh], 'created').map((t) => t.id)).toEqual(['fresh', 'old']);
  });

  it('sorts manually by order and does not mutate input', () => {
    const input = [makeTask({ id: 'x', order: 2 }), makeTask({ id: 'y', order: 0.5 })];
    expect(sortTasks(input, 'manual').map((t) => t.id)).toEqual(['y', 'x']);
    expect(input[0].id).toBe('x');
  });
});

describe('manual ordering helpers', () => {
  it('computes order between neighbours', () => {
    expect(orderBetween(undefined, undefined)).toBe(0);
    expect(orderBetween(undefined, 4)).toBe(3);
    expect(orderBetween(4, undefined)).toBe(5);
    expect(orderBetween(1, 2)).toBe(1.5);
  });

  it('computes the drop order ignoring the dragged task itself', () => {
    const col = [makeTask({ id: 'a', order: 1 }), makeTask({ id: 'b', order: 2 }), makeTask({ id: 'c', order: 3 })];
    expect(orderForDrop(col, 'c', 0)).toBe(0);
    expect(orderForDrop(col, 'a', 1)).toBe(2.5);
    expect(orderForDrop(col, 'new', 99)).toBe(4);
  });

  it('only allows in-column reordering in manual sort', () => {
    expect(canReorderWithinColumn('manual')).toBe(true);
    expect(canReorderWithinColumn('due')).toBe(false);
  });
});
