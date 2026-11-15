import { Priority, PriorityReminderSettings, ReminderSettings, Task } from './types';

export interface PlannedReminder {
  id: string;
  taskId: string;
  workspaceId: string;
  fireAt: number;
  leadMinutes: number;
  priority: Priority;
  channelId: string;
  title: string;
}

export const SNOOZE_OPTIONS = [5, 15, 60] as const;

export function channelIdFor(priority: Priority, s: PriorityReminderSettings): string {
  return `reminders-${priority}-${s.sound}-${s.vibrate ? 'vib' : 'novib'}`;
}

export function reminderId(taskId: string, leadMinutes: number): string {
  return `${taskId}:${leadMinutes}`;
}

/** Reminders go to the assignee; unassigned tasks remind their creator. */
export function reminderRecipient(task: Pick<Task, 'assigneeId' | 'createdBy'>): string {
  return task.assigneeId ?? task.createdBy;
}

type PlanFields = Pick<
  Task,
  'id' | 'workspaceId' | 'title' | 'dueAt' | 'priority' | 'status' | 'assigneeId' | 'createdBy'
>;

/** Pure reminder plan for one task: one entry per configured lead time still in the future. */
export function planReminders(
  task: PlanFields,
  settings: ReminderSettings,
  now: number,
  uid: string,
): PlannedReminder[] {
  if (task.status === 'done' || task.dueAt == null) return [];
  if (reminderRecipient(task) !== uid) return [];
  const s = settings[task.priority];
  const channelId = channelIdFor(task.priority, s);
  const dueAt = task.dueAt;
  const leads = [...new Set(s.leadMinutes)].filter((m) => m >= 0).sort((a, b) => b - a);
  return leads
    .map((lead) => ({
      id: reminderId(task.id, lead),
      taskId: task.id,
      workspaceId: task.workspaceId,
      fireAt: dueAt - lead * 60_000,
      leadMinutes: lead,
      priority: task.priority,
      channelId,
      title: task.title,
    }))
    .filter((r) => r.fireAt > now);
}

export function planAllReminders(
  tasks: readonly PlanFields[],
  settings: ReminderSettings,
  now: number,
  uid: string,
): PlannedReminder[] {
  return tasks.flatMap((t) => planReminders(t, settings, now, uid));
}

/** Signature of a scheduled reminder; any change means it must be re-created. */
export function reminderSignature(r: PlannedReminder): string {
  return `${r.fireAt}|${r.channelId}|${r.title}`;
}

/**
 * Diff the reminders currently scheduled (id -> signature) against the desired plan.
 * Editing a task reschedules, moving to Done or deleting cancels, moving back out of Done re-creates.
 */
export function diffReminders(
  scheduled: Record<string, string>,
  desired: readonly PlannedReminder[],
): { toCancel: string[]; toSchedule: PlannedReminder[] } {
  const desiredById = new Map(desired.map((r) => [r.id, r]));
  const toCancel = Object.keys(scheduled).filter((id) => {
    const want = desiredById.get(id);
    return !want || reminderSignature(want) !== scheduled[id];
  });
  const toSchedule = desired.filter((r) => scheduled[r.id] !== reminderSignature(r));
  return { toCancel, toSchedule };
}

export function snoozeUntil(now: number, minutes: number): number {
  return now + minutes * 60_000;
}
