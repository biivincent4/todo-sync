import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWorkspace } from '../context/WorkspaceContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../theme';
import { OptionSheet, SheetOption } from './ui';

/** Workspace switcher shown at the top of every tab. */
export function WorkspaceHeader({ title }: { title: string }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { workspaces, active, setActive, invites } = useWorkspace();
  const { sync } = useData();
  const [open, setOpen] = useState(false);

  const options: SheetOption[] = [
    ...workspaces.map((w) => ({
      label: `${w.type === 'personal' ? '🏠' : '🏢'} ${w.name}`,
      selected: w.id === active?.id,
      onPress: () => setActive(w.id),
    })),
    ...(invites.length
      ? [{ label: `✉️ ${invites.length} pending invite${invites.length === 1 ? '' : 's'}`, onPress: () => router.push('/workspaces') }]
      : []),
    { label: '⚙️ Manage workspaces…', onPress: () => router.push('/workspaces') },
  ];

  // Offline reflects real connectivity; Firestore keeps working from its cache meanwhile.
  const waiting = sync.pendingChanges + sync.pendingUploads;
  const waitingLabel = waiting ? ` · ${waiting} change${waiting === 1 ? '' : 's'} to sync` : '';
  const syncLabel = !sync.online
    ? `☁️ Offline${waitingLabel}`
    : sync.pendingUploads
      ? `⏳ ${sync.pendingUploads} upload${sync.pendingUploads === 1 ? '' : 's'} queued`
      : sync.hasPendingWrites
        ? `⏳ Syncing${sync.pendingChanges ? ` ${sync.pendingChanges}` : ''}…`
        : '';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderColor: c.border }]}>
      <Pressable onPress={() => setOpen(true)} style={styles.switcher} accessibilityLabel="Switch workspace">
        <Text style={[styles.ws, { color: c.textMuted }]} numberOfLines={1}>
          {active?.type === 'org' ? '🏢' : '🏠'} {active?.name ?? 'Personal'} ▾
          {invites.length ? `  •  ✉️ ${invites.length}` : ''}
        </Text>
        <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      </Pressable>
      {syncLabel ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{syncLabel}</Text> : null}
      <OptionSheet visible={open} title="Workspace" options={options} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  switcher: { flex: 1 },
  ws: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', marginTop: 2 },
});
