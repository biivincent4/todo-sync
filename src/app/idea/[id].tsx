import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AttachmentSection } from '../../components/Attachments';
import { Button, Chip, Field, Label, OptionSheet } from '../../components/ui';
import { useUser } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { clock } from '../../lib/dates';
import {
  applyIdeaEdit,
  checklistToTasks,
  convertibleChecklistIds,
  ideaToTask,
  markConverted,
} from '../../lib/ideas';
import { newId } from '../../lib/ids';
import { Attachment, ChecklistItem, IDEA_STAGE_META, IDEA_STAGES, IdeaStage } from '../../lib/types';
import { commitConversion, deleteIdea, saveIdea } from '../../services/repo';
import { useTheme } from '../../theme';

type ConvertMode = 'single' | 'checklist';

export default function IdeaScreen() {
  const c = useTheme();
  const user = useUser();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ideas, lists, deliverables } = useData();
  const idea = ideas.find((i) => i.id === id);

  // Local drafts; null means "not editing", so remote edits show through live.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [newStep, setNewStep] = useState('');
  const [convert, setConvert] = useState<ConvertMode | null>(null);
  const [convertStep, setConvertStep] = useState<'list' | 'deliverable'>('list');
  const [chosenList, setChosenList] = useState<string | null>(null);

  if (!idea) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textMuted }}>This idea no longer exists.</Text>
        <Button title="Back" onPress={() => router.back()} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const title = titleDraft ?? idea.title;
  const notes = notesDraft ?? idea.notes;
  const dirty = title !== idea.title || notes !== idea.notes;
  const clearDrafts = () => {
    setTitleDraft(null);
    setNotesDraft(null);
  };
  const patch = (p: Parameters<typeof applyIdeaEdit>[1]) => saveIdea(applyIdeaEdit(idea, p, clock()));

  const saveContent = () => {
    patch({ title: title.trim() || idea.title, notes });
    clearDrafts();
  };

  const setStage = (stage: IdeaStage) => patch({ stage });
  const setChecklist = (checklist: ChecklistItem[]) => patch({ checklist });
  const setAttachments = (attachments: Attachment[]) => patch({ attachments });

  const addStep = () => {
    if (!newStep.trim()) return;
    setChecklist([...idea.checklist, { id: newId(), text: newStep.trim(), done: false }]);
    setNewStep('');
  };

  const runConversion = (deliverableId: string | null) => {
    const mode = convert;
    setConvert(null);
    if (!mode || !chosenList) return;
    const now = clock();
    const base = dirty ? applyIdeaEdit(idea, { title, notes }, now) : idea;
    const opts = { listId: chosenList, deliverableId, createdBy: user.uid, now, startOrder: now };
    if (mode === 'single') {
      const task = ideaToTask(base, opts);
      commitConversion(markConverted(base, [task], now), [task]);
      Alert.alert('Task created', `"${task.title}" was added to your board.`);
    } else {
      const ids = convertibleChecklistIds(base);
      const tasks = checklistToTasks(base, opts);
      if (!tasks.length) {
        Alert.alert('Nothing to convert', 'Every checklist item already has a task.');
        return;
      }
      commitConversion(markConverted(base, tasks, now, ids), tasks);
      Alert.alert('Tasks created', `${tasks.length} task(s) added to your board.`);
    }
    clearDrafts();
  };

  const startConvert = (mode: ConvertMode) => {
    setConvert(mode);
    setConvertStep('list');
  };

  const remove = () =>
    Alert.alert('Delete idea?', 'Tasks created from it are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteIdea(idea);
          router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: `${IDEA_STAGE_META[idea.stage].emoji} Idea`,
          headerRight: () => (
            <Button small variant="ghost" title="History" onPress={() => router.push(`/idea-history/${idea.id}`)} />
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Field label="Idea" value={title} onChangeText={setTitleDraft} />
        <Field label="Notes" value={notes} onChangeText={setNotesDraft} multiline placeholder="Keep refining — every save is kept as a version." />
        <Button
          title={dirty ? 'Save version' : `Saved · ${idea.versions.length} version${idea.versions.length === 1 ? '' : 's'}`}
          onPress={saveContent}
          disabled={!dirty}
          style={{ marginBottom: 16 }}
        />

        <Label>Stage</Label>
        <View style={[styles.row, { marginBottom: 16 }]}>
          {IDEA_STAGES.map((s) => (
            <Chip
              key={s}
              label={`${IDEA_STAGE_META[s].emoji} ${IDEA_STAGE_META[s].label}`}
              color={c.stage[s]}
              selected={idea.stage === s}
              onPress={() => setStage(s)}
            />
          ))}
        </View>

        <Label>Checklist</Label>
        {idea.checklist.map((item) => (
          <View key={item.id} style={[styles.step, { borderColor: c.border }]}>
            <Pressable
              onPress={() => setChecklist(idea.checklist.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))}
              hitSlop={8}
            >
              <Text style={{ fontSize: 20 }}>{item.done ? '☑️' : '⬜'}</Text>
            </Pressable>
            <Text style={{ flex: 1, color: c.text, textDecorationLine: item.done ? 'line-through' : 'none' }}>{item.text}</Text>
            {item.taskId ? <Text style={{ color: c.textMuted, fontSize: 12 }}>→ task</Text> : null}
            <Pressable onPress={() => setChecklist(idea.checklist.filter((x) => x.id !== item.id))} hitSlop={8}>
              <Text style={{ color: c.textMuted }}>✕</Text>
            </Pressable>
          </View>
        ))}
        <View style={[styles.row, { marginTop: 6, marginBottom: 16 }]}>
          <TextInput
            value={newStep}
            onChangeText={setNewStep}
            placeholder="Add a step"
            placeholderTextColor={c.textMuted}
            onSubmitEditing={addStep}
            style={[styles.stepInput, { borderColor: c.border, color: c.text, backgroundColor: c.surface }]}
          />
          <Button small title="Add" onPress={addStep} disabled={!newStep.trim()} />
        </View>

        <AttachmentSection
          owner={{ col: 'ideas', workspaceId: idea.workspaceId, id: idea.id }}
          attachments={idea.attachments}
          onChange={setAttachments}
        />

        <Label>Turn into tasks</Label>
        <Button title="➡️ Convert to a task" variant="secondary" onPress={() => startConvert('single')} style={{ marginBottom: 8 }} />
        <Button
          title={`➡️ Each checklist step → a task (${convertibleChecklistIds(idea).length})`}
          variant="secondary"
          onPress={() => startConvert('checklist')}
          disabled={convertibleChecklistIds(idea).length === 0}
          style={{ marginBottom: 8 }}
        />
        {idea.convertedTaskIds.length ? (
          <Text style={{ color: c.textMuted, marginBottom: 16 }}>
            {idea.convertedTaskIds.length} task(s) created from this idea.
          </Text>
        ) : null}
        <Button title="Delete idea" variant="danger" onPress={remove} style={{ marginTop: 8 }} />
      </ScrollView>

      <OptionSheet
        visible={convert != null && convertStep === 'list'}
        title="Add to which list?"
        onClose={() => setConvert(null)}
        options={lists.map((l) => ({
          label: l.name,
          onPress: () => {
            setChosenList(l.id);
            // OptionSheet closes itself; reopen for the deliverable step.
            setTimeout(() => {
              setConvert(convert);
              setConvertStep('deliverable');
            }, 0);
          },
        }))}
      />
      <OptionSheet
        visible={convert != null && convertStep === 'deliverable'}
        title="Link to a deliverable?"
        onClose={() => setConvert(null)}
        options={[
          { label: 'No deliverable', onPress: () => runConversion(null) },
          ...deliverables.map((d) => ({ label: `🎯 ${d.title}`, onPress: () => runConversion(d.id) })),
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  stepInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
