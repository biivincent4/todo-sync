import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { KanbanBoard } from '../../components/KanbanBoard';
import { Chip, ChipRow, ErrorState, LoadingState } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../theme';

/** Each list has its own Kanban board. */
export default function BoardScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ list?: string }>();
  const { tasks, lists, loading, error, refresh, workspaceId } = useData();
  const [listId, setListId] = useState<string | null>(params.list ?? null);

  // Follow ?list= when navigating here from the Lists tab.
  const [lastParam, setLastParam] = useState(params.list);
  if (params.list !== lastParam) {
    setLastParam(params.list);
    if (params.list) setListId(params.list);
  }

  // Pick the first list when none is selected or the selected one disappears (workspace switch).
  const current = lists.find((l) => l.id === listId) ?? lists[0];
  const boardTasks = useMemo(() => tasks.filter((t) => t.listId === current?.id), [tasks, current?.id]);

  if (loading) return <LoadingState label="Loading your board…" />;
  if (error && tasks.length === 0) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ChipRow>
        {lists.map((l) => (
          <Chip key={l.id} label={l.name} selected={l.id === current?.id} onPress={() => setListId(l.id)} />
        ))}
      </ChipRow>
      <KanbanBoard
        key={`${workspaceId}/${current?.id}`}
        tasks={boardTasks}
        newTaskParams={current ? { listId: current.id } : undefined}
        emptyMessage={`Tap + to add a task to ${current?.name ?? 'this list'}.`}
      />
    </View>
  );
}
