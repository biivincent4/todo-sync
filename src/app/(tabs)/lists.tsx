import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, LoadingState, OptionSheet, PromptModal } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { newId } from '../../lib/ids';
import { TaskList } from '../../lib/types';
import { deleteList, saveList } from '../../services/repo';
import { useTheme } from '../../theme';

export default function ListsScreen() {
  const c = useTheme();
  const { lists, tasks, workspaceId, loading } = useData();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<TaskList | null>(null);
  const [menu, setMenu] = useState<TaskList | null>(null);

  if (loading) return <LoadingState />;

  const counts = (id: string) => {
    const mine = tasks.filter((t) => t.listId === id);
    return { open: mine.filter((t) => t.status !== 'done').length, total: mine.length };
  };

  const remove = (l: TaskList) => {
    const fallback = lists.find((x) => x.id !== l.id);
    if (!fallback) {
      Alert.alert('Keep at least one list');
      return;
    }
    Alert.alert(`Delete "${l.name}"?`, `Its tasks move to "${fallback.name}".`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteList(workspaceId, l.id, tasks, fallback.id) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={lists}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: 12, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState emoji="📋" title="No lists" action={{ title: 'New list', onPress: () => setCreating(true) }} />}
        renderItem={({ item }) => {
          const n = counts(item.id);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/', params: { list: item.id } })}
              onLongPress={() => setMenu(item)}
              style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '500', flex: 1 }}>{item.name}</Text>
              <Text style={{ color: c.textMuted }}>
                {n.open} open · {n.total}
              </Text>
              <Pressable hitSlop={10} onPress={() => setMenu(item)} style={{ paddingLeft: 12 }}>
                <Text style={{ color: c.textMuted, fontSize: 18 }}>⋯</Text>
              </Pressable>
            </Pressable>
          );
        }}
        ListFooterComponent={<Button title="＋ New list" variant="secondary" onPress={() => setCreating(true)} style={{ marginTop: 8 }} />}
      />
      <PromptModal
        visible={creating}
        title="New list"
        placeholder="e.g. Groceries"
        submitLabel="Create"
        onSubmit={(name) => saveList(workspaceId, { id: newId(), name })}
        onClose={() => setCreating(false)}
      />
      <PromptModal
        visible={!!renaming}
        title="Rename list"
        initial={renaming?.name}
        onSubmit={(name) => renaming && saveList(workspaceId, { id: renaming.id, name })}
        onClose={() => setRenaming(null)}
      />
      <OptionSheet
        visible={!!menu}
        title={menu?.name}
        onClose={() => setMenu(null)}
        options={
          menu
            ? [
                { label: 'Open board', onPress: () => router.push({ pathname: '/', params: { list: menu.id } }) },
                { label: 'Rename', onPress: () => setRenaming(menu) },
                { label: 'Delete', destructive: true, onPress: () => remove(menu) },
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
});
