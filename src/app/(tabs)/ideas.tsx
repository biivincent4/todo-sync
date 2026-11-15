import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { VoiceRecorder } from '../../components/Attachments';
import { Button, Chip, ChipRow, EmptyState, ErrorState, LoadingState, OptionSheet } from '../../components/ui';
import { useUser } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { formatDue } from '../../lib/dates';
import { filterIdeas, IDEA_SORT_LABEL, IdeaSort, newIdea, sortIdeas } from '../../lib/ideas';
import { IDEA_STAGE_META, IDEA_STAGES, IdeaStage } from '../../lib/types';
import { addStoredFile, PickedFile } from '../../services/attachments';
import { saveIdea } from '../../services/repo';
import { useTheme } from '../../theme';

export default function IdeasScreen() {
  const c = useTheme();
  const user = useUser();
  const { ideas, workspaceId, loading, error, refresh } = useData();
  const [draft, setDraft] = useState('');
  const [stage, setStage] = useState<IdeaStage | 'all'>('all');
  const [sort, setSort] = useState<IdeaSort>('updated');
  const [query, setQuery] = useState('');
  const [sortSheet, setSortSheet] = useState(false);
  const [recording, setRecording] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(() => sortIdeas(filterIdeas(ideas, stage, query), sort), [ideas, stage, query, sort]);

  const capture = () => {
    if (!draft.trim()) return;
    saveIdea(newIdea({ title: draft, workspaceId, createdBy: user.uid }, Date.now()));
    setDraft('');
  };

  const captureVoice = (file: PickedFile) => {
    const idea = newIdea({ title: `Voice idea ${new Date().toLocaleString()}`, workspaceId, createdBy: user.uid }, Date.now());
    const att = addStoredFile('audio', file, { col: 'ideas', workspaceId, id: idea.id });
    saveIdea({ ...idea, attachments: [att] });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading) return <LoadingState />;
  if (error && ideas.length === 0) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.capture, { backgroundColor: c.surface, borderColor: c.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="💭 Capture a rough thought…"
          placeholderTextColor={c.textMuted}
          style={[styles.input, { color: c.text, borderColor: c.border }]}
          onSubmitEditing={capture}
          returnKeyType="done"
        />
        <Button small title="🎙️" variant="secondary" onPress={() => setRecording(true)} />
        <Button small title="Add" onPress={capture} disabled={!draft.trim()} />
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search ideas"
        placeholderTextColor={c.textMuted}
        style={[styles.search, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
      />
      <ChipRow>
        <Chip label={`↕ ${IDEA_SORT_LABEL[sort]}`} onPress={() => setSortSheet(true)} />
        <Chip label="All" selected={stage === 'all'} onPress={() => setStage('all')} />
        {IDEA_STAGES.map((s) => (
          <Chip
            key={s}
            label={`${IDEA_STAGE_META[s].emoji} ${IDEA_STAGE_META[s].label}`}
            color={c.stage[s]}
            selected={stage === s}
            onPress={() => setStage(s)}
          />
        ))}
      </ChipRow>
      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 48, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            emoji="💡"
            title={ideas.length ? 'No matching ideas' : 'No ideas yet'}
            message={ideas.length ? 'Try another stage or search.' : 'Jot down half-formed thoughts and refine them over time.'}
          />
        }
        renderItem={({ item }) => {
          const meta = IDEA_STAGE_META[item.stage];
          const doneSteps = item.checklist.filter((x) => x.done).length;
          return (
            <Pressable
              onPress={() => router.push(`/idea/${item.id}`)}
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={styles.row}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', flex: 1 }} numberOfLines={2}>
                  {meta.emoji} {item.title}
                </Text>
                <Text style={{ color: c.stage[item.stage], fontSize: 12, fontWeight: '700' }}>{meta.label}</Text>
              </View>
              {item.notes ? (
                <Text style={{ color: c.textMuted, marginTop: 4 }} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 6 }}>
                Edited {formatDue(item.updatedAt)} · {item.versions.length} version{item.versions.length === 1 ? '' : 's'}
                {item.checklist.length ? ` · ☑ ${doneSteps}/${item.checklist.length}` : ''}
                {item.attachments.length ? ` · 📎 ${item.attachments.length}` : ''}
                {item.convertedTaskIds.length ? ` · → ${item.convertedTaskIds.length} task(s)` : ''}
              </Text>
            </Pressable>
          );
        }}
      />
      <OptionSheet
        visible={sortSheet}
        title="Sort ideas"
        onClose={() => setSortSheet(false)}
        options={(Object.keys(IDEA_SORT_LABEL) as IdeaSort[]).map((s) => ({
          label: IDEA_SORT_LABEL[s],
          selected: s === sort,
          onPress: () => setSort(s),
        }))}
      />
      <VoiceRecorder visible={recording} onClose={() => setRecording(false)} onDone={captureVoice} />
    </View>
  );
}

const styles = StyleSheet.create({
  capture: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  search: { margin: 12, marginBottom: 0, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
