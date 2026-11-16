import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { mergeTasks } from '../lib/myDay';
import { Deliverable, Idea, Task, TaskList } from '../lib/types';
import {
  ensureChannels,
  reconcileReminders,
  scheduleIdeaRevisit,
  scheduleMorningPlan,
} from '../services/notifications';
import {
  refreshFromServer,
  SnapshotState,
  subscribe,
  subscribeAssignedToMe,
  subscribeMyUnassigned,
} from '../services/repo';
import { onQueueChange, startUploadQueue } from '../services/uploadQueue';
import { useUser } from './AuthContext';
import { useSettings } from './SettingsContext';
import { useWorkspace } from './WorkspaceContext';

interface DataState {
  workspaceId: string;
  tasks: Task[];
  lists: TaskList[];
  ideas: Idea[];
  deliverables: Deliverable[];
  /** Tasks assigned to me in any workspace (for cross-workspace My Day). */
  assignedToMe: Task[];
  loading: boolean;
  error: string | null;
  sync: { online: boolean; hasPendingWrites: boolean; pendingUploads: number };
  refresh: () => Promise<void>;
  findTask: (id: string, workspaceId?: string) => Task | undefined;
}

const DataContext = createContext<DataState | null>(null);

type Col = 'tasks' | 'lists' | 'ideas' | 'deliverables';
const NONE: Record<Col, boolean> = { tasks: false, lists: false, ideas: false, deliverables: false };
const LOAD_TIMEOUT_MS = 20_000;
const RETRY_MS = 8_000;

function friendlyError(e: Error): string {
  const code = (e as { code?: string }).code ?? '';
  if (code.includes('permission-denied')) {
    return 'You don’t have access to this data yet. If you just set up the app, make sure the Firestore security rules are deployed (see README). Retrying…';
  }
  if (code.includes('unavailable')) return 'Can’t reach the server right now. Showing saved data; retrying…';
  return e.message;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const { activeId, active, error: workspaceError } = useWorkspace();
  const { settings, loaded: settingsLoaded } = useSettings();
  // Subscribe only once the workspace document exists and lists us as a member;
  // earlier, security rules reject the listeners and Firestore never retries them.
  const ready = active?.id === activeId;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  // Load/error state is tagged with the workspace it belongs to, so switching
  // workspaces shows "loading" until the new workspace's data arrives.
  const [loadedFor, setLoadedFor] = useState<{ ws: string; cols: Record<Col, boolean> }>({ ws: activeId, cols: NONE });
  const [errorFor, setErrorFor] = useState<{ ws: string; message: string } | null>(null);
  const loaded = loadedFor.ws === activeId ? loadedFor.cols : NONE;
  const error = errorFor?.ws === activeId ? errorFor.message : null;
  const [snapState, setSnapState] = useState<SnapshotState>({ fromCache: true, hasPendingWrites: false });
  const [pendingUploads, setPendingUploads] = useState(0);
  const [online, setOnline] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const [assignedToMe, setAssigned] = useState<Task[] | null>(null);
  const [myUnassigned, setMyUnassigned] = useState<Task[] | null>(null);

  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOnline(s.isConnected !== false && s.isInternetReachable !== false);
      }),
    [],
  );

  // Never spin forever: if nothing arrives in time, show an error with a retry.
  useEffect(() => {
    const t = setTimeout(() => {
      setLoadedFor((l) => {
        if (l.ws === activeId && l.cols.tasks && l.cols.lists) return l;
        setErrorFor({
          ws: activeId,
          message: workspaceError ?? 'Could not load your data. Check your connection and try again.',
        });
        return { ws: activeId, cols: { tasks: true, lists: true, ideas: true, deliverables: true } };
      });
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [activeId, attempt, workspaceError]);

  // Active workspace subscriptions.
  useEffect(() => {
    if (!ready) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const onErr = (e: Error) => {
      setErrorFor({ ws: activeId, message: friendlyError(e) });
      setLoadedFor({ ws: activeId, cols: { tasks: true, lists: true, ideas: true, deliverables: true } });
      // Firestore stops a listener after an error; resubscribe after a pause.
      clearTimeout(retry);
      retry = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
    };
    const mark = (c: Col) => {
      setErrorFor((e) => (e?.ws === activeId ? null : e));
      setLoadedFor((l) =>
        l.ws === activeId ? (l.cols[c] ? l : { ws: activeId, cols: { ...l.cols, [c]: true } }) : { ws: activeId, cols: { ...NONE, [c]: true } },
      );
    };
    const unsubs = [
      subscribe<Task>(activeId, 'tasks', (items, st) => {
        setTasks(items);
        setSnapState(st);
        mark('tasks');
      }, onErr),
      subscribe<TaskList>(activeId, 'lists', (items) => {
        setLists(items.sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name)));
        mark('lists');
      }, onErr),
      subscribe<Idea>(activeId, 'ideas', (items) => {
        setIdeas(items);
        mark('ideas');
      }, onErr),
      subscribe<Deliverable>(activeId, 'deliverables', (items) => {
        setDeliverables(items);
        mark('deliverables');
      }, onErr),
    ];
    return () => {
      clearTimeout(retry);
      unsubs.forEach((u) => u());
    };
  }, [activeId, ready, attempt]);
  // Cross-workspace subscriptions that drive reminders and My Day.
  useEffect(() => {
    const a = subscribeAssignedToMe(user.uid, setAssigned);
    const b = subscribeMyUnassigned(user.uid, setMyUnassigned);
    return () => {
      a();
      b();
    };
  }, [user.uid]);

  useEffect(() => {
    const stop = startUploadQueue();
    const off = onQueueChange(setPendingUploads);
    return () => {
      stop();
      off();
    };
  }, []);

  // Reminder channels follow the per-priority sound settings.
  useEffect(() => {
    if (!settingsLoaded) return;
    ensureChannels(settings).catch((e) => console.warn('[notifications] channels', e));
    scheduleMorningPlan(settings).catch((e) => console.warn('[notifications] plan', e));
  }, [settings, settingsLoaded]);

  // Only reconcile once both cross-workspace queries have answered, so a cold
  // start never cancels reminders just because data hasn't arrived yet.
  useEffect(() => {
    if (!settingsLoaded || assignedToMe == null || myUnassigned == null) return;
    reconcileReminders(mergeTasks(myUnassigned, assignedToMe), settings, user.uid);
  }, [assignedToMe, myUnassigned, settings, settingsLoaded, user.uid]);

  const ideasTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!settingsLoaded || !loaded.ideas) return;
    if (ideasTimer.current) clearTimeout(ideasTimer.current);
    ideasTimer.current = setTimeout(() => {
      scheduleIdeaRevisit(ideas, settings).catch((e) => console.warn('[notifications] ideas', e));
    }, 1500);
  }, [ideas, settings, settingsLoaded, loaded.ideas]);

  const refresh = useCallback(async () => {
    // Resubscribe (recovers listeners stopped by an earlier error), then force a server round-trip.
    setAttempt((a) => a + 1);
    if (!ready) return;
    try {
      await refreshFromServer(activeId);
      setErrorFor(null);
    } catch (e) {
      setErrorFor({ ws: activeId, message: e instanceof Error ? friendlyError(e) : 'Could not refresh.' });
    }
  }, [activeId, ready]);

  const allAssigned = useMemo(() => assignedToMe ?? [], [assignedToMe]);
  const findTask = useCallback(
    (id: string, workspaceId?: string) =>
      tasks.find((t) => t.id === id && (!workspaceId || t.workspaceId === workspaceId)) ??
      allAssigned.find((t) => t.id === id && (!workspaceId || t.workspaceId === workspaceId)) ??
      (myUnassigned ?? []).find((t) => t.id === id && (!workspaceId || t.workspaceId === workspaceId)),
    [tasks, allAssigned, myUnassigned],
  );

  const value = useMemo<DataState>(
    () => ({
      workspaceId: activeId,
      tasks,
      lists,
      ideas,
      deliverables,
      assignedToMe: allAssigned,
      loading: !error && !(loaded.tasks && loaded.lists),
      error,
      sync: { online, hasPendingWrites: snapState.hasPendingWrites, pendingUploads },
      refresh,
      findTask,
    }),
    [activeId, tasks, lists, ideas, deliverables, allAssigned, loaded, error, snapState, online, pendingUploads, refresh, findTask],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
