export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'doing' | 'done';
export type SortMode = 'due' | 'priority' | 'created' | 'manual';

export const STATUSES: Status[] = ['todo', 'doing', 'done'];
export const STATUS_LABEL: Record<Status, string> = { todo: 'To do', doing: 'Doing', done: 'Done' };
export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export type AttachmentKind = 'file' | 'photo' | 'audio' | 'contact' | 'link' | 'location';
export type UploadState = 'pending' | 'uploaded' | 'failed';

interface AttachmentBase {
  id: string;
  name: string;
  createdAt: number;
}

export interface StoredFileAttachment extends AttachmentBase {
  kind: 'file' | 'photo' | 'audio';
  mimeType?: string | null;
  size?: number | null;
  storagePath: string;
  url?: string | null;
  uploadState: UploadState;
  /** True when the file is owned by another document (e.g. a task created from an idea). */
  borrowed?: boolean;
}

export interface ContactAttachment extends AttachmentBase {
  kind: 'contact';
  phone?: string | null;
  email?: string | null;
}

export interface LinkAttachment extends AttachmentBase {
  kind: 'link';
  url: string;
}

export interface LocationAttachment extends AttachmentBase {
  kind: 'location';
  latitude: number;
  longitude: number;
}

export type Attachment =
  | StoredFileAttachment
  | ContactAttachment
  | LinkAttachment
  | LocationAttachment;

export function isStoredFile(a: Attachment): a is StoredFileAttachment {
  return a.kind === 'file' || a.kind === 'photo' || a.kind === 'audio';
}

export interface Task {
  id: string;
  workspaceId: string;
  title: string;
  notes: string;
  /** Epoch milliseconds, or null when the task has no due date. */
  dueAt: number | null;
  priority: Priority;
  status: Status;
  listId: string;
  deliverableId: string | null;
  assigneeId: string | null;
  createdBy: string;
  attachments: Attachment[];
  /**
   * Per-user My Day plan: uid -> local day key (YYYY-MM-DD). A task is "in my day"
   * for a user only when the stored key equals today, so My Day clears each morning.
   */
  myDay: Record<string, string>;
  order: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  sourceIdeaId: string | null;
}

export interface TaskList {
  id: string;
  name: string;
  createdAt: number;
  builtIn?: boolean;
}

export const DEFAULT_LISTS: Pick<TaskList, 'id' | 'name'>[] = [
  { id: 'personal', name: 'Personal' },
  { id: 'work', name: 'Work' },
];

export type IdeaStage = 'raw' | 'developing' | 'ready';
export const IDEA_STAGES: IdeaStage[] = ['raw', 'developing', 'ready'];
export const IDEA_STAGE_META: Record<IdeaStage, { label: string; emoji: string; rank: number }> = {
  raw: { label: 'Raw', emoji: '💭', rank: 0 },
  developing: { label: 'Developing', emoji: '🌱', rank: 1 },
  ready: { label: 'Ready', emoji: '✅', rank: 2 },
};

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  taskId?: string | null;
}

export interface IdeaVersion {
  id: string;
  title: string;
  notes: string;
  savedAt: number;
}

export interface Idea {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  notes: string;
  stage: IdeaStage;
  checklist: ChecklistItem[];
  attachments: Attachment[];
  versions: IdeaVersion[];
  convertedTaskIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type SoundOption = 'default' | 'silent';

export interface PriorityReminderSettings {
  leadMinutes: number[];
  sound: SoundOption;
  vibrate: boolean;
}

export type ReminderSettings = Record<Priority, PriorityReminderSettings>;

export type Role = 'owner' | 'admin' | 'member';
export type WorkspaceType = 'personal' | 'org';

export interface MemberProfile {
  name: string;
  email: string | null;
  photoURL: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  ownerId: string;
  members: Record<string, Role>;
  memberIds: string[];
  memberProfiles: Record<string, MemberProfile>;
  invitedEmails: string[];
  inviteCode: string | null;
  createdAt: number;
}

export type DeliverableStatus = 'not_started' | 'in_progress' | 'done' | 'at_risk';
export const DELIVERABLE_STATUSES: DeliverableStatus[] = ['not_started', 'in_progress', 'done', 'at_risk'];
export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  at_risk: 'At risk',
};

export interface Deliverable {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  ownerId: string | null;
  dueAt: number | null;
  status: DeliverableStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  /** Include tasks assigned to me in other workspaces on My Day. */
  myDayAcrossWorkspaces: boolean;
  sortMode: SortMode;
  reminders: ReminderSettings;
  morningPlan: { enabled: boolean; hour: number; minute: number };
  /** weekday: 1 = Monday ... 7 = Sunday */
  ideaRevisit: { enabled: boolean; staleDays: number; weekday: number; hour: number };
}

export const DEFAULT_SETTINGS: AppSettings = {
  myDayAcrossWorkspaces: true,
  sortMode: 'due',
  reminders: {
    high: { leadMinutes: [1440, 60, 0], sound: 'default', vibrate: true },
    medium: { leadMinutes: [60], sound: 'default', vibrate: true },
    low: { leadMinutes: [0], sound: 'silent', vibrate: false },
  },
  morningPlan: { enabled: false, hour: 8, minute: 0 },
  ideaRevisit: { enabled: false, staleDays: 7, weekday: 7, hour: 10 },
};

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
