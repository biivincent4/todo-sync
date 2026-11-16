import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dueBucket, formatDue } from '../lib/dates';
import { MemberProfile, PRIORITIES, Task } from '../lib/types';
import { useTheme } from '../theme';
import { Avatar } from './ui';

export const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
export { PRIORITIES };

export function TaskCard({
  task,
  listName,
  assignee,
  workspaceName,
  onPress,
  onMenu,
  faded,
  now,
}: {
  task: Task;
  listName?: string;
  assignee?: MemberProfile | null;
  workspaceName?: string;
  onPress?: () => void;
  onMenu?: () => void;
  faded?: boolean;
  now: number;
}) {
  const c = useTheme();
  const overdue = task.status !== 'done' && dueBucket(task.dueAt, now) === 'overdue';
  const done = task.status === 'done';
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border, opacity: faded ? 0.35 : 1 },
      ]}
    >
      <View style={[styles.marker, { backgroundColor: c.priority[task.priority] }]} />
      <View style={{ flex: 1, paddingVertical: 10, paddingRight: 4 }}>
        <Text
          numberOfLines={2}
          style={[styles.title, { color: c.text, textDecorationLine: done ? 'line-through' : 'none' }]}
        >
          {task.title || 'Untitled'}
        </Text>
        <View style={styles.meta}>
          {task.dueAt != null ? (
            <Text style={[styles.metaText, { color: overdue ? c.danger : c.textMuted }]}>
              🕑 {formatDue(task.dueAt, now)}
            </Text>
          ) : null}
          {listName ? (
            <View style={[styles.pill, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.pillText, { color: c.textMuted }]}>{listName}</Text>
            </View>
          ) : null}
          {workspaceName ? (
            <View style={[styles.pill, { backgroundColor: c.primary + '22' }]}>
              <Text style={[styles.pillText, { color: c.primary }]}>{workspaceName}</Text>
            </View>
          ) : null}
          {task.series ? <Text style={[styles.metaText, { color: c.textMuted }]}>🔁</Text> : null}
          {task.attachments.length > 0 ? (
            <Text style={[styles.metaText, { color: c.textMuted }]}>📎 {task.attachments.length}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.right}>
        {assignee ? <Avatar profile={assignee} size={24} /> : null}
        {onMenu ? (
          <Pressable hitSlop={10} onPress={onMenu} accessibilityLabel="Task actions" style={{ padding: 4 }}>
            <Text style={{ color: c.textMuted, fontSize: 18 }}>⋯</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  marker: { width: 5, marginRight: 10 },
  title: { fontSize: 15, fontWeight: '500' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  metaText: { fontSize: 12 },
  pill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '500' },
  right: { alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 8 },
});
