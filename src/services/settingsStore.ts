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
