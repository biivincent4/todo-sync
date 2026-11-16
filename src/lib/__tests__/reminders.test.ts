import {
  channelIdFor,
  diffReminders,
  planAllReminders,
  planReminders,
  reminderRecipient,
  reminderSignature,
  snoozeUntil,
} from '../reminders';
import { DEFAULT_SETTINGS, ReminderSettings } from '../types';
import { makeTask } from './factories';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const settings = DEFAULT_SETTINGS.reminders;

describe('planReminders', () => {
  it('schedules high priority at 1 day, 1 hour and at the due time by default', () => {
    const task = makeTask({ id: 'h', priority: 'high', dueAt: NOW + 3 * 1440 * MIN });
    const plan = planReminders(task, settings, NOW, 'me');
    expect(plan.map((r) => r.leadMinutes)).toEqual([1440, 60, 0]);
    expect(plan.map((r) => r.id)).toEqual(['h:1440', 'h:60', 'h:0']);
    expect(plan[0].fireAt).toBe(task.dueAt! - 1440 * MIN);
    expect(plan[0].channelId).toBe(channelIdFor('high', settings.high));
  });

  it('uses 1 hour for medium and the due time for low by default', () => {
    const due = NOW + 10 * 60 * MIN;
    expect(planReminders(makeTask({ priority: 'medium', dueAt: due }), settings, NOW, 'me').map((r) => r.leadMinutes)).toEqual([60]);
    const low = planReminders(makeTask({ priority: 'low', dueAt: due }), settings, NOW, 'me');
    expect(low.map((r) => r.fireAt)).toEqual([due]);
    expect(low[0].channelId).toContain('silent');
  });

  it('skips reminders already in the past', () => {
    const task = makeTask({ priority: 'high', dueAt: NOW + 30 * MIN });
    expect(planReminders(task, settings, NOW, 'me').map((r) => r.leadMinutes)).toEqual([0]);
  });

  it('plans nothing for done or undated tasks', () => {
    expect(planReminders(makeTask({ status: 'done', dueAt: NOW + 5 * MIN }), settings, NOW, 'me')).toEqual([]);
    expect(planReminders(makeTask({ dueAt: null }), settings, NOW, 'me')).toEqual([]);
  });

  it('respects custom lead times and de-duplicates them', () => {
    const custom: ReminderSettings = {
      ...settings,
      medium: { leadMinutes: [15, 15, 120], sound: 'default', vibrate: false },
    };
    const plan = planReminders(makeTask({ priority: 'medium', dueAt: NOW + 1440 * MIN }), custom, NOW, 'me');
    expect(plan.map((r) => r.leadMinutes)).toEqual([120, 15]);
  });

  it('sends reminders to the assignee, or to the creator when unassigned', () => {
    const assigned = makeTask({ assigneeId: 'you', createdBy: 'me', dueAt: NOW + 1440 * MIN });
    const unassigned = makeTask({ assigneeId: null, createdBy: 'me', dueAt: NOW + 1440 * MIN });
    expect(reminderRecipient(assigned)).toBe('you');
    expect(planReminders(assigned, settings, NOW, 'me')).toEqual([]);
    expect(planReminders(assigned, settings, NOW, 'you')).toHaveLength(1);
    expect(planReminders(unassigned, settings, NOW, 'me')).toHaveLength(1);
  });

  it('keeps hourly repeating tasks to one reminder per occurrence', () => {
    const hourly = makeTask({
      priority: 'high',
      dueAt: NOW + 50 * MIN,
      series: {
        id: 's',
        rule: { freq: 'hourly', interval: 1, anchor: NOW - 10 * MIN, end: { type: 'never' } },
        template: { title: 'Drink water', notes: '', priority: 'high', listId: 'personal', deliverableId: null, assigneeId: null, attachments: [] },
      },
    });
    // Default high leads are 1 day, 1 hour and 0: only "at due time" is shorter than the 1-hour gap.
    expect(planReminders(hourly, settings, NOW, 'me').map((r) => r.leadMinutes)).toEqual([0]);
  });
});

describe('diffReminders', () => {
  const task = makeTask({ id: 'a', priority: 'medium', dueAt: NOW + 1440 * MIN });
  const scheduledFor = (t = task) =>
    Object.fromEntries(planReminders(t, settings, NOW, 'me').map((r) => [r.id, reminderSignature(r)]));

  it('schedules new tasks and leaves unchanged ones alone', () => {
    const desired = planAllReminders([task], settings, NOW, 'me');
    expect(diffReminders({}, desired).toSchedule.map((r) => r.id)).toEqual(['a:60']);
    expect(diffReminders(scheduledFor(), desired)).toEqual({ toCancel: [], toSchedule: [] });
  });

  it('reschedules when a task is edited', () => {
    const edited = { ...task, dueAt: task.dueAt! + 30 * MIN };
    const d = diffReminders(scheduledFor(), planAllReminders([edited], settings, NOW, 'me'));
    expect(d.toCancel).toEqual(['a:60']);
    expect(d.toSchedule.map((r) => r.fireAt)).toEqual([edited.dueAt - 60 * MIN]);
  });

  it('cancels when moved to Done or deleted, and reschedules when moved back', () => {
    const done = { ...task, status: 'done' as const };
    expect(diffReminders(scheduledFor(), planAllReminders([done], settings, NOW, 'me')).toCancel).toEqual(['a:60']);
    expect(diffReminders(scheduledFor(), []).toCancel).toEqual(['a:60']);
    const reopened = { ...done, status: 'todo' as const };
    expect(diffReminders({}, planAllReminders([reopened], settings, NOW, 'me')).toSchedule).toHaveLength(1);
  });

  it('computes snooze times', () => {
    expect(snoozeUntil(NOW, 15)).toBe(NOW + 15 * MIN);
  });
});
