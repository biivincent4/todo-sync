import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, Label, OptionSheet, PromptModal, SheetOption } from '../../components/ui';
import { useUser } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  canChangeRole,
  canEditWorkspaceSettings,
  canInvite,
  canLeave,
  canRemoveMember,
  isValidEmail,
  ROLE_LABEL,
  roleOf,
  sortMembers,
} from '../../lib/permissions';
import { Role } from '../../lib/types';
import {
  createInviteCode,
  inviteByEmail,
  inviteLink,
  leaveWorkspace,
  removeMember,
  renameWorkspace,
  revokeEmailInvite,
  setMemberRole,
} from '../../services/workspaces';
import { useTheme } from '../../theme';

export default function WorkspaceScreen() {
  const c = useTheme();
  const user = useUser();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspaces, setActive, active } = useWorkspace();
  const ws = workspaces.find((w) => w.id === id);
  const [prompt, setPrompt] = useState<'rename' | 'invite' | null>(null);
  const [memberMenu, setMemberMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ws) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.textMuted }}>You are no longer a member of this workspace.</Text>
      </View>
    );
  }

  const myRole = roleOf(ws, user.uid);
  const manage = canEditWorkspaceSettings(myRole);

  const shareCode = async () => {
    setBusy(true);
    try {
      const code = ws.inviteCode ?? (await createInviteCode(ws, user));
      await Share.share({ message: `Join "${ws.name}" on todo-sync with code ${code}\n${inviteLink(code)}` });
    } catch (e) {
      Alert.alert('Could not create invite', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rotateCode = async () => {
    setBusy(true);
    try {
      await createInviteCode(ws, user);
    } catch (e) {
      Alert.alert('Could not create invite', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = () =>
    Alert.alert(`Leave ${ws.name}?`, 'You will lose access to its tasks, ideas and deliverables.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          leaveWorkspace(ws.id, user.uid)
            .then(() => router.back())
            .catch((e) => Alert.alert('Could not leave', String(e))),
      },
    ]);

  const memberOptions = (uid: string): SheetOption[] => {
    const target = ws.members[uid] as Role;
    const opts: SheetOption[] = [];
    (['admin', 'member'] as Role[]).forEach((r) => {
      if (canChangeRole(myRole, target, r, user.uid, uid) && r !== target) {
        opts.push({ label: `Make ${ROLE_LABEL[r]}`, onPress: () => setMemberRole(ws.id, uid, r) });
      }
    });
    if (canRemoveMember(myRole, target, user.uid, uid)) {
      opts.push({
        label: 'Remove from organization',
        destructive: true,
        onPress: () => removeMember(ws.id, uid).catch((e) => Alert.alert('Could not remove', String(e))),
      });
    }
    return opts;
  };

  return (
    <>
      <Stack.Screen options={{ title: ws.name }} />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {active?.id !== ws.id ? <Button title="Switch to this workspace" onPress={() => setActive(ws.id)} /> : null}

        <Card>
          <Label>Members ({ws.memberIds.length})</Label>
          {sortMembers(ws).map((uid) => {
            const p = ws.memberProfiles[uid];
            const opts = memberOptions(uid);
            return (
              <View key={uid} style={styles.member}>
                <Avatar profile={p} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text }}>
                    {p?.name ?? uid}
                    {uid === user.uid ? ' (you)' : ''}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>
                    {ROLE_LABEL[ws.members[uid] as Role]}
                    {p?.email ? ` · ${p.email}` : ''}
                  </Text>
                </View>
                {opts.length ? <Button small variant="ghost" title="⋯" onPress={() => setMemberMenu(uid)} /> : null}
              </View>
            );
          })}
        </Card>

        {canInvite(ws, myRole) ? (
          <Card>
            <Label>Invite</Label>
            <Button title="✉️ Invite by email" variant="secondary" onPress={() => setPrompt('invite')} style={{ marginBottom: 8 }} />
            <Button title={busy ? 'Working…' : '🔗 Share invite link / code'} onPress={shareCode} disabled={busy} />
            {ws.inviteCode ? (
              <View style={[styles.member, { marginTop: 8 }]}>
                <Text style={{ color: c.text, fontSize: 20, letterSpacing: 3, flex: 1 }}>{ws.inviteCode}</Text>
                <Button small variant="ghost" title="Copy" onPress={() => Clipboard.setStringAsync(ws.inviteCode ?? '')} />
                <Button small variant="ghost" title="New code" onPress={rotateCode} />
              </View>
            ) : null}
            {ws.invitedEmails.length ? (
              <>
                <Text style={{ color: c.textMuted, marginTop: 12, marginBottom: 4 }}>Pending email invites</Text>
                {ws.invitedEmails.map((e) => (
                  <View key={e} style={styles.member}>
                    <Text style={{ color: c.text, flex: 1 }}>{e}</Text>
                    <Button small variant="ghost" title="Revoke" onPress={() => revokeEmailInvite(ws.id, e)} />
                  </View>
                ))}
              </>
            ) : null}
          </Card>
        ) : null}

        {manage ? <Button title="Rename organization" variant="secondary" onPress={() => setPrompt('rename')} /> : null}
        {canLeave(ws, myRole) ? <Button title="Leave organization" variant="danger" onPress={leave} /> : null}
        {myRole === 'owner' ? (
          <Text style={{ color: c.textMuted, fontSize: 12 }}>As the owner you can’t leave; promote an admin to manage members.</Text>
        ) : null}
      </ScrollView>

      <PromptModal
        visible={prompt === 'rename'}
        title="Rename organization"
        initial={ws.name}
        onClose={() => setPrompt(null)}
        onSubmit={(name) => renameWorkspace(ws.id, name)}
      />
      <PromptModal
        visible={prompt === 'invite'}
        title="Invite by email"
        placeholder="name@company.com"
        keyboardType="email-address"
        submitLabel="Invite"
        onClose={() => setPrompt(null)}
        onSubmit={(email) => {
          if (!isValidEmail(email)) return Alert.alert('Enter a valid email address');
          inviteByEmail(ws.id, email);
          Alert.alert('Invitation added', `${email} will see the invite when they sign in with that Google account.`);
        }}
      />
      <OptionSheet
        visible={!!memberMenu}
        title={memberMenu ? ws.memberProfiles[memberMenu]?.name : undefined}
        options={memberMenu ? memberOptions(memberMenu) : []}
        onClose={() => setMemberMenu(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
