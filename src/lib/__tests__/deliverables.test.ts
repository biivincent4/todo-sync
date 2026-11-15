import { deliverableProgress, deliverableTasks, effectiveStatus, isAtRisk } from '../deliverables';
import { makeTask } from './factories';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

describe('deliverable progress', () => {
  it('rolls up linked task completion', () => {
    const tasks = [
      ...Array.from({ length: 7 }, () => makeTask({ deliverableId: 'd', status: 'done' })),
      ...Array.from({ length: 5 }, () => makeTask({ deliverableId: 'd' })),
      makeTask({ deliverableId: 'other', status: 'done' }),
    ];
    const linked = deliverableTasks(tasks, 'd');
    expect(deliverableProgress(linked)).toEqual({ done: 7, total: 12, percent: 58, label: '7 of 12 done (58%)' });
  });

  it('handles deliverables without tasks', () => {
    expect(deliverableProgress([])).toMatchObject({ percent: 0, label: '0 of 0 done (0%)' });
  });
});

describe('deliverable risk', () => {
  const future = { dueAt: NOW + 5 * DAY, status: 'in_progress' as const };
  const past = { dueAt: NOW - DAY, status: 'in_progress' as const };

  it('is at risk when any linked task is overdue', () => {
    expect(isAtRisk(future, [makeTask({ dueAt: NOW - 1 })], NOW)).toBe(true);
    expect(isAtRisk(future, [makeTask({ dueAt: NOW - 1, status: 'done' })], NOW)).toBe(false);
  });

  it('is at risk when past due with open tasks', () => {
    expect(isAtRisk(past, [makeTask()], NOW)).toBe(true);
    expect(isAtRisk(past, [makeTask({ status: 'done' })], NOW)).toBe(false);
    expect(isAtRisk(past, [], NOW)).toBe(false);
  });

  it('is never at risk once marked done', () => {
    expect(isAtRisk({ ...past, status: 'done' }, [makeTask({ dueAt: NOW - 1 })], NOW)).toBe(false);
  });

  it('derives the displayed status', () => {
    expect(effectiveStatus(past, [makeTask()], NOW)).toBe('at_risk');
    expect(effectiveStatus({ ...future, status: 'not_started' }, [makeTask({ status: 'doing' })], NOW)).toBe('in_progress');
    expect(effectiveStatus({ ...future, status: 'not_started' }, [makeTask()], NOW)).toBe('not_started');
    expect(effectiveStatus({ ...future, status: 'at_risk' }, [], NOW)).toBe('at_risk');
    expect(effectiveStatus({ ...past, status: 'done' }, [makeTask()], NOW)).toBe('done');
  });
});
