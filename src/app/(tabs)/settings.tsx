import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Avatar, Button, Card, Chip, Label, PromptModal } from '../../components/ui';
import { useAuth, useUser } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { formatLead } from '../../lib/dates';
import { SORT_LABEL } from '../../lib/sort';
import { Priority, PRIORITIES, SortMode, SoundOption } from '../../lib/types';
import { requestNotificationPermission } from '../../services/notifications';
import { useTheme } from '../../theme';

const LEAD_PRESETS = [0, 5, 15, 30, 60, 120, 1440, 2880];
const SORTS: SortMode[] = ['due', 'priority', 'created', 'manual'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function SettingsScreen() {
  const c = useTheme();
  const user = useUser();
  const { signOut } = useAuth();
  const { settings, update } = useSettings();
  const [prompt, setPrompt] = useState<'planTime' | 'staleDays' | null>(null);

  const setReminder = (p: Priority, patch: Partial<(typeof settings.reminders)[Priority]>) =>
    update({ reminders: { ...settings.reminders, [p]: { ...settings.reminders[p], ...patch } } });

  const toggleLead = (p: Priority, m: number) => {
    const cur = settings.reminders[p].leadMinutes;
    setReminder(p, { leadMinutes: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => b - a) });
  };

  const enableWithPermission = async (fn: () => void) => {
    if (await requestNotificationPermission()) fn();
    else Alert.alert('Notifications are off', 'Allow notifications for todo-sync in system settings.');
  };

  const { hour, minute } = settings.morningPlan;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
      <Card style={styles.rowCard}>
        <Avatar profile={{ name: user.displayName ?? user.email ?? '', email: user.email, photoURL: user.photoURL }} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '600' }}>{user.displayName ?? 'Signed in'}</Text>
          <Text style={{ color: c.textMuted }}>{user.email}</Text>
        </View>
        <Button small variant="secondary" title="Sign out" onPress={() => signOut().catch((e) => Alert.alert('Sign-out failed', String(e)))} />
      </Card>

      <Card>
        <Label>Default sort</Label>
        <View style={styles.wrap}>
          {SORTS.map((s) => (
            <Chip key={s} label={SORT_LABEL[s]} selected={settings.sortMode === s} onPress={() => update({ sortMode: s })} />
          ))}
        </View>
        <Text style={[styles.hint, { color: c.textMuted }]}>Drag to reorder inside a column only works in Manual sort.</Text>
      </Card>

      <Card>
        <Label>My Day</Label>
        <View style={styles.switchRow}>
          <Text style={{ color: c.text, flex: 1 }}>Include tasks assigned to me in all workspaces</Text>
          <Switch value={settings.myDayAcrossWorkspaces} onValueChange={(v) => update({ myDayAcrossWorkspaces: v })} />
        </View>
        <View style={styles.switchRow}>
          <Text style={{ color: c.text, flex: 1 }}>
            ☀️ “Plan your day” notification at {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
          </Text>
          <Switch
            value={settings.morningPlan.enabled}
            onValueChange={(v) =>
              v
                ? enableWithPermission(() => update({ morningPlan: { ...settings.morningPlan, enabled: true } }))
                : update({ morningPlan: { ...settings.morningPlan, enabled: false } })
            }
          />
        </View>
        <Button small variant="ghost" title="Change time" onPress={() => setPrompt('planTime')} style={{ alignSelf: 'flex-start' }} />
      </Card>

      {PRIORITIES.map((p) => {
        const r = settings.reminders[p];
        return (
          <Card key={p}>
            <Label>
              {p === 'high' ? '🔴 High' : p === 'medium' ? '🟠 Medium' : '⚪ Low'} priority reminders
            </Label>
            <View style={styles.wrap}>
              {LEAD_PRESETS.map((m) => (
                <Chip key={m} label={formatLead(m)} selected={r.leadMinutes.includes(m)} onPress={() => toggleLead(p, m)} style={{ marginBottom: 6 }} />
              ))}
            </View>
            <View style={[styles.wrap, { marginTop: 6 }]}>
              {(['default', 'silent'] as SoundOption[]).map((s) => (
                <Chip key={s} label={s === 'default' ? '🔔 Sound' : '🔕 Silent'} selected={r.sound === s} onPress={() => setReminder(p, { sound: s })} />
              ))}
              <Chip label="📳 Vibrate" selected={r.vibrate} onPress={() => setReminder(p, { vibrate: !r.vibrate })} />
            </View>
            {p === 'high' ? (
              <Text style={[styles.hint, { color: c.textMuted }]}>
                High priority shows a full-screen alarm that stays until you dismiss, snooze or mark it done.
              </Text>
            ) : null}
          </Card>
        );
      })}
      <Button
        small
        variant="ghost"
        title="Allow notifications"
        onPress={() => enableWithPermission(() => Alert.alert('Notifications enabled'))}
      />

      <Card>
        <Label>Ideas</Label>
        <View style={styles.switchRow}>
          <Text style={{ color: c.text, flex: 1 }}>
            💭 Weekly revisit reminder for ideas not edited in {settings.ideaRevisit.staleDays} days
          </Text>
          <Switch
            value={settings.ideaRevisit.enabled}
            onValueChange={(v) =>
              v
                ? enableWithPermission(() => update({ ideaRevisit: { ...settings.ideaRevisit, enabled: true } }))
                : update({ ideaRevisit: { ...settings.ideaRevisit, enabled: false } })
            }
          />
        </View>
        <View style={styles.wrap}>
          {WEEKDAYS.map((d, i) => (
            <Chip
              key={d}
              label={d}
              selected={settings.ideaRevisit.weekday === i + 1}
              onPress={() => update({ ideaRevisit: { ...settings.ideaRevisit, weekday: i + 1 } })}
              style={{ marginBottom: 6 }}
            />
          ))}
        </View>
        <Button small variant="ghost" title="Change number of days" onPress={() => setPrompt('staleDays')} style={{ alignSelf: 'flex-start' }} />
      </Card>

      <PromptModal
        visible={prompt === 'planTime'}
        title="Morning notification time (HH:MM)"
        initial={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
        keyboardType="numbers-and-punctuation"
        onClose={() => setPrompt(null)}
        onSubmit={(v) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(v);
          if (!m || +m[1] > 23 || +m[2] > 59) return Alert.alert('Use HH:MM, e.g. 07:30');
          update({ morningPlan: { ...settings.morningPlan, hour: +m[1], minute: +m[2] } });
        }}
      />
      <PromptModal
        visible={prompt === 'staleDays'}
        title="Remind me about ideas not edited in N days"
        initial={String(settings.ideaRevisit.staleDays)}
        keyboardType="number-pad"
        onClose={() => setPrompt(null)}
        onSubmit={(v) => {
          const n = Math.round(Number(v));
          if (!Number.isFinite(n) || n < 1 || n > 365) return Alert.alert('Enter a number from 1 to 365');
          update({ ideaRevisit: { ...settings.ideaRevisit, staleDays: n } });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  hint: { fontSize: 12, marginTop: 8 },
});
