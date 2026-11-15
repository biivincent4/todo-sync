import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar, EmptyState, ErrorState, LoadingState, ProgressBar } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useNow } from '../../hooks/useNow';
import { formatDue } from '../../lib/dates';
import { deliverableProgress, deliverableTasks, effectiveStatus } from '../../lib/deliverables';
import { DELIVERABLE_STATUS_LABEL } from '../../lib/types';
import { useTheme } from '../../theme';

export default function DeliverablesScreen() {
  const c = useTheme();
  const { deliverables, tasks, loading, error, refresh } = useData();
  const { active } = useWorkspace();
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow();

  const rows = useMemo(
    () =>
      deliverables
        .map((d) => {
          const linked = deliverableTasks(tasks, d.id);
          return { d, progress: deliverableProgress(linked), status: effectiveStatus(d, linked, now) };
        })
        .sort((a, b) => (a.d.dueAt ?? Infinity) - (b.d.dueAt ?? Infinity) || a.d.title.localeCompare(b.d.title)),
    [deliverables, tasks, now],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading) return <LoadingState />;
  if (error && deliverables.length === 0) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.d.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 96, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            emoji="🎯"
            title="No deliverables yet"
            message="A deliverable is an outcome made up of tasks. Create one, then link tasks to it."
            action={{ title: 'New deliverable', onPress: () => router.push('/deliverable/new') }}
          />
        }
        renderItem={({ item: { d, progress, status } }) => (
          <Pressable
            onPress={() => router.push(`/deliverable/${d.id}`)}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <View style={styles.row}>
              <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
                {d.title}
              </Text>
              <View style={[styles.badge, { backgroundColor: c.deliverable[status] + '26' }]}>
                <Text style={{ color: c.deliverable[status], fontSize: 12, fontWeight: '700' }}>
                  {DELIVERABLE_STATUS_LABEL[status]}
                </Text>
              </View>
            </View>
            <ProgressBar percent={progress.percent} color={c.deliverable[status]} />
            <View style={[styles.row, { marginTop: 6 }]}>
              <Text style={{ color: c.textMuted, fontSize: 13 }}>{progress.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {d.dueAt ? (
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>🕑 {formatDue(d.dueAt, now)}</Text>
                ) : null}
                {d.ownerId && active?.memberProfiles[d.ownerId] ? (
                  <Avatar profile={active.memberProfiles[d.ownerId]} size={20} />
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />
      <Text
        accessibilityRole="button"
        accessibilityLabel="New deliverable"
        onPress={() => router.push('/deliverable/new')}
        style={[styles.fab, { backgroundColor: c.primary, color: c.primaryText }]}
      >
        +
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 30,
    lineHeight: 56,
    elevation: 6,
    overflow: 'hidden',
  },
});
