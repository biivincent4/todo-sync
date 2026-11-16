import { nextOccurrenceDue, occurrenceId, RepeatRule } from './recurrence';
import { Attachment, isStoredFile, SeriesTemplate, Task } from './types';

export type { SeriesTemplate, TaskSeries } from './types';

export function templateFrom(task: Pick<Task, keyof SeriesTemplate>): SeriesTemplate {
  return {
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    listId: task.listId,
    deliverableId: task.deliverableId,
    assigneeId: task.assigneeId,
    // Files stay owned by the occurrence that uploaded them; copies only reference them.
    attachments: task.attachments.map((a: Attachment) => (isStoredFile(a) ? { ...a, borrowed: true } : a)),
  };
}

/**
 * The occurrence that follows `task`, or null if the series has ended.
 * The id is deterministic, so creating it twice writes the same document.
 */
export function buildNextOccurrence(task: Task, now: number): Task | null {
  const series = task.series;
  if (!series) return null;
  const dueAt = nextOccurrenceDue(series.rule, { index: task.occurrence ?? 0, dueAt: task.dueAt }, now);
  if (dueAt == null) return null;
  const index = (task.occurrence ?? 0) + 1;
  return {
    ...series.template,
    attachments: [...series.template.attachments],
    id: occurrenceId(series.id, index),
    workspaceId: task.workspaceId,
    dueAt,
    status: 'todo',
    createdBy: task.createdBy,
    myDay: {},
    order: dueAt,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    sourceIdeaId: task.sourceIdeaId ?? null,
    series,
    occurrence: index,
    skipped: false,
  };
}

/** Changes to apply when an occurrence is completed or skipped, plus the next occurrence to create. */
export function closeOccurrence(
  task: Task,
  how: 'complete' | 'skip',
  now: number,
): { patch: Partial<Task>; next: Task | null } {
  return {
    patch: { status: 'done', completedAt: now, skipped: how === 'skip' },
    next: buildNextOccurrence(task, now),
  };
}

/** Start a series from a task (its current due date becomes the anchor). */
export function startSeries(task: Task, rule: Omit<RepeatRule, 'anchor'>, now: number): Partial<Task> {
  const anchor = task.dueAt ?? now;
  return {
    dueAt: anchor,
    occurrence: task.series ? (task.occurrence ?? 0) : 0,
    series: {
      id: task.series?.id ?? task.id,
      rule: { ...rule, anchor },
      template: templateFrom(task),
    },
  };
}
