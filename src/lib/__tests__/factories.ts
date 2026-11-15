import { Task } from '../types';

let seq = 0;

export function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    workspaceId: 'ws1',
    title: `Task ${seq}`,
    notes: '',
    dueAt: null,
    priority: 'medium',
    status: 'todo',
    listId: 'personal',
    deliverableId: null,
    assigneeId: null,
    createdBy: 'me',
    attachments: [],
    myDay: {},
    order: seq,
    createdAt: 1_000 + seq,
    updatedAt: 1_000 + seq,
    completedAt: null,
    sourceIdeaId: null,
    ...overrides,
  };
}
