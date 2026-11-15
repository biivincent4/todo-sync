import notifee from '@notifee/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { useSettings } from '../../context/SettingsContext';
import { formatDue } from '../../lib/dates';
import { SNOOZE_OPTIONS } from '../../lib/reminders';
import { cancelReminderNotification, markTaskDone, snoozeReminder } from '../../services/notifications';
import { useTheme } from '../../theme';

/** Full-screen alarm UI launched by high-priority reminders. Must be dismissed or snoozed. */
export default function ReminderScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { taskId, ws } = useLocalSearchParams<{ taskId: string; ws: string }>();
  const { findTask } = useData();
  const { settings } = useSettings();
  const task = findTask(taskId, ws);

  const close = async () => {
    await cancelReminderNotification(taskId);
    await notifee.stopForegroundService().catch(() => undefined);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const snooze = async (minutes: number) => {
    await snoozeReminder(
      { taskId, workspaceId: ws, priority: task?.priority ?? 'high', title: task?.title ?? 'Task' },
      minutes,
      settings,
    );
    await close();
  };

  const done = async () => {
    await markTaskDone(ws, taskId);
    await close();
  };

  const color = task ? c.priority[task.priority] : c.danger;

  return (
    <View style={[styles.wrap, { backgroundColor: c.bg, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={{ fontSize: 64 }}>⏰</Text>
      <Text style={[styles.title, { color: c.text }]}>{task?.title ?? 'Reminder'}</Text>
      {task?.dueAt ? <Text style={{ color, fontSize: 18 }}>Due {formatDue(task.dueAt)}</Text> : null}
      {task?.notes ? (
        <Text style={{ color: c.textMuted, marginTop: 12, textAlign: 'center' }} numberOfLines={4}>
          {task.notes}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      <Button title="✓ Mark done" onPress={done} style={styles.btn} />
      <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
        {SNOOZE_OPTIONS.map((m) => (
          <Button key={m} title={`Snooze ${m < 60 ? `${m}m` : '1h'}`} variant="secondary" onPress={() => snooze(m)} style={{ flex: 1 }} />
        ))}
      </View>
      <Button title="Dismiss" variant="ghost" onPress={close} style={styles.btn} />
      {task ? (
        <Button
          title="Open task"
          variant="ghost"
          onPress={() => router.replace(`/task/${task.id}?ws=${task.workspaceId}`)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginVertical: 12 },
  btn: { alignSelf: 'stretch', marginVertical: 6 },
});
