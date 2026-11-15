import { newId } from './ids';
import {
  Attachment,
  ChecklistItem,
  Idea,
  IDEA_STAGE_META,
  IdeaStage,
  isStoredFile,
  Priority,
  Task,
} from './types';

export const MAX_IDEA_VERSIONS = 50;

export type IdeaSort = 'updated' | 'created' | 'stage';
export const IDEA_SORT_LABEL: Record<IdeaSort, string> = {
  updated: 'Recently edited',
  created: 'Newest',
  stage: 'Stage',
};

export function newIdea(
  input: { title: string; notes?: string; workspaceId: string; createdBy: string },
  now: number,
  id: string = newId(),
): Idea {
  const title = input.title.trim() || 'Untitled idea';
  const notes = input.notes ?? '';
  return {
    id,
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    title,
    notes,
    stage: 'raw',
    checklist: [],
    attachments: [],
    versions: [{ id: newId(), title, notes, savedAt: now }],
    convertedTaskIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply an edit. Every save that changes the title or notes appends a timestamped
 * version (newest last); history is capped at MAX_IDEA_VERSIONS.
 */
export function applyIdeaEdit(
  idea: Idea,
  patch: Partial<Pick<Idea, 'title' | 'notes' | 'stage' | 'checklist' | 'attachments'>>,
  now: number,
): Idea {
  const next: Idea = { ...idea, ...patch, updatedAt: now };
  const contentChanged = next.title !== idea.title || next.notes !== idea.notes;
  if (contentChanged) {
    const versions = [...idea.versions, { id: newId(), title: next.title, notes: next.notes, savedAt: now }];
    next.versions = versions.slice(-MAX_IDEA_VERSIONS);
  }
  return next;
}

/** Versions newest first, for the history view. */
export function versionHistory(idea: Pick<Idea, 'versions'>): Idea['versions'] {
  return [...idea.versions].sort((a, b) => b.savedAt - a.savedAt);
}

/** Restoring an old version is itself a new edit, so history is never rewritten. */
export function restoreVersion(idea: Idea, versionId: string, now: number): Idea {
  const v = idea.versions.find((x) => x.id === versionId);
  if (!v) return idea;
  return applyIdeaEdit(idea, { title: v.title, notes: v.notes }, now);
}

export function sortIdeas(ideas: readonly Idea[], mode: IdeaSort): Idea[] {
  const list = [...ideas];
  if (mode === 'created') return list.sort((a, b) => b.createdAt - a.createdAt);
  if (mode === 'stage') {
    return list.sort(
      (a, b) => IDEA_STAGE_META[a.stage].rank - IDEA_STAGE_META[b.stage].rank || b.updatedAt - a.updatedAt,
    );
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function filterIdeas(ideas: readonly Idea[], stage: IdeaStage | 'all', query: string): Idea[] {
  const q = query.trim().toLowerCase();
  return ideas.filter(
    (i) =>
      (stage === 'all' || i.stage === stage) &&
      (!q || i.title.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q)),
  );
}

export function staleIdeas(ideas: readonly Idea[], staleDays: number, now: number): Idea[] {
  const cutoff = now - staleDays * 86_400_000;
  return ideas.filter((i) => i.stage !== 'ready' && i.updatedAt < cutoff);
}

export interface ConvertOptions {
  listId: string;
  deliverableId: string | null;
  priority?: Priority;
  createdBy: string;
  now: number;
  /** Order value for the first created task; later ones increment. */
  startOrder?: number;
  idFactory?: () => string;
}

/** Copy attachments for a task. Stored files stay owned by the idea, so the task marks them borrowed. */
function borrowAttachments(attachments: readonly Attachment[]): Attachment[] {
  return attachments.map((a) => (isStoredFile(a) ? { ...a, borrowed: true } : { ...a }));
}

function baseTask(idea: Idea, opts: ConvertOptions, id: string, order: number): Task {
  return {
    id,
    workspaceId: idea.workspaceId,
    title: idea.title,
    notes: '',
    dueAt: null,
    priority: opts.priority ?? 'medium',
    status: 'todo',
    listId: opts.listId,
    deliverableId: opts.deliverableId,
    assigneeId: null,
    createdBy: opts.createdBy,
    attachments: [],
    myDay: {},
    order,
    createdAt: opts.now,
    updatedAt: opts.now,
    completedAt: null,
    sourceIdeaId: idea.id,
  };
}

export function checklistAsText(items: readonly ChecklistItem[]): string {
  return items.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n');
}

/** Convert a whole idea into one task that links back to it. */
export function ideaToTask(idea: Idea, opts: ConvertOptions): Task {
  const id = (opts.idFactory ?? newId)();
  const task = baseTask(idea, opts, id, opts.startOrder ?? 0);
  const parts = [idea.notes.trim(), idea.checklist.length ? checklistAsText(idea.checklist) : '']
    .filter(Boolean);
  task.notes = parts.join('\n\n');
  task.attachments = borrowAttachments(idea.attachments);
  return task;
}

/** Turn each not-yet-converted checklist item into its own task. */
export function checklistToTasks(idea: Idea, opts: ConvertOptions): Task[] {
  const factory = opts.idFactory ?? newId;
  let order = opts.startOrder ?? 0;
  return idea.checklist
    .filter((item) => !item.taskId && item.text.trim())
    .map((item) => {
      const t = baseTask(idea, opts, factory(), order++);
      t.title = item.text.trim();
      t.notes = `From idea: ${idea.title}`;
      t.status = item.done ? 'done' : 'todo';
      t.completedAt = item.done ? opts.now : null;
      return t;
    });
}

/** Record the conversion on the idea (checklist items -> task ids, convertedTaskIds). */
export function markConverted(
  idea: Idea,
  tasks: readonly Task[],
  now: number,
  checklistItemIds?: readonly string[],
): Idea {
  const checklist = checklistItemIds
    ? idea.checklist.map((item) => {
        const i = checklistItemIds.indexOf(item.id);
        return i >= 0 && tasks[i] ? { ...item, taskId: tasks[i].id } : item;
      })
    : idea.checklist;
  return {
    ...idea,
    checklist,
    convertedTaskIds: [...idea.convertedTaskIds, ...tasks.map((t) => t.id)],
    updatedAt: now,
  };
}

/** Ids of checklist items checklistToTasks will convert, in the same order. */
export function convertibleChecklistIds(idea: Idea): string[] {
  return idea.checklist.filter((i) => !i.taskId && i.text.trim()).map((i) => i.id);
}
