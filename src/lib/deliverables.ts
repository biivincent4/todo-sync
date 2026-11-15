import { Deliverable, DeliverableStatus, Task } from './types';

export interface DeliverableProgress {
  done: number;
  total: number;
  percent: number;
  label: string;
}

export function deliverableTasks(tasks: readonly Task[], deliverableId: string): Task[] {
  return tasks.filter((t) => t.deliverableId === deliverableId);
}

export function deliverableProgress(tasks: readonly Task[]): DeliverableProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent, label: `${done} of ${total} done (${percent}%)` };
}

/**
 * At risk when any linked task is overdue, or the deliverable itself is past
 * due while it still has open tasks.
 */
export function isAtRisk(
  deliverable: Pick<Deliverable, 'dueAt' | 'status'>,
  tasks: readonly Task[],
  now: number,
): boolean {
  if (deliverable.status === 'done') return false;
  const open = tasks.filter((t) => t.status !== 'done');
  if (open.some((t) => t.dueAt != null && t.dueAt < now)) return true;
  return deliverable.dueAt != null && deliverable.dueAt < now && open.length > 0;
}

/** Status shown to users: a manual "Done" wins, otherwise computed risk overrides the stored status. */
export function effectiveStatus(
  deliverable: Pick<Deliverable, 'dueAt' | 'status'>,
  tasks: readonly Task[],
  now: number,
): DeliverableStatus {
  if (deliverable.status === 'done') return 'done';
  if (isAtRisk(deliverable, tasks, now)) return 'at_risk';
  if (deliverable.status === 'at_risk') return 'at_risk';
  if (deliverable.status === 'not_started' && tasks.some((t) => t.status !== 'todo')) {
    return 'in_progress';
  }
  return deliverable.status;
}
