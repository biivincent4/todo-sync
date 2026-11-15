import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { KanbanBoard } from '../../components/KanbanBoard';
import { Button, ErrorState, LoadingState, ProgressBar } from '../../components/ui';
import { useUser } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useSettings } from '../../context/SettingsContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useNow } from '../../hooks/useNow';
import { dayKey, formatDue } from '../../lib/dates';
import { getSuggestions, mergeTasks, myDayProgress, myDayTasks, SUGGESTION_LABEL } from '../../lib/myDay';
import { setInMyDay } from '../../services/repo';
import { useTheme } from '../../theme';

export default function MyDayScreen() {
  const c = useTheme();
  const user = useUser();
  const { settings } = useSettings();
  const { workspaces } = useWorkspace();
  const { tasks, assignedToMe, loading, error, refresh } = useData();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const now = useNow();
  const today = dayKey(now);

  const pool = useMemo(
    () => (settings.myDayAcrossWorkspaces ? mergeTasks(tasks, assignedToMe) : tasks),
    [tasks, assignedToMe, settings.myDayAcrossWorkspaces],
  );
  const planned = useMemo(() => myDayTasks(pool, user.uid, today), [pool, user.uid, today]);
  const suggestions = useMemo(() => getSuggestions(pool, user.uid, now), [pool, user.uid, now]);
  const progress = myDayProgress(planned);
  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name;

  if (loading) return <LoadingState label="Planning your day…" />;
  if (error && tasks.length === 0) return <ErrorState message={error} onRetry={refresh} />;

  const header = (
    <View style={[styles.header, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.row}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={{ color: c.textMuted }}>{progress.total ? progress.label : 'Nothing planned yet'}</Text>
      </View>
      <ProgressBar percent={progress.total ? (progress.done / progress.total) * 100 : 0} color={c.success} />
      <Button
        small
        variant={showSuggestions ? 'secondary' : 'ghost'}
        title={showSuggestions ? 'Hide suggestions' : `✨ Suggestions (${suggestions.length})`}
        onPress={() => setShowSuggestions((s) => !s)}
        style={{ alignSelf: 'flex-start', marginTop: 8 }}
      />
      {showSuggestions ? (
        <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
          {suggestions.length === 0 ? (
            <Text style={{ color: c.textMuted, paddingVertical: 8 }}>No suggestions — you’re all caught up. 🎉</Text>
          ) : (
            suggestions.map(({ task, reason }) => (
              <View key={`${task.workspaceId}/${task.id}`} style={[styles.suggestion, { borderColor: c.border }]}>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/task/${task.id}?ws=${task.workspaceId}`)}>
                  <Text style={{ color: c.text }} numberOfLines={1}>
                    <Text style={{ color: c.priority[task.priority] }}>● </Text>
                    {task.title}
                  </Text>
                  <Text style={{ color: reason === 'overdue' ? c.danger : c.textMuted, fontSize: 12 }}>
                    {SUGGESTION_LABEL[reason]}
                    {task.dueAt ? ` · ${formatDue(task.dueAt)}` : ''}
                    {settings.myDayAcrossWorkspaces && wsName(task.workspaceId) ? ` · ${wsName(task.workspaceId)}` : ''}
                  </Text>
                </Pressable>
                <Button small title="＋ Add" onPress={() => setInMyDay(task, user.uid, true)} />
              </View>
            ))
          )}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <KanbanBoard
      tasks={planned}
      header={header}
      listFilter
      showWorkspace={settings.myDayAcrossWorkspaces}
      newTaskParams={{ myDay: '1' }}
      emptyMessage="Add tasks from suggestions, or tap + to create one for today."
    />
  );
}

const styles = StyleSheet.create({
  header: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
