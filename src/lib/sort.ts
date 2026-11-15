import { PRIORITY_RANK, SortMode, Task } from './types';

type Comparator = (a: Task, b: Task) => number;

const byDue: Comparator = (a, b) => {
  if (a.dueAt == null && b.dueAt == null) return 0;
  if (a.dueAt == null) return 1;
  if (b.dueAt == null) return -1;
  return a.dueAt - b.dueAt;
};

const byPriority: Comparator = (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
const byCreatedDesc: Comparator = (a, b) => b.createdAt - a.createdAt;
const byOrder: Comparator = (a, b) => a.order - b.order;
const byId: Comparator = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function chain(...cmps: Comparator[]): Comparator {
  return (a, b) => {
    for (const cmp of cmps) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

export const COMPARATORS: Record<SortMode, Comparator> = {
  // Earliest due first, ties by priority (high first), undated tasks last.
  due: chain(byDue, byPriority, byCreatedDesc, byId),
  priority: chain(byPriority, byDue, byCreatedDesc, byId),
  created: chain(byCreatedDesc, byId),
  manual: chain(byOrder, byCreatedDesc, byId),
};

export function sortTasks(tasks: readonly Task[], mode: SortMode): Task[] {
  return [...tasks].sort(COMPARATORS[mode]);
}

export const SORT_LABEL: Record<SortMode, string> = {
  due: 'Due date',
  priority: 'Priority',
  created: 'Created',
  manual: 'Manual',
};

/** Order value that places an item between two neighbours (either may be missing). */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before == null && after == null) return 0;
  if (before == null) return (after as number) - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

/**
 * Order value for dropping `taskId` at `index` of a column sorted by order
 * (the dragged task may or may not already be in that column).
 */
export function orderForDrop(column: readonly Task[], taskId: string, index: number): number {
  const others = column.filter((t) => t.id !== taskId);
  const i = Math.max(0, Math.min(index, others.length));
  return orderBetween(others[i - 1]?.order, others[i]?.order);
}

/** Only manual sort allows reordering within a column; moving between columns is always allowed. */
export function canReorderWithinColumn(mode: SortMode): boolean {
  return mode === 'manual';
}
