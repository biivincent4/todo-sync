import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDocsFromServer,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';

import { dayKey } from '../lib/dates';
import { newId } from '../lib/ids';
import {
  Attachment,
  Deliverable,
  Idea,
  isStoredFile,
  Priority,
  Status,
  Task,
  TaskList,
} from '../lib/types';
import { background, clean, db, paths } from './firebase';
import { enqueueStorageDeletes } from './uploadQueue';

export interface SnapshotState {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

type Col = 'tasks' | 'lists' | 'ideas' | 'deliverables';

function normalizeTask(id: string, ws: string, d: Record<string, unknown>): Task {
  const t = d as Partial<Task>;
  return {
    id,
    workspaceId: t.workspaceId ?? ws,
    title: t.title ?? '',
    notes: t.notes ?? '',
    dueAt: t.dueAt ?? null,
    priority: t.priority ?? 'medium',
    status: t.status ?? 'todo',
    listId: t.listId ?? 'personal',
    deliverableId: t.deliverableId ?? null,
    assigneeId: t.assigneeId ?? null,
    createdBy: t.createdBy ?? '',
    attachments: t.attachments ?? [],
    myDay: t.myDay ?? {},
    order: t.order ?? 0,
    createdAt: t.createdAt ?? 0,
    updatedAt: t.updatedAt ?? 0,
    completedAt: t.completedAt ?? null,
    sourceIdeaId: t.sourceIdeaId ?? null,
  };
}

function normalize(col: Col, id: string, ws: string, d: Record<string, unknown>): unknown {
  switch (col) {
    case 'tasks':
      return normalizeTask(id, ws, d);
    case 'lists':
      return { id, name: '', createdAt: 0, ...d } as TaskList;
    case 'ideas':
      return {
        id,
        workspaceId: ws,
        createdBy: '',
        title: '',
        notes: '',
        stage: 'raw',
        checklist: [],
        attachments: [],
        versions: [],
        convertedTaskIds: [],
        createdAt: 0,
        updatedAt: 0,
        ...d,
      } as Idea;
    case 'deliverables':
      return {
        id,
        workspaceId: ws,
        title: '',
        description: '',
        ownerId: null,
        dueAt: null,
        status: 'not_started',
        createdAt: 0,
        updatedAt: 0,
        ...d,
      } as Deliverable;
  }
}

/** Real-time subscription; served from the offline cache first, then from the server. */
export function subscribe<T>(
  ws: string,
  col: Col,
  onData: (items: T[], state: SnapshotState) => void,
  onError: (e: Error) => void,
): () => void {
  return onSnapshot(
    collection(db(), `workspaces/${ws}/${col}`),
    { includeMetadataChanges: true },
    (snap) => {
      onData(
        snap.docs.map((d) => normalize(col, d.id, ws, d.data()) as T),
        { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites },
      );
    },
    onError,
  );
}

/** Tasks across all workspaces that are assigned to the user (collection group query). */
export function subscribeAssignedToMe(uid: string, onData: (t: Task[]) => void): () => void {
  return onSnapshot(
    query(collectionGroup(db(), 'tasks'), where('assigneeId', '==', uid)),
    (snap) => onData(snap.docs.map((d) => normalizeTask(d.id, '', d.data()))),
    (e) => console.warn('[assigned]', e),
  );
}

/** Unassigned tasks the user created, across all workspaces (reminders go to the creator). */
export function subscribeMyUnassigned(uid: string, onData: (t: Task[]) => void): () => void {
  return onSnapshot(
    query(
      collectionGroup(db(), 'tasks'),
      where('createdBy', '==', uid),
      where('assigneeId', '==', null),
    ),
    (snap) => onData(snap.docs.map((d) => normalizeTask(d.id, '', d.data()))),
    (e) => console.warn('[mine]', e),
  );
}

/** Pull-to-refresh: force a server round-trip (snapshot listeners pick up the result). */
export async function refreshFromServer(ws: string): Promise<void> {
  await Promise.all(
    (['tasks', 'lists', 'ideas', 'deliverables'] as Col[]).map((c) =>
      getDocsFromServer(collection(db(), `workspaces/${ws}/${c}`)),
    ),
  );
}

// ---------- Tasks ----------

const taskRef = (t: Pick<Task, 'workspaceId' | 'id'>) => doc(db(), paths.tasks(t.workspaceId), t.id);

export interface NewTaskInput {
  workspaceId: string;
  createdBy: string;
  title: string;
  notes?: string;
  dueAt?: number | null;
  priority?: Priority;
  status?: Status;
  listId: string;
  deliverableId?: string | null;
  assigneeId?: string | null;
  order?: number;
  sourceIdeaId?: string | null;
  attachments?: Attachment[];
}

export function buildTask(input: NewTaskInput, now = Date.now(), id = newId()): Task {
  const status = input.status ?? 'todo';
  return {
    id,
    workspaceId: input.workspaceId,
    title: input.title.trim(),
    notes: input.notes ?? '',
    dueAt: input.dueAt ?? null,
    priority: input.priority ?? 'medium',
    status,
    listId: input.listId,
    deliverableId: input.deliverableId ?? null,
    assigneeId: input.assigneeId ?? null,
    createdBy: input.createdBy,
    attachments: input.attachments ?? [],
    myDay: {},
    order: input.order ?? now,
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'done' ? now : null,
    sourceIdeaId: input.sourceIdeaId ?? null,
  };
}

export function saveTask(task: Task): void {
  background(setDoc(taskRef(task), clean({ ...task, updatedAt: Date.now() })), 'save task');
}

export function saveTasks(tasks: readonly Task[]): void {
  const batch = writeBatch(db());
  for (const t of tasks) batch.set(taskRef(t), clean(t));
  background(batch.commit(), 'save tasks');
}

export function updateTask(task: Pick<Task, 'workspaceId' | 'id'>, patch: Partial<Task>): void {
  background(updateDoc(taskRef(task), clean({ ...patch, updatedAt: Date.now() })), 'update task');
}

export function moveTask(task: Task, status: Status, order?: number): void {
  const patch: Partial<Task> = { status };
  if (status !== task.status) patch.completedAt = status === 'done' ? Date.now() : null;
  if (order != null) patch.order = order;
  updateTask(task, patch);
}

export function setInMyDay(task: Task, uid: string, inMyDay: boolean): void {
  background(
    updateDoc(taskRef(task), {
      [`myDay.${uid}`]: inMyDay ? dayKey() : deleteField(),
      updatedAt: Date.now(),
    }),
    'my day',
  );
}

/** Files owned by these attachments (borrowed ones belong to an idea and are kept). */
export function ownedStoragePaths(attachments: readonly Attachment[]): string[] {
  return attachments.filter(isStoredFile).filter((a) => !a.borrowed).map((a) => a.storagePath);
}

export function deleteTask(task: Task): void {
  background(deleteDoc(taskRef(task)), 'delete task');
  enqueueStorageDeletes(ownedStoragePaths(task.attachments));
}

// ---------- Lists ----------

export function saveList(ws: string, list: Pick<TaskList, 'id' | 'name'> & Partial<TaskList>): void {
  background(
    setDoc(doc(db(), paths.lists(ws), list.id), clean({ createdAt: Date.now(), ...list }), { merge: true }),
    'save list',
  );
}

/** Delete a list, moving its tasks to another list. */
export function deleteList(ws: string, listId: string, tasks: readonly Task[], moveTo: string): void {
  const batch = writeBatch(db());
  for (const t of tasks.filter((x) => x.listId === listId)) {
    batch.update(taskRef(t), { listId: moveTo, updatedAt: Date.now() });
  }
  batch.delete(doc(db(), paths.lists(ws), listId));
  background(batch.commit(), 'delete list');
}

// ---------- Ideas ----------

export function saveIdea(idea: Idea): void {
  background(setDoc(doc(db(), paths.ideas(idea.workspaceId), idea.id), clean(idea)), 'save idea');
}

export function deleteIdea(idea: Idea): void {
  background(deleteDoc(doc(db(), paths.ideas(idea.workspaceId), idea.id)), 'delete idea');
  // Tasks converted from this idea may still reference its files.
  if (idea.convertedTaskIds.length === 0) enqueueStorageDeletes(ownedStoragePaths(idea.attachments));
}

/** Save tasks created from an idea together with the updated idea, atomically. */
export function commitConversion(idea: Idea, tasks: readonly Task[]): void {
  const batch = writeBatch(db());
  for (const t of tasks) batch.set(taskRef(t), clean(t));
  batch.set(doc(db(), paths.ideas(idea.workspaceId), idea.id), clean(idea));
  background(batch.commit(), 'convert idea');
}

// ---------- Deliverables ----------

export function saveDeliverable(d: Deliverable): void {
  background(
    setDoc(doc(db(), paths.deliverables(d.workspaceId), d.id), clean({ ...d, updatedAt: Date.now() })),
    'save deliverable',
  );
}

/** Delete a deliverable and unlink its tasks (the tasks themselves are kept). */
export function deleteDeliverable(d: Deliverable, tasks: readonly Task[]): void {
  const batch = writeBatch(db());
  for (const t of tasks.filter((x) => x.deliverableId === d.id)) {
    batch.update(taskRef(t), { deliverableId: null, updatedAt: Date.now() });
  }
  batch.delete(doc(db(), paths.deliverables(d.workspaceId), d.id));
  background(batch.commit(), 'delete deliverable');
}

export type { AttachmentOwner } from './uploadQueue';
