import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { doc, getDoc, runTransaction } from '@react-native-firebase/firestore';
import { deleteObject, getDownloadURL, putFile, ref } from '@react-native-firebase/storage';
import { File } from 'expo-file-system';

import { newId } from '../lib/ids';
import { Attachment } from '../lib/types';
import { db, storage } from './firebase';

export type AttachmentOwner = { col: 'tasks' | 'ideas'; workspaceId: string; id: string };

export function ownerRef(o: AttachmentOwner) {
  return doc(db(), `workspaces/${o.workspaceId}/${o.col}/${o.id}`);
}

export type QueueOp =
  | {
      id: string;
      type: 'upload';
      owner: AttachmentOwner;
      attachmentId: string;
      localUri: string;
      storagePath: string;
      mimeType: string | null;
      attempts: number;
    }
  | { id: string; type: 'delete'; storagePath: string; attempts: number };

const KEY = 'uploadQueue:v1';
const MAX_ATTEMPTS = 8;

let running = false;
let rerun = false;
const listeners = new Set<(pending: number) => void>();

async function load(): Promise<QueueOp[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as QueueOp[];
  } catch {
    return [];
  }
}

async function save(ops: QueueOp[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(ops));
  listeners.forEach((l) => l(ops.length));
}

/** Serialize queue mutations so concurrent enqueues never drop ops. */
let chain: Promise<unknown> = Promise.resolve();
function mutate(fn: (ops: QueueOp[]) => QueueOp[]): Promise<void> {
  const next = chain.then(async () => save(fn(await load())));
  chain = next.catch(() => undefined);
  return next;
}

export function onQueueChange(l: (pending: number) => void): () => void {
  listeners.add(l);
  load().then((ops) => l(ops.length));
  return () => listeners.delete(l);
}

export function enqueueUpload(op: Omit<Extract<QueueOp, { type: 'upload' }>, 'id' | 'type' | 'attempts'>): void {
  mutate((ops) => [...ops, { ...op, id: newId(), type: 'upload', attempts: 0 }]).then(processQueue);
}

export function enqueueStorageDeletes(storagePaths: readonly string[]): void {
  if (storagePaths.length === 0) return;
  mutate((ops) => [
    // A pending upload for a deleted file is pointless.
    ...ops.filter((o) => !(o.type === 'upload' && storagePaths.includes(o.storagePath))),
    ...storagePaths.map((p) => ({ id: newId(), type: 'delete' as const, storagePath: p, attempts: 0 })),
  ]).then(processQueue);
}

function errorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

export const STORAGE_UNAVAILABLE_MESSAGE =
  'File, photo and voice-note attachments need Firebase Storage, which isn’t set up for this Firebase project ' +
  '(new Storage buckets need the Blaze plan). Contacts, links and locations still work.';

const STORAGE_FLAG_KEY = 'storageUnavailableUntil:v1';
// Re-check periodically, so enabling Storage later starts working without reinstalling.
const STORAGE_RECHECK_MS = 6 * 3_600_000;
let storageUnavailableUntil = 0;

async function loadStorageStatus(): Promise<void> {
  storageUnavailableUntil = Number((await AsyncStorage.getItem(STORAGE_FLAG_KEY)) ?? 0) || 0;
}

/** True when a recent upload showed that the project has no Storage bucket. */
export function storageKnownUnavailable(): boolean {
  return Date.now() < storageUnavailableUntil;
}

function markStorageUnavailable(): void {
  storageUnavailableUntil = Date.now() + STORAGE_RECHECK_MS;
  AsyncStorage.setItem(STORAGE_FLAG_KEY, String(storageUnavailableUntil)).catch(() => undefined);
}

/** Message for upload errors that retrying won't fix, or null for transient ones. */
function permanentUploadError(e: unknown): string | null {
  const code = errorCode(e) ?? '';
  const message = e instanceof Error ? e.message : String(e);
  if (
    ['storage/bucket-not-found', 'storage/project-not-found', 'storage/no-default-bucket'].includes(code) ||
    /bucket|not been set up|has not been enabled/i.test(message)
  ) {
    markStorageUnavailable();
    return STORAGE_UNAVAILABLE_MESSAGE;
  }
  if (code === 'storage/unauthorized') return 'You don’t have permission to upload to this workspace.';
  if (code === 'storage/quota-exceeded') return 'The Firebase Storage quota is used up.';
  if (code === 'storage/invalid-argument' || code === 'storage/invalid-url') return `Upload failed: ${message}`;
  return null;
}

/** Record a failed upload on its attachment so the UI stops showing it as pending. */
async function markUploadFailed(op: Extract<QueueOp, { type: 'upload' }>, reason: string): Promise<void> {
  const owner = ownerRef(op.owner);
  await runTransaction(db(), async (tx) => {
    const cur = await tx.get(owner);
    if (!cur.exists()) return;
    const atts = ((cur.data()?.attachments ?? []) as Attachment[]).map((a) =>
      a.id === op.attachmentId ? { ...a, uploadState: 'failed' as const, uploadError: reason } : a,
    );
    tx.update(owner, { attachments: atts });
  });
  try {
    new File(op.localUri).delete();
  } catch {
    // Already gone.
  }
}

async function runUpload(op: Extract<QueueOp, { type: 'upload' }>): Promise<'done' | 'retry'> {
  if (storageKnownUnavailable()) {
    await markUploadFailed(op, STORAGE_UNAVAILABLE_MESSAGE);
    return 'done';
  }
  const owner = ownerRef(op.owner);
  const snap = await getDoc(owner);
  if (!snap.exists()) {
    // Owner was deleted (or not synced yet). Retry a few times, then give up.
    return op.attempts >= 3 ? 'done' : 'retry';
  }
  const fileRef = ref(storage(), op.storagePath);
  let url: string;
  try {
    await putFile(fileRef, op.localUri, op.mimeType ? { contentType: op.mimeType } : undefined);
    url = await getDownloadURL(fileRef);
  } catch (e) {
    const permanent = permanentUploadError(e);
    if (!permanent) throw e;
    await markUploadFailed(op, permanent);
    return 'done';
  }
  let found = false;
  await runTransaction(db(), async (tx) => {
    const cur = await tx.get(owner);
    const atts = ((cur.data()?.attachments ?? []) as Attachment[]).map((a) => {
      if (a.id !== op.attachmentId) return a;
      found = true;
      return { ...a, url, uploadState: 'uploaded' as const };
    });
    if (found) tx.update(owner, { attachments: atts });
  });
  if (!found) {
    // Attachment removed while uploading: clean up the orphaned object.
    await deleteObject(fileRef).catch(() => undefined);
  }
  try {
    new File(op.localUri).delete();
  } catch {
    // Already gone.
  }
  return 'done';
}

async function runDelete(op: Extract<QueueOp, { type: 'delete' }>): Promise<'done' | 'retry'> {
  try {
    await deleteObject(ref(storage(), op.storagePath));
  } catch (e) {
    if (errorCode(e) !== 'storage/object-not-found') throw e;
  }
  return 'done';
}

/** Process queued uploads/deletes while online. Safe to call any time. */
export async function processQueue(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;
      for (const op of await load()) {
        let result: 'done' | 'retry' = 'retry';
        try {
          result = op.type === 'upload' ? await runUpload(op) : await runDelete(op);
        } catch (e) {
          console.warn('[uploads] op failed', op.type, e);
        }
        const exhausted = result !== 'done' && op.attempts + 1 >= MAX_ATTEMPTS;
        if (exhausted && op.type === 'upload') {
          await markUploadFailed(op, 'Upload failed after several tries. Remove the attachment and add it again.').catch(
            () => undefined,
          );
        }
        await mutate((ops) =>
          result === 'done' || exhausted
            ? ops.filter((o) => o.id !== op.id)
            : ops.map((o) => (o.id === op.id ? { ...o, attempts: o.attempts + 1 } : o)),
        );
      }
    } while (rerun);
  } finally {
    running = false;
  }
}

/** Retry the queue whenever connectivity returns. */
export function startUploadQueue(): () => void {
  loadStorageStatus().finally(processQueue);
  return NetInfo.addEventListener((s) => {
    if (s.isConnected) processQueue();
  });
}
