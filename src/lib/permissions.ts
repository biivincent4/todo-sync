import { Role, Workspace } from './types';

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const ROLE_RANK: Record<Role, number> = { owner: 0, admin: 1, member: 2 };

export function roleOf(ws: Pick<Workspace, 'members'>, uid: string): Role | null {
  return ws.members?.[uid] ?? null;
}

export function isMember(ws: Pick<Workspace, 'members'>, uid: string): boolean {
  return roleOf(ws, uid) != null;
}

/** Owners and admins manage members and workspace settings. */
export function canManageMembers(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

export const canEditWorkspaceSettings = canManageMembers;

export function canInvite(ws: Pick<Workspace, 'type'>, role: Role | null): boolean {
  return ws.type === 'org' && canManageMembers(role);
}

/** Owners may remove anyone but themselves; admins may remove plain members. */
export function canRemoveMember(
  actorRole: Role | null,
  targetRole: Role | null,
  actorUid: string,
  targetUid: string,
): boolean {
  if (!actorRole || !targetRole || actorUid === targetUid) return false;
  if (targetRole === 'owner') return false;
  if (actorRole === 'owner') return true;
  return actorRole === 'admin' && targetRole === 'member';
}

/** Owners change roles freely (except ownership); admins can promote/demote between member and admin for others. */
export function canChangeRole(
  actorRole: Role | null,
  targetRole: Role | null,
  newRole: Role,
  actorUid: string,
  targetUid: string,
): boolean {
  if (!actorRole || !targetRole || actorUid === targetUid) return false;
  if (newRole === 'owner' || targetRole === 'owner') return false;
  if (actorRole === 'owner') return true;
  return actorRole === 'admin' && targetRole !== newRole;
}

/** Any member except the owner may leave (the owner must keep the workspace). */
export function canLeave(ws: Pick<Workspace, 'type'>, role: Role | null): boolean {
  return ws.type === 'org' && role != null && role !== 'owner';
}

export function sortMembers(ws: Pick<Workspace, 'members' | 'memberProfiles'>): string[] {
  return Object.keys(ws.members).sort(
    (a, b) =>
      ROLE_RANK[ws.members[a]] - ROLE_RANK[ws.members[b]] ||
      (ws.memberProfiles[a]?.name ?? '').localeCompare(ws.memberProfiles[b]?.name ?? ''),
  );
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function personalWorkspaceId(uid: string): string {
  return `personal_${uid}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
