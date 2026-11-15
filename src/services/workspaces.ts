import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';
import * as Linking from 'expo-linking';

import { newId, newInviteCode } from '../lib/ids';
import { normalizeEmail, personalWorkspaceId } from '../lib/permissions';
import { DEFAULT_LISTS, MemberProfile, Role, Workspace } from '../lib/types';
import { background, clean, db, paths } from './firebase';

export interface SessionUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export function profileOf(user: SessionUser): MemberProfile {
  return {
    name: user.displayName || user.email || 'Member',
    email: user.email ? normalizeEmail(user.email) : null,
    photoURL: user.photoURL ?? null,
  };
}

function toWorkspace(id: string, data: Record<string, unknown>): Workspace {
  const d = data as Partial<Workspace>;
  return {
    id,
    name: d.name ?? 'Workspace',
    type: d.type ?? 'org',
    ownerId: d.ownerId ?? '',
    members: d.members ?? {},
    memberIds: d.memberIds ?? [],
    memberProfiles: d.memberProfiles ?? {},
    invitedEmails: d.invitedEmails ?? [],
    inviteCode: d.inviteCode ?? null,
    createdAt: d.createdAt ?? 0,
  };
}

function seedDefaultLists(wsId: string, batch: ReturnType<typeof writeBatch>, now: number) {
  for (const l of DEFAULT_LISTS) {
    batch.set(doc(db(), paths.lists(wsId), l.id), { name: l.name, createdAt: now, builtIn: true }, { merge: true });
  }
}

function newWorkspaceDoc(user: SessionUser, name: string, type: Workspace['type'], now: number) {
  return {
    name,
    type,
    ownerId: user.uid,
    members: { [user.uid]: 'owner' as Role },
    memberIds: [user.uid],
    memberProfiles: { [user.uid]: profileOf(user) },
    invitedEmails: [] as string[],
    inviteCode: null,
    createdAt: now,
  };
}

/** Every user gets a Personal workspace with the default lists. Safe to call on each sign-in. */
export async function ensurePersonalWorkspace(user: SessionUser): Promise<string> {
  const id = personalWorkspaceId(user.uid);
  const ref = doc(db(), paths.workspace(id));
  let exists = false;
  try {
    exists = (await getDoc(ref)).exists();
  } catch {
    // Offline on a fresh install: fall through and create it locally; it syncs later.
  }
  const now = Date.now();
  if (exists) {
    background(updateDoc(ref, { [`memberProfiles.${user.uid}`]: profileOf(user) }), 'update profile');
    return id;
  }
  const batch = writeBatch(db());
  batch.set(ref, clean(newWorkspaceDoc(user, 'Personal', 'personal', now)));
  seedDefaultLists(id, batch, now);
  background(batch.commit(), 'create personal workspace');
  return id;
}

export function subscribeWorkspaces(
  uid: string,
  onData: (ws: Workspace[]) => void,
  onError: (e: Error) => void,
): () => void {
  const q = query(collection(db(), 'workspaces'), where('memberIds', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => toWorkspace(d.id, d.data()))),
    onError,
  );
}

/** Org workspaces that invited this user's email address. */
export function subscribeEmailInvites(
  email: string,
  onData: (ws: Workspace[]) => void,
): () => void {
  const q = query(
    collection(db(), 'workspaces'),
    where('invitedEmails', 'array-contains', normalizeEmail(email)),
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => toWorkspace(d.id, d.data()))),
    (e) => console.warn('[invites]', e),
  );
}

export function createOrgWorkspace(user: SessionUser, name: string): string {
  const id = newId();
  const now = Date.now();
  const batch = writeBatch(db());
  batch.set(doc(db(), paths.workspace(id)), clean(newWorkspaceDoc(user, name.trim() || 'Organization', 'org', now)));
  seedDefaultLists(id, batch, now);
  background(batch.commit(), 'create organization');
  return id;
}

const wsRef = (id: string) => doc(db(), paths.workspace(id));

export function renameWorkspace(id: string, name: string): void {
  background(updateDoc(wsRef(id), { name: name.trim() }), 'rename workspace');
}

export function inviteByEmail(id: string, email: string): void {
  background(updateDoc(wsRef(id), { invitedEmails: arrayUnion(normalizeEmail(email)) }), 'invite');
}

export function revokeEmailInvite(id: string, email: string): void {
  background(updateDoc(wsRef(id), { invitedEmails: arrayRemove(normalizeEmail(email)) }), 'revoke invite');
}

/** Create (or rotate) the workspace's invite code. Old codes stop working. */
export async function createInviteCode(ws: Workspace, user: SessionUser): Promise<string> {
  const code = newInviteCode();
  const batch = writeBatch(db());
  if (ws.inviteCode) batch.delete(doc(db(), paths.invite(ws.inviteCode)));
  batch.set(doc(db(), paths.invite(code)), {
    workspaceId: ws.id,
    workspaceName: ws.name,
    createdBy: user.uid,
    createdAt: Date.now(),
  });
  batch.update(wsRef(ws.id), { inviteCode: code });
  await batch.commit();
  return code;
}

export function inviteLink(code: string): string {
  return Linking.createURL('join', { queryParams: { code } });
}

function memberJoinPatch(user: SessionUser) {
  return {
    [`members.${user.uid}`]: 'member',
    memberIds: arrayUnion(user.uid),
    [`memberProfiles.${user.uid}`]: profileOf(user),
  };
}

/** Join with an invite code. Requires a connection: the server validates the code. */
export async function joinByCode(rawCode: string, user: SessionUser): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  const invite = await getDoc(doc(db(), paths.invite(code)));
  const data = invite.data() as { workspaceId?: string } | undefined;
  if (!invite.exists() || !data?.workspaceId) throw new Error('That invite code is not valid.');
  await updateDoc(wsRef(data.workspaceId), { ...memberJoinPatch(user), joinCode: code });
  return data.workspaceId;
}

export async function acceptEmailInvite(ws: Workspace, user: SessionUser): Promise<void> {
  if (!user.email) throw new Error('Your account has no email address.');
  await updateDoc(wsRef(ws.id), {
    ...memberJoinPatch(user),
    invitedEmails: arrayRemove(normalizeEmail(user.email)),
  });
}

export function declineEmailInvite(ws: Workspace, email: string): void {
  revokeEmailInvite(ws.id, email);
}

/**
 * Remove a member (or leave). In the same batch, tasks assigned to them are
 * unassigned and their unassigned tasks are handed to the owner, so the
 * cross-workspace task queries (which can't check membership in security
 * rules) no longer match anything in this workspace for them.
 */
export async function removeMember(wsId: string, uid: string): Promise<void> {
  const tasksCol = collection(db(), paths.tasks(wsId));
  const [assigned, created, ws] = await Promise.all([
    getDocs(query(tasksCol, where('assigneeId', '==', uid))),
    getDocs(query(tasksCol, where('createdBy', '==', uid))),
    getDoc(wsRef(wsId)),
  ]);
  const ownerId = (ws.data() as Partial<Workspace> | undefined)?.ownerId;
  const batch = writeBatch(db());
  const now = Date.now();
  for (const d of assigned.docs) batch.update(d.ref, { assigneeId: null, updatedAt: now });
  for (const d of created.docs) {
    if (ownerId && ownerId !== uid) batch.update(d.ref, { createdBy: ownerId, updatedAt: now });
  }
  batch.update(wsRef(wsId), {
    [`members.${uid}`]: deleteField(),
    [`memberProfiles.${uid}`]: deleteField(),
    memberIds: arrayRemove(uid),
  });
  await batch.commit();
}

export const leaveWorkspace = removeMember;

export function setMemberRole(wsId: string, uid: string, role: Role): void {
  background(updateDoc(wsRef(wsId), { [`members.${uid}`]: role }), 'change role');
}

