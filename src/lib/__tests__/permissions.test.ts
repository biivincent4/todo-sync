import {
  canChangeRole,
  canInvite,
  canLeave,
  canManageMembers,
  canRemoveMember,
  initials,
  isValidEmail,
  roleOf,
  sortMembers,
} from '../permissions';

describe('role helpers', () => {
  const ws = {
    type: 'org' as const,
    members: { o: 'owner' as const, a: 'admin' as const, m: 'member' as const },
    memberProfiles: {
      o: { name: 'Zed', email: null, photoURL: null },
      a: { name: 'Amy', email: null, photoURL: null },
      m: { name: 'Bob', email: null, photoURL: null },
    },
  };

  it('reads roles', () => {
    expect(roleOf(ws, 'a')).toBe('admin');
    expect(roleOf(ws, 'stranger')).toBeNull();
  });

  it('lets owners and admins manage members and invite in org workspaces', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('member')).toBe(false);
    expect(canManageMembers(null)).toBe(false);
    expect(canInvite(ws, 'admin')).toBe(true);
    expect(canInvite({ type: 'personal' }, 'owner')).toBe(false);
  });

  it('controls member removal', () => {
    expect(canRemoveMember('owner', 'admin', 'o', 'a')).toBe(true);
    expect(canRemoveMember('owner', 'member', 'o', 'm')).toBe(true);
    expect(canRemoveMember('admin', 'member', 'a', 'm')).toBe(true);
    expect(canRemoveMember('admin', 'admin', 'a', 'a2')).toBe(false);
    expect(canRemoveMember('admin', 'owner', 'a', 'o')).toBe(false);
    expect(canRemoveMember('member', 'member', 'm', 'm2')).toBe(false);
    expect(canRemoveMember('owner', 'owner', 'o', 'o')).toBe(false);
  });

  it('controls role changes', () => {
    expect(canChangeRole('owner', 'member', 'admin', 'o', 'm')).toBe(true);
    expect(canChangeRole('admin', 'member', 'admin', 'a', 'm')).toBe(true);
    expect(canChangeRole('admin', 'admin', 'admin', 'a', 'a2')).toBe(false);
    expect(canChangeRole('owner', 'member', 'owner', 'o', 'm')).toBe(false);
    expect(canChangeRole('member', 'member', 'admin', 'm', 'm2')).toBe(false);
    expect(canChangeRole('admin', 'admin', 'member', 'a', 'a')).toBe(false);
  });

  it('lets non-owners leave org workspaces', () => {
    expect(canLeave(ws, 'member')).toBe(true);
    expect(canLeave(ws, 'admin')).toBe(true);
    expect(canLeave(ws, 'owner')).toBe(false);
    expect(canLeave({ type: 'personal' }, 'member')).toBe(false);
  });

  it('sorts members by role then name', () => {
    expect(sortMembers(ws)).toEqual(['o', 'a', 'm']);
  });

  it('formats initials and validates emails', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('cher')).toBe('C');
    expect(initials('')).toBe('?');
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });
});
