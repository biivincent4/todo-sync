import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getStorage } from '@react-native-firebase/storage';

/**
 * React Native Firebase reads its project config from google-services.json at
 * native build time, so there are no keys here. Firestore's offline persistence
 * is enabled by default on Android: reads come from the local cache and writes
 * are queued until the device is back online.
 */
export const auth = () => getAuth();
export const db = () => getFirestore();
export const storage = () => getStorage();

export const paths = {
  workspace: (ws: string) => `workspaces/${ws}`,
  tasks: (ws: string) => `workspaces/${ws}/tasks`,
  lists: (ws: string) => `workspaces/${ws}/lists`,
  ideas: (ws: string) => `workspaces/${ws}/ideas`,
  deliverables: (ws: string) => `workspaces/${ws}/deliverables`,
  invite: (code: string) => `invites/${code}`,
  storageFile: (ws: string, col: 'tasks' | 'ideas', docId: string, fileName: string) =>
    `workspaces/${ws}/${col}/${docId}/${fileName}`,
};

/**
 * Firestore writes resolve only once the server acknowledges them, which never
 * happens while offline. The local cache is updated immediately, so callers
 * fire-and-forget and only surface failures (for example a rules rejection).
 */
export function background<T>(p: Promise<T>, what: string): void {
  p.catch((e: unknown) => console.warn(`[sync] ${what} failed`, e));
}

/** Firestore rejects `undefined` values; strip them recursively. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}
