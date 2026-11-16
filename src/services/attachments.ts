import * as Contacts from 'expo-contacts';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Linking } from 'react-native';

import { newId } from '../lib/ids';
import {
  Attachment,
  ContactAttachment,
  LinkAttachment,
  LocationAttachment,
  MAX_FILE_BYTES,
  StoredFileAttachment,
} from '../lib/types';
import { paths } from './firebase';
import type { AttachmentOwner } from './uploadQueue';
import { enqueueUpload, STORAGE_UNAVAILABLE_MESSAGE, storageKnownUnavailable } from './uploadQueue';

export class AttachmentError extends Error {}

export interface PickedFile {
  uri: string;
  name: string;
  size: number | null;
  mimeType: string | null;
}

function ensurePermission(granted: boolean, what: string) {
  if (!granted) throw new AttachmentError(`Permission to access ${what} was denied. You can enable it in system settings.`);
}

export async function pickDocument(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, size: a.size ?? null, mimeType: a.mimeType ?? null };
}

function fromImageAsset(a: ImagePicker.ImagePickerAsset): PickedFile {
  return {
    uri: a.uri,
    name: a.fileName ?? `photo-${Date.now()}.jpg`,
    size: a.fileSize ?? null,
    mimeType: a.mimeType ?? 'image/jpeg',
  };
}

export async function takePhoto(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  ensurePermission(perm.granted, 'the camera');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  return res.canceled || !res.assets[0] ? null : fromImageAsset(res.assets[0]);
}

export async function pickPhoto(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  ensurePermission(perm.granted, 'your photos');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  return res.canceled || !res.assets[0] ? null : fromImageAsset(res.assets[0]);
}

export async function pickContact(): Promise<ContactAttachment | null> {
  const perm = await Contacts.requestPermissionsAsync();
  ensurePermission(perm.granted, 'your contacts');
  const contact = await Contacts.Contact.presentPicker();
  if (!contact) return null;
  const [name, phones, emails] = await Promise.all([
    contact.getFullName(),
    contact.getPhones(),
    contact.getEmails(),
  ]);
  return {
    id: newId(),
    kind: 'contact',
    name: name || 'Contact',
    phone: phones[0]?.number ?? null,
    email: emails[0]?.address ?? null,
    createdAt: Date.now(),
  };
}

export async function currentLocation(label?: string): Promise<LocationAttachment> {
  const perm = await Location.requestForegroundPermissionsAsync();
  ensurePermission(perm.granted, 'your location');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return {
    id: newId(),
    kind: 'location',
    name: label?.trim() || 'Pinned place',
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    createdAt: Date.now(),
  };
}

export function makeLink(url: string, name?: string): LinkAttachment {
  const trimmed = url.trim();
  const full = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return { id: newId(), kind: 'link', url: full, name: name?.trim() || full, createdAt: Date.now() };
}

export function fileSize(uri: string, reported: number | null): number | null {
  if (reported != null) return reported;
  try {
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

/**
 * Create a stored-file attachment and queue its upload. The file is copied to
 * app storage first so it survives until the device is online.
 */
export function addStoredFile(
  kind: StoredFileAttachment['kind'],
  picked: PickedFile,
  owner: AttachmentOwner,
): StoredFileAttachment {
  const size = fileSize(picked.uri, picked.size);
  if (storageKnownUnavailable()) {
    throw new AttachmentError(STORAGE_UNAVAILABLE_MESSAGE);
  }
  if (size != null && size > MAX_FILE_BYTES) {
    throw new AttachmentError('Files must be 25 MB or smaller.');
  }
  const id = newId();
  const safeName = picked.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
  const dir = new Directory(Paths.document, 'pending-uploads');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${id}-${safeName}`);
  new File(picked.uri).copy(dest);

  const storagePath = paths.storageFile(owner.workspaceId, owner.col, owner.id, `${id}-${safeName}`);
  enqueueUpload({
    owner,
    attachmentId: id,
    localUri: dest.uri,
    storagePath,
    mimeType: picked.mimeType,
  });
  return {
    id,
    kind,
    name: picked.name,
    mimeType: picked.mimeType,
    size,
    storagePath,
    url: null,
    uploadState: 'pending',
    createdAt: Date.now(),
  };
}

export function openAttachment(a: Attachment): void {
  switch (a.kind) {
    case 'link':
      Linking.openURL(a.url);
      return;
    case 'location':
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`);
      return;
    case 'contact':
      if (a.phone) Linking.openURL(`tel:${a.phone}`);
      else if (a.email) Linking.openURL(`mailto:${a.email}`);
      return;
    default:
      if (a.url) Linking.openURL(a.url);
  }
}

export const contactActions = {
  call: (c: ContactAttachment) => c.phone && Linking.openURL(`tel:${c.phone}`),
  text: (c: ContactAttachment) => c.phone && Linking.openURL(`sms:${c.phone}`),
  email: (c: ContactAttachment) => c.email && Linking.openURL(`mailto:${c.email}`),
};
