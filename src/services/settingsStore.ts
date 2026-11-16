import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppSettings, DEFAULT_SETTINGS } from '../lib/types';

const KEY = 'settings:v1';

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      reminders: { ...DEFAULT_SETTINGS.reminders, ...parsed.reminders },
      morningPlan: { ...DEFAULT_SETTINGS.morningPlan, ...parsed.morningPlan },
      ideaRevisit: { ...DEFAULT_SETTINGS.ideaRevisit, ...parsed.ideaRevisit },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

const ACTIVE_WS_KEY = 'activeWorkspace:v1';

export async function loadActiveWorkspace(uid: string): Promise<string | null> {
  return AsyncStorage.getItem(`${ACTIVE_WS_KEY}:${uid}`);
}

export async function saveActiveWorkspace(uid: string, id: string): Promise<void> {
  await AsyncStorage.setItem(`${ACTIVE_WS_KEY}:${uid}`, id);
}

const WORKSPACES_KEY = 'workspaces:v1';

/** Last-known workspaces and membership, so the app can start offline. */
export async function loadCachedWorkspaces<T>(uid: string): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`${WORKSPACES_KEY}:${uid}`);
    return raw ? (JSON.parse(raw) as T[]) : null;
  } catch {
    return null;
  }
}

export async function saveCachedWorkspaces<T>(uid: string, workspaces: T[]): Promise<void> {
  await AsyncStorage.setItem(`${WORKSPACES_KEY}:${uid}`, JSON.stringify(workspaces));
}

const PERSONAL_KEY = 'personalWorkspaceReady:v1';

export async function isPersonalWorkspaceKnown(uid: string): Promise<boolean> {
  return (await AsyncStorage.getItem(`${PERSONAL_KEY}:${uid}`)) === '1';
}

export async function markPersonalWorkspaceKnown(uid: string): Promise<void> {
  await AsyncStorage.setItem(`${PERSONAL_KEY}:${uid}`, '1');
}
