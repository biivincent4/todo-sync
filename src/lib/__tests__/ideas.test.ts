import {
  applyIdeaEdit,
  checklistToTasks,
  convertibleChecklistIds,
  filterIdeas,
  ideaToTask,
  markConverted,
  MAX_IDEA_VERSIONS,
  newIdea,
  restoreVersion,
  sortIdeas,
  staleIdeas,
  versionHistory,
} from '../ideas';
import { Idea } from '../types';

const T0 = 1_000_000;
const base = () => newIdea({ title: 'App idea', notes: 'rough', workspaceId: 'ws', createdBy: 'me' }, T0, 'idea1');

describe('idea version history', () => {
  it('starts with one version', () => {
    const idea = base();
    expect(idea.versions).toHaveLength(1);
    expect(idea.versions[0]).toMatchObject({ title: 'App idea', notes: 'rough', savedAt: T0 });
    expect(idea.stage).toBe('raw');
  });

  it('adds a timestamped version for each saved content edit', () => {
    let idea = base();
    idea = applyIdeaEdit(idea, { notes: 'less rough' }, T0 + 1);
    idea = applyIdeaEdit(idea, { title: 'Better app idea' }, T0 + 2);
    expect(idea.versions.map((v) => v.savedAt)).toEqual([T0, T0 + 1, T0 + 2]);
    expect(versionHistory(idea)[0]).toMatchObject({ title: 'Better app idea', notes: 'less rough' });
  });

  it('does not add a version for non-content changes', () => {
    const idea = applyIdeaEdit(base(), { stage: 'developing' }, T0 + 5);
    expect(idea.versions).toHaveLength(1);
    expect(idea.updatedAt).toBe(T0 + 5);
  });

  it('caps the history', () => {
    let idea = base();
    for (let i = 0; i < MAX_IDEA_VERSIONS + 10; i++) idea = applyIdeaEdit(idea, { notes: `n${i}` }, T0 + i + 1);
    expect(idea.versions).toHaveLength(MAX_IDEA_VERSIONS);
    expect(idea.versions[idea.versions.length - 1].notes).toBe(`n${MAX_IDEA_VERSIONS + 9}`);
  });

  it('restores a past version as a new version', () => {
    let idea = applyIdeaEdit(base(), { notes: 'changed' }, T0 + 1);
    idea = restoreVersion(idea, idea.versions[0].id, T0 + 2);
    expect(idea.notes).toBe('rough');
    expect(idea.versions).toHaveLength(3);
  });
});

describe('idea to task conversion', () => {
  const withChecklist = (): Idea => ({
    ...base(),
    checklist: [
      { id: 'c1', text: 'Sketch UI', done: true },
      { id: 'c2', text: '  ', done: false },
      { id: 'c3', text: 'Build MVP', done: false },
      { id: 'c4', text: 'Already done', done: false, taskId: 'existing' },
    ],
    attachments: [
      { id: 'f', kind: 'photo', name: 'p.jpg', createdAt: 1, storagePath: 'x/p.jpg', uploadState: 'uploaded' },
      { id: 'l', kind: 'link', name: 'site', createdAt: 1, url: 'https://example.com' },
    ],
  });
  let n = 0;
  const opts = { listId: 'work', deliverableId: 'd1', createdBy: 'me', now: T0 + 10, idFactory: () => `new${++n}` };

  it('converts an idea into a single task linked back to it', () => {
    const task = ideaToTask(withChecklist(), opts);
    expect(task).toMatchObject({
      title: 'App idea',
      listId: 'work',
      deliverableId: 'd1',
      sourceIdeaId: 'idea1',
      workspaceId: 'ws',
      status: 'todo',
      dueAt: null,
    });
    expect(task.notes).toContain('rough');
    expect(task.notes).toContain('[x] Sketch UI');
    expect(task.attachments[0]).toMatchObject({ kind: 'photo', borrowed: true });
    expect(task.attachments[1]).not.toHaveProperty('borrowed');
  });

  it('turns each unconverted checklist item into its own task', () => {
    const idea = withChecklist();
    const tasks = checklistToTasks(idea, { ...opts, startOrder: 10 });
    expect(tasks.map((t) => t.title)).toEqual(['Sketch UI', 'Build MVP']);
    expect(tasks.map((t) => t.status)).toEqual(['done', 'todo']);
    expect(tasks.map((t) => t.order)).toEqual([10, 11]);
    expect(tasks.every((t) => t.sourceIdeaId === 'idea1' && t.deliverableId === 'd1')).toBe(true);

    const ids = convertibleChecklistIds(idea);
    expect(ids).toEqual(['c1', 'c3']);
    const updated = markConverted(idea, tasks, T0 + 20, ids);
    expect(updated.checklist.find((c) => c.id === 'c1')?.taskId).toBe(tasks[0].id);
    expect(updated.checklist.find((c) => c.id === 'c3')?.taskId).toBe(tasks[1].id);
    expect(updated.convertedTaskIds).toEqual(tasks.map((t) => t.id));
    expect(checklistToTasks(updated, opts)).toEqual([]);
  });
});

describe('idea listing helpers', () => {
  const ideas: Idea[] = [
    { ...base(), id: 'a', stage: 'ready', updatedAt: 5, createdAt: 1 },
    { ...base(), id: 'b', stage: 'raw', updatedAt: 9, createdAt: 2, title: 'Garden' },
    { ...base(), id: 'c', stage: 'developing', updatedAt: 1, createdAt: 3 },
  ];

  it('sorts by stage, recency and creation', () => {
    expect(sortIdeas(ideas, 'stage').map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(sortIdeas(ideas, 'updated').map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(sortIdeas(ideas, 'created').map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('filters by stage and text', () => {
    expect(filterIdeas(ideas, 'raw', '').map((i) => i.id)).toEqual(['b']);
    expect(filterIdeas(ideas, 'all', 'garden').map((i) => i.id)).toEqual(['b']);
  });

  it('finds stale, unfinished ideas', () => {
    const day = 86_400_000;
    const now = 10 * day;
    const list: Idea[] = [
      { ...base(), id: 'old', updatedAt: now - 8 * day },
      { ...base(), id: 'fresh', updatedAt: now - 1 * day },
      { ...base(), id: 'oldReady', stage: 'ready', updatedAt: now - 30 * day },
    ];
    expect(staleIdeas(list, 7, now).map((i) => i.id)).toEqual(['old']);
  });
});
