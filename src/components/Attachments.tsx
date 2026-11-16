import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Attachment, ContactAttachment, isStoredFile } from '../lib/types';
import {
  addStoredFile,
  AttachmentError,
  contactActions,
  currentLocation,
  makeLink,
  openAttachment,
  pickContact,
  pickDocument,
  PickedFile,
  pickPhoto,
  takePhoto,
} from '../services/attachments';
import type { AttachmentOwner } from '../services/uploadQueue';
import { useTheme } from '../theme';
import { Button, Label, OptionSheet, PromptModal, SheetOption } from './ui';

const ICON: Record<Attachment['kind'], string> = {
  file: '📄',
  photo: '🖼️',
  audio: '🎙️',
  contact: '👤',
  link: '🔗',
  location: '📍',
};

const MAX_RECORDING_MS = 3 * 60_000;

/** Attachment chips plus the "add" menu; shared by tasks and ideas. */
export function AttachmentSection({
  owner,
  attachments,
  onChange,
}: {
  owner: AttachmentOwner;
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  const c = useTheme();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Attachment | null>(null);
  const [prompt, setPrompt] = useState<'link' | 'location' | null>(null);
  const [recording, setRecording] = useState(false);

  const add = (a: Attachment | null) => {
    if (a) onChange([...attachments, a]);
  };

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      Alert.alert(
        e instanceof AttachmentError ? 'Attachment' : 'Could not add attachment',
        e instanceof Error ? e.message : String(e),
      );
    }
  };

  const addFile = (kind: 'file' | 'photo' | 'audio', picked: PickedFile | null) => {
    if (picked) add(addStoredFile(kind, picked, owner));
  };

  const addOptions: SheetOption[] = [
    { label: '📄 File', onPress: () => run(async () => addFile('file', await pickDocument())) },
    { label: '📷 Take photo', onPress: () => run(async () => addFile('photo', await takePhoto())) },
    { label: '🖼️ Photo from gallery', onPress: () => run(async () => addFile('photo', await pickPhoto())) },
    { label: '👤 Contact', onPress: () => run(async () => add(await pickContact())) },
    { label: '🔗 Link', onPress: () => setPrompt('link') },
    { label: '📍 Current location', onPress: () => setPrompt('location') },
    { label: '🎙️ Voice note', onPress: () => setRecording(true) },
  ];

  const remove = (a: Attachment) => onChange(attachments.filter((x) => x.id !== a.id));

  const detailOptions = (a: Attachment): SheetOption[] => {
    const opts: SheetOption[] = [];
    if (a.kind === 'contact') {
      const ct = a as ContactAttachment;
      if (ct.phone) {
        opts.push({ label: `📞 Call ${ct.phone}`, onPress: () => contactActions.call(ct) });
        opts.push({ label: '💬 Text', onPress: () => contactActions.text(ct) });
      }
      if (ct.email) opts.push({ label: `✉️ Email ${ct.email}`, onPress: () => contactActions.email(ct) });
    } else if (a.kind === 'location') {
      opts.push({ label: 'Open in Google Maps', onPress: () => openAttachment(a) });
    } else if (a.kind === 'link') {
      opts.push({ label: 'Open in browser', onPress: () => openAttachment(a) });
    } else if (isStoredFile(a)) {
      if (a.url) opts.push({ label: 'Open', onPress: () => openAttachment(a) });
      if (a.uploadState === 'failed') {
        opts.push({
          label: '⚠️ Why didn’t this upload?',
          onPress: () => Alert.alert('Upload failed', a.uploadError ?? 'The file could not be uploaded.'),
        });
      }
    }
    opts.push({ label: 'Remove attachment', destructive: true, onPress: () => remove(a) });
    return opts;
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Label>Attachments</Label>
      <View style={styles.wrap}>
        {attachments.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => setSelected(a)}
            style={[styles.chip, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
          >
            <Text numberOfLines={1} style={{ color: c.text, maxWidth: 180 }}>
              {ICON[a.kind]} {a.name}
              {isStoredFile(a) && a.uploadState === 'pending' ? ' ⏳' : ''}
              {isStoredFile(a) && a.uploadState === 'failed' ? ' ⚠️' : ''}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setAdding(true)}
          style={[styles.chip, { borderColor: c.primary, borderStyle: 'dashed' }]}
        >
          <Text style={{ color: c.primary }}>＋ Add</Text>
        </Pressable>
      </View>
      <OptionSheet visible={adding} title="Attach" options={addOptions} onClose={() => setAdding(false)} />
      <OptionSheet
        visible={!!selected}
        title={selected?.name}
        options={selected ? detailOptions(selected) : []}
        onClose={() => setSelected(null)}
      />
      <PromptModal
        visible={prompt === 'link'}
        title="Add link"
        placeholder="https://"
        keyboardType="url"
        submitLabel="Add"
        onSubmit={(v) => add(makeLink(v))}
        onClose={() => setPrompt(null)}
      />
      <PromptModal
        visible={prompt === 'location'}
        title="Name this place"
        placeholder="e.g. Office, Client site"
        initial="Pinned place"
        submitLabel="Pin current location"
        onSubmit={(v) => run(async () => add(await currentLocation(v)))}
        onClose={() => setPrompt(null)}
      />
      <VoiceRecorder
        visible={recording}
        onClose={() => setRecording(false)}
        onDone={(picked) => run(async () => addFile('audio', picked))}
      />
    </View>
  );
}

export function VoiceRecorder({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (file: PickedFile) => void;
}) {
  const c = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [error, setError] = useState<string | null>(null);

  const stop = async (save: boolean) => {
    try {
      if (recorder.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (save && recorder.uri) {
        onDone({ uri: recorder.uri, name: `Voice note ${new Date().toLocaleString()}.m4a`, size: null, mimeType: 'audio/mp4' });
      }
    } catch (e) {
      setError(String(e));
      return;
    }
    setError(null);
    onClose();
  };

  useEffect(() => {
    if (!visible) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission was denied.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      // Voice notes are short memos: stop and save automatically at the limit.
      timer = setTimeout(() => stop(true), MAX_RECORDING_MS);
    })().catch((e) => setError(String(e)));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const secs = Math.floor((state.durationMillis ?? 0) / 1000);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => stop(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.recorder, { backgroundColor: c.surface }]}>
          <Text style={{ fontSize: 40 }}>{state.isRecording ? '🔴' : '🎙️'}</Text>
          <Text style={{ color: c.text, fontSize: 28, fontVariant: ['tabular-nums'], marginVertical: 8 }}>
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          </Text>
          <Text style={{ color: c.textMuted, marginBottom: 16 }}>
            {error ?? (state.isRecording ? 'Recording… (max 3 min)' : 'Preparing…')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cancel" variant="secondary" onPress={() => stop(false)} style={{ flex: 1 }} />
            <Button title="Save" onPress={() => stop(true)} disabled={!state.isRecording} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Keep a reference so the module's native side is initialised before first use.
void AudioModule;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 },
  recorder: { borderRadius: 16, padding: 24, alignItems: 'center' },
});
