import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { personalWorkspaceId, roleOf } from '../lib/permissions';
import { Role, Workspace } from '../lib/types';
import { loadActiveWorkspace, saveActiveWorkspace } from '../services/settingsStore';
import { ensurePersonalWorkspace, subscribeEmailInvites, subscribeWorkspaces } from '../services/workspaces';
import { useUser } from './AuthContext';

interface WorkspaceState {
  workspaces: Workspace[];
  invites: Workspace[];
  active: Workspace | null;
  activeId: string;
  role: Role | null;
  loading: boolean;
  error: string | null;
  setActive: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const personalId = personalWorkspaceId(user.uid);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invites, setInvites] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string>(personalId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    ensurePersonalWorkspace(user).catch((e) => console.warn('[workspace] personal', e));
    loadActiveWorkspace(user.uid).then((id) => id && setActiveId(id));
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribeWorkspaces(
      user.uid,
      (ws) => {
        setWorkspaces(
          ws.sort((a, b) => (a.type === 'personal' ? -1 : b.type === 'personal' ? 1 : a.name.localeCompare(b.name))),
        );
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
        // Firestore stops a listener after an error; resubscribe after a pause.
        retry = setTimeout(() => setAttempt((a) => a + 1), 8_000);
      },
    );
    const unsubInv = user.email ? subscribeEmailInvites(user.email, setInvites) : () => undefined;
    return () => {
      clearTimeout(retry);
      unsub();
      unsubInv();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, attempt]);

  // Fall back to Personal if the active workspace disappears (left or removed).
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces.find((w) => w.id === personalId) ?? null;

  const setActive = useCallback(
    (id: string) => {
      setActiveId(id);
      saveActiveWorkspace(user.uid, id).catch(() => undefined);
    },
    [user.uid],
  );

  const value = useMemo<WorkspaceState>(
    () => ({
      workspaces,
      invites: invites.filter((i) => !i.memberIds.includes(user.uid)),
      active,
      activeId: active?.id ?? personalId,
      role: active ? roleOf(active, user.uid) : 'owner',
      loading,
      error,
      setActive,
    }),
    [workspaces, invites, active, personalId, user.uid, loading, error, setActive],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
