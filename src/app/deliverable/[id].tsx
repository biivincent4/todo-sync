import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateTimeField } from '../../components/DateTimeField';
import { KanbanBoard } from '../../components/KanbanBoard';
import { Button, Chip, Field, Label, OptionSheet, ProgressBar } from '../../components/ui';
import { useUser } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useNow } from '../../hooks/useNow';
import { formatDue } from '../../lib/dates';
import { deliverableProgress, deliverableTasks, effectiveStatus } from '../../lib/deliverables';
import { newId } from '../../lib/ids';
import { sortMembers } from '../../lib/permissions';
import {
  Deliverable,
  DELIVERABLE_STATUS_LABEL,
  DELIVERABLE_STATUSES,
  DeliverableStatus,
} from '../../lib/types';
import { deleteDeliverable, saveDeliverable } from '../../services/repo';
import { useTheme } from '../../theme';

export default function DeliverableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { deliverables } = useData();
  const existing = deliverables.find((d) => d.id === id);
  const [editing, setEditing] = useState(id === 'new');

  if (id === 'new' || editing || !existing) {
    return <DeliverableEditor existing={existing} onDone={() => (existing ? setEditing(false) : router.back())} />;
  }
  return <DeliverableBoard deliverable={existing} onEdit={() => setEditing(true)} />;
}

function DeliverableBoard({ deliverable: d, onEdit }: { deliverable: Deliverable; onEdit: () => void }) {
  const c = useTheme();
  const { tasks, lists } = useData();
  const { active } = useWorkspace();
  const now = useNow();
  const linked = useMemo(() => deliverableTasks(tasks, d.id), [tasks, d.id]);
  const progress = deliverableProgress(linked);
  const status = effectiveStatus(d, linked, now);
  const owner = d.ownerId ? active?.memberProfiles[d.ownerId] : null;

  const header = (
    <View style={[styles.header, { backgroundColor: c.surface, borderColor: c.border }]}>
      {d.description ? <Text style={{ color: c.textMuted }}>{d.description}</Text> : null}
      <View style={styles.row}>
        <Text style={{ color: c.deliverable[status], fontWeight: '700' }}>{DELIVERABLE_STATUS_LABEL[status]}</Text>
        <Text style={{ color: c.textMuted }}>{progress.label}</Text>
      </View>
      <ProgressBar percent={progress.percent} color={c.deliverable[status]} />
      <Text style={{ color: c.textMuted, fontSize: 12 }}>
        {d.dueAt ? `Due ${formatDue(d.dueAt)}` : 'No due date'}
        {owner ? ` · Owner: ${owner.name}` : ''}
      </Text>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{ title: d.title, headerRight: () => <Button small variant="ghost" title="Edit" onPress={onEdit} /> }}
      />
      <KanbanBoard
        tasks={linked}
        header={header}
        listFilter
        newTaskParams={{ deliverableId: d.id, listId: lists[0]?.id ?? 'personal' }}
        emptyMessage="Tap + to add a task to this deliverable, or link existing tasks from the task editor."
      />
    </>
  );
}

function DeliverableEditor({ existing, onDone }: { existing?: Deliverable; onDone: () => void }) {
  const c = useTheme();
  const user = useUser();
  const { workspaceId, tasks } = useData();
  const { active } = useWorkspace();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [dueAt, setDueAt] = useState<number | null>(existing?.dueAt ?? null);
  const [status, setStatus] = useState<DeliverableStatus>(existing?.status ?? 'not_started');
  const [ownerId, setOwnerId] = useState<string | null>(existing?.ownerId ?? user.uid);
  const [ownerSheet, setOwnerSheet] = useState(false);
  const members = active ? sortMembers(active) : [];

  const save = () => {
    if (!title.trim()) {
      Alert.alert('Title required');
      return;
    }
    const now = Date.now();
    saveDeliverable({
      id: existing?.id ?? newId(),
      workspaceId: existing?.workspaceId ?? workspaceId,
      title: title.trim(),
      description,
      ownerId,
      dueAt,
      status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    onDone();
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Delete deliverable?', 'Linked tasks are kept but unlinked.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteDeliverable(existing, tasks);
          router.back();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: existing ? 'Edit deliverable' : 'New deliverable',
          headerRight: () => <Button small title="Save" onPress={save} />,
        }}
      />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Launch v1 website" autoFocus={!existing} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline placeholder="What does done look like?" />
        <DateTimeField label="Due" value={dueAt} onChange={setDueAt} />
        <Label>Status</Label>
        <View style={[styles.row, { flexWrap: 'wrap', justifyContent: 'flex-start', marginBottom: 12 }]}>
          {DELIVERABLE_STATUSES.map((s) => (
            <Chip
              key={s}
              label={DELIVERABLE_STATUS_LABEL[s]}
              color={c.deliverable[s]}
              selected={status === s}
              onPress={() => setStatus(s)}
              style={{ marginBottom: 6 }}
            />
          ))}
        </View>
        <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 12 }}>
          Shown as At risk automatically when a linked task is overdue, or when the due date passes with tasks still open.
        </Text>
        <Label>Owner</Label>
        <Button
          variant="secondary"
          title={ownerId ? (active?.memberProfiles[ownerId]?.name ?? 'Me') : 'No owner'}
          onPress={() => setOwnerSheet(true)}
          style={{ marginBottom: 16 }}
        />
        <Button title="Save" onPress={save} />
        {existing ? <Button title="Delete deliverable" variant="danger" onPress={remove} style={{ marginTop: 8 }} /> : null}
      </ScrollView>
      <OptionSheet
        visible={ownerSheet}
        title="Owner"
        onClose={() => setOwnerSheet(false)}
        options={[
          { label: 'No owner', selected: !ownerId, onPress: () => setOwnerId(null) },
          ...members.map((uid) => ({
            label: active?.memberProfiles[uid]?.name ?? uid,
            selected: uid === ownerId,
            onPress: () => setOwnerId(uid),
          })),
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { padding: 12, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
