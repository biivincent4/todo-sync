import { dayKey, dueBucket } from './dates';
import { PRIORITY_RANK, Task } from './types';

export type SuggestionReason = 'overdue' | 'today' | 'carryover' | 'high';

export interface Suggestion {
  task: Task;
  reason: SuggestionReason;
}

export const SUGGESTION_LABEL: Record<SuggestionReason, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  carryover: 'Unfinished from an earlier day',
  high: 'High priority',
};

const REASON_RANK: Record<SuggestionReason, number> = { overdue: 0, today: 1, carryover: 2, high: 3 };

/** My Day is per user and per day: yesterday's plan no longer counts, so it clears each morning. */
export function isInMyDay(task: Task, uid: string, today: string): boolean {
  return task.myDay?.[uid] === today;
}

export function myDayTasks(tasks: readonly Task[], uid: string, today: string): Task[] {
  return tasks.filter((t) => isInMyDay(t, uid, today));
}

/** Tasks that are "mine": assigned to me, or unassigned tasks I created. */
export function isRelevantTo(task: Task, uid: string): boolean {
  return task.assigneeId ? task.assigneeId === uid : task.createdBy === uid;
}

export function suggestionReason(task: Task, uid: string, now: number): SuggestionReason | null {
  if (task.status === 'done') return null;
  if (!isRelevantTo(task, uid)) return null;
  const today = dayKey(now);
  if (isInMyDay(task, uid, today)) return null;
  const bucket = dueBucket(task.dueAt, now);
  if (bucket === 'overdue') return 'overdue';
  if (bucket === 'today') return 'today';
  const planned = task.myDay?.[uid];
  if (planned != null && planned < today) return 'carryover';
  if (task.priority === 'high') return 'high';
  return null;
}

export function getSuggestions(tasks: readonly Task[], uid: string, now: number): Suggestion[] {
  const out: Suggestion[] = [];
  for (const task of tasks) {
    const reason = suggestionReason(task, uid, now);
    if (reason) out.push({ task, reason });
  }
  return out.sort(
    (a, b) =>
      REASON_RANK[a.reason] - REASON_RANK[b.reason] ||
      (a.task.dueAt ?? Infinity) - (b.task.dueAt ?? Infinity) ||
      PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority],
  );
}

export function myDayProgress(tasks: readonly Task[]): { done: number; total: number; label: string } {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  return { done, total, label: `${done} of ${total} done` };
}

/** Merge task sources (active workspace + assigned elsewhere) without duplicates. */
export function mergeTasks(...groups: readonly (readonly Task[])[]): Task[] {
  const map = new Map<string, Task>();
  for (const g of groups) for (const t of g) map.set(`${t.workspaceId}/${t.id}`, t);
  return [...map.values()];
}
