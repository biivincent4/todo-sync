import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Label, PromptModal } from '../components/ui';
import { useUser } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { ROLE_LABEL, roleOf } from '../lib/permissions';
import { acceptEmailInvite, createOrgWorkspace, declineEmailInvite } from '../services/workspaces';
import { useTheme } from '../theme';

export default function WorkspacesScreen() {
  const c = useTheme();
  const user = useUser();
  const { workspaces, invites, active, setActive } = useWorkspace();
  const [creating, setCreating] = useState(false);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {invites.length ? (
        <Card>
          <Label>Invitations</Label>
          {invites.map((w) => (
            <View key={w.id} style={styles.row}>
              <Text style={{ color: c.text, flex: 1 }}>🏢 {w.name}</Text>
              <Button
                small
                title="Join"
                onPress={() =>
                  acceptEmailInvite(w, user)
                    .then(() => setActive(w.id))
                    .catch((e) => Alert.alert('Could not join', e instanceof Error ? e.message : String(e)))
                }
              />
              <Button small variant="ghost" title="Decline" onPress={() => user.email && declineEmailInvite(w, user.email)} />
            </View>
          ))}
        </Card>
      ) : null}

      <Label>Your workspaces</Label>
      {workspaces.map((w) => {
        const role = roleOf(w, user.uid);
        return (
          <Pressable
            key={w.id}
            onPress={() => (w.type === 'org' ? router.push(`/workspace/${w.id}`) : setActive(w.id))}
            style={[styles.card, { backgroundColor: c.surface, borderColor: w.id === active?.id ? c.primary : c.border }]}
          >
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', flex: 1 }}>
              {w.type === 'personal' ? '🏠' : '🏢'} {w.name}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>
              {w.type === 'org' ? `${w.memberIds.length} members · ${role ? ROLE_LABEL[role] : ''}` : 'Just you'}
            </Text>
            {w.id !== active?.id ? (
              <Button small variant="ghost" title="Switch" onPress={() => setActive(w.id)} />
            ) : (
              <Text style={{ color: c.primary, fontSize: 12, marginLeft: 8 }}>Active</Text>
            )}
          </Pressable>
        );
      })}

      <Button title="＋ Create organization" onPress={() => setCreating(true)} />
      <Button title="Join with invite code" variant="secondary" onPress={() => router.push('/join')} />

      <PromptModal
        visible={creating}
        title="New organization"
        placeholder="e.g. Acme Inc."
        submitLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={(name) => {
          const id = createOrgWorkspace(user, name);
          setActive(id);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 14 },
});
