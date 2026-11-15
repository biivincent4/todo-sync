import { dueBucket, DueBucket } from './dates';
import { Status, Task } from './types';

export type DueFilter = 'all' | DueBucket;

export interface TaskFilter {
  query: string;
  status: Status | 'all';
  due: DueFilter;
  assignedToMe: boolean;
}

export const EMPTY_FILTER: TaskFilter = { query: '', status: 'all', due: 'all', assignedToMe: false };

export const DUE_FILTER_LABEL: Record<DueFilter, string> = {
  all: 'Any date',
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  none: 'No date',
};

export interface FilterContext {
  now: number;
  uid: string;
  listId?: string;
}

export function matchesFilter(task: Task, f: TaskFilter, ctx: FilterContext): boolean {
  if (ctx.listId && task.listId !== ctx.listId) return false;
  if (f.status !== 'all' && task.status !== f.status) return false;
  if (f.due !== 'all' && dueBucket(task.dueAt, ctx.now) !== f.due) return false;
  if (f.assignedToMe && task.assigneeId !== ctx.uid) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !task.title.toLowerCase().includes(q) && !task.notes.toLowerCase().includes(q)) {
    return false;
  }
  return true;
}

export function filterTasks(tasks: readonly Task[], f: TaskFilter, ctx: FilterContext): Task[] {
  return tasks.filter((t) => matchesFilter(t, f, ctx));
}

export function isFilterActive(f: TaskFilter): boolean {
  return f.query.trim() !== '' || f.status !== 'all' || f.due !== 'all' || f.assignedToMe;
}
