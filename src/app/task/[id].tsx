import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AttachmentSection } from '../../components/Attachments';
import { DateTimeField } from '../../components/DateTimeField';
import { RepeatDraft, RepeatEditor } from '../../components/RepeatEditor';
import { PRIORITY_LABEL } from '../../components/TaskCard';
import { Avatar, Button, Chip, Field, Label, OptionSheet } from '../../components/ui';
import { useUser } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { clock, dayKey } from '../../lib/dates';
import { newId } from '../../lib/ids';
import { isInMyDay } from '../../lib/myDay';
import { sortMembers } from '../../lib/permissions';
import { describeRule, RepeatRule, seriesStats } from '../../lib/recurrence';
import { startSeries } from '../../lib/series';
import { Attachment, PRIORITIES, Priority, Status, STATUS_LABEL, STATUSES, Task } from '../../lib/types';
import { buildTask, createNextOccurrence, deleteTask, saveTask, skipOccurrence, updateTask } from '../../services/repo';
import { processQueue } from '../../services/uploadQueue';
import { useTheme } from '../../theme';

export default function TaskScreen() {
  const c = useTheme();
  const user = useUser();
  const params = useLocalSearchParams<{
    id: string;
    ws?: string;
    listId?: string;
    status?: Status;
    deliverableId?: string;
    myDay?: string;
  }>();
  const { workspaces, activeId } = useWorkspace();
  const { findTask, lists, deliverables, ideas, tasks } = useData();

  const isNew = params.id === 'new';
  const existing = isNew ? undefined : findTask(params.id, params.ws);
  const [id] = useState(() => (isNew ? newId() : params.id));
  const workspaceId = existing?.workspaceId ?? params.ws ?? activeId;
  const workspace = workspaces.find((w) => w.id === workspaceId);
  // Lists/deliverables are loaded for the active workspace only.
  const sameWorkspace = workspaceId === activeId;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [dueAt, setDueAt] = useState<number | null>(existing?.dueAt ?? null);
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium');
  const [status, setStatus] = useState<Status>(existing?.status ?? params.status ?? 'todo');
  const [listId, setListId] = useState(existing?.listId ?? params.listId ?? lists[0]?.id ?? 'personal');
  const [deliverableId, setDeliverableId] = useState<string | null>(
    existing?.deliverableId ?? params.deliverableId ?? null,
  );
  const [assigneeId, setAssigneeId] = useState<string | null>(existing?.assigneeId ?? null);
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [inMyDay, setInMyDayState] = useState(
    existing ? isInMyDay(existing, user.uid, dayKey()) : params.myDay === '1',
  );
  const [repeat, setRepeat] = useState<RepeatDraft | null>(existing?.series ? withoutAnchor(existing.series.rule) : null);
  const [sheet, setSheet] = useState<'deliverable' | 'assignee' | null>(null);

  const members = useMemo(() => (workspace ? sortMembers(workspace) : []), [workspace]);
  const sourceIdea = existing?.sourceIdeaId ? ideas.find((i) => i.id === existing.sourceIdeaId) : undefined;
  const seriesId = existing?.series?.id;
  const stats = seriesId
    ? seriesStats(tasks.filter((t) => t.series?.id === seriesId).map((t) => ({ ...t, occurrence: t.occurrence ?? 0 })))
    : null;

  if (!isNew && !existing) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textMuted }}>This task no longer exists.</Text>
        <Button title="Back" onPress={() => router.back()} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const onAttachmentsChange = (next: Attachment[]) => {
    setAttachments(next);
    // Persist attachment changes immediately for existing tasks so uploads can link up.
    if (existing) updateTask(existing, { attachments: next });
  };

  const save = () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Give the task a title.');
      return;
    }
    const ruleChanged =
      !!existing?.series !== !!repeat ||
      (!!existing?.series && JSON.stringify(withoutAnchor(existing.series.rule)) !== JSON.stringify(repeat));
    if (existing?.series && repeat && !ruleChanged) {
      Alert.alert('Repeating task', 'Apply these changes to…', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This occurrence', onPress: () => commit('one') },
        { text: 'All future', onPress: () => commit('all') },
      ]);
      return;
    }
    commit('all');
  };

  const commit = (scope: 'one' | 'all') => {
    const now = clock();
    const myDay = { ...(existing?.myDay ?? {}) };
    if (inMyDay) myDay[user.uid] = dayKey();
    else delete myDay[user.uid];
    const fields: Partial<Task> = {
      title: title.trim(),
      notes,
      dueAt,
      priority,
      listId,
      deliverableId,
      assigneeId,
      attachments,
      myDay,
    };
    if (existing && status !== existing.status) {
      fields.status = status;
      fields.completedAt = status === 'done' ? now : null;
      if (status !== 'done') fields.skipped = false;
    }
    const base = existing ?? buildTask({ workspaceId, createdBy: user.uid, title, listId, status }, now, id);
    const merged: Task = { ...base, ...fields };
    if (repeat) {
      // A repeating task needs a due date to anchor the pattern.
      if (merged.dueAt == null) merged.dueAt = nextFullHour(now);
      // "This occurrence" keeps the series template; anything else updates it.
      if (!existing?.series || scope === 'all') Object.assign(merged, startSeries(merged, repeat, now));
    } else if (existing?.series) {
      merged.series = null;
    }
    const seriesFields: Partial<Task> = { dueAt: merged.dueAt, series: merged.series ?? null, occurrence: merged.occurrence ?? 0 };
    if (existing) updateTask(existing, { ...fields, ...seriesFields });
    else saveTask(merged);
    if (merged.status === 'done' && existing?.status !== 'done') createNextOccurrence(merged, now);
    processQueue();
    router.back();
  };

  const confirmDelete = () => {
    if (!existing) return router.back();
    Alert.alert('Delete task?', 'This also deletes its uploaded files.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTask(existing);
          router.back();
        },
      },
    ]);
  };

  const deliverable = deliverables.find((d) => d.id === deliverableId);
  const assignee = assigneeId ? workspace?.memberProfiles[assigneeId] : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: isNew ? 'New task' : 'Edit task',
          headerRight: () => <Button small title="Save" onPress={save} />,
        }}
      />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="What needs doing?" autoFocus={isNew} />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Details, links, context…" multiline />
        <DateTimeField label="Due" value={dueAt} onChange={setDueAt} />

        <Label>Priority</Label>
        <View style={styles.row}>
          {PRIORITIES.map((p) => (
            <Chip key={p} label={PRIORITY_LABEL[p]} color={c.priority[p]} selected={priority === p} onPress={() => setPriority(p)} />
          ))}
        </View>

        <Label>Status</Label>
        <View style={styles.row}>
          {STATUSES.map((s) => (
            <Chip key={s} label={STATUS_LABEL[s]} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>

        {sameWorkspace ? (
          <>
            <Label>List</Label>
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              {lists.map((l) => (
                <Chip key={l.id} label={l.name} selected={listId === l.id} onPress={() => setListId(l.id)} style={{ marginBottom: 6 }} />
              ))}
            </View>
            <Label>Deliverable</Label>
            <Button
              variant="secondary"
              title={deliverable ? `🎯 ${deliverable.title}` : 'None'}
              onPress={() => setSheet('deliverable')}
              style={{ marginBottom: 12 }}
            />
          </>
        ) : (
          <Text style={{ color: c.textMuted, marginBottom: 12 }}>
            In {workspace?.name ?? 'another workspace'} — switch workspace to change its list or deliverable.
          </Text>
        )}

        {workspace?.type === 'org' ? (
          <>
            <Label>Assignee</Label>
            <Button
              variant="secondary"
              title={assignee ? assignee.name : 'Unassigned'}
              onPress={() => setSheet('assignee')}
              style={{ marginBottom: 12 }}
            />
          </>
        ) : null}

        <RepeatEditor value={repeat} dueAt={dueAt} onChange={setRepeat} />
        {existing?.series ? (
          <View style={[styles.seriesBox, { backgroundColor: c.surfaceAlt }]}>
            <Text style={{ color: c.text, fontWeight: '600' }}>🔁 {describeRule(existing.series.rule)}</Text>
            {stats ? (
              <Text style={{ color: c.textMuted, marginTop: 4 }}>
                Occurrence {(existing.occurrence ?? 0) + 1} · ✅ {stats.completed} done
                {stats.skipped ? ` · ⏭ ${stats.skipped} skipped` : ''} · 🔥 streak {stats.streak}
              </Text>
            ) : null}
            {existing.status !== 'done' ? (
              <Button
                small
                variant="secondary"
                title="⏭ Skip this occurrence"
                onPress={() => {
                  skipOccurrence(existing);
                  router.back();
                }}
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
              />
            ) : null}
          </View>
        ) : null}

        <View style={[styles.switchRow, { borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 15 }}>☀️ In My Day</Text>
          <Switch value={inMyDay} onValueChange={setInMyDayState} />
        </View>

        <AttachmentSection
          owner={{ col: 'tasks', workspaceId, id }}
          attachments={attachments}
          onChange={onAttachmentsChange}
        />

        {sourceIdea ? (
          <Button
            variant="ghost"
            title={`💡 From idea: ${sourceIdea.title}`}
            onPress={() => router.push(`/idea/${sourceIdea.id}`)}
          />
        ) : null}

        <Button title={isNew ? 'Create task' : 'Save changes'} onPress={save} style={{ marginTop: 8 }} />
        {!isNew ? <Button title="Delete task" variant="danger" onPress={confirmDelete} style={{ marginTop: 8 }} /> : null}
        {assignee ? (
          <View style={[styles.row, { marginTop: 16, alignItems: 'center' }]}>
            <Avatar profile={assignee} />
            <Text style={{ color: c.textMuted, marginLeft: 8 }}>Reminders go to {assignee.name}</Text>
          </View>
        ) : null}
      </ScrollView>

      <OptionSheet
        visible={sheet === 'deliverable'}
        title="Link to deliverable"
        onClose={() => setSheet(null)}
        options={[
          { label: 'None', selected: !deliverableId, onPress: () => setDeliverableId(null) },
          ...deliverables.map((d) => ({
            label: d.title,
            selected: d.id === deliverableId,
            onPress: () => setDeliverableId(d.id),
          })),
        ]}
      />
      <OptionSheet
        visible={sheet === 'assignee'}
        title="Assign to"
        onClose={() => setSheet(null)}
        options={[
          { label: 'Unassigned', selected: !assigneeId, onPress: () => setAssigneeId(null) },
          ...members.map((uid) => ({
            label: `${workspace?.memberProfiles[uid]?.name ?? uid}${uid === user.uid ? ' (me)' : ''}`,
            selected: uid === assigneeId,
            onPress: () => setAssigneeId(uid),
          })),
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48 },
  row: { flexDirection: 'row', marginBottom: 12 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  seriesBox: { borderRadius: 10, padding: 12, marginBottom: 12 },
});

function withoutAnchor(rule: RepeatRule): RepeatDraft {
  const rest: RepeatDraft & { anchor?: number } = { ...rule };
  delete rest.anchor;
  return rest;
}

function nextFullHour(now: number): number {
  const d = new Date(now);
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.getTime();
}
