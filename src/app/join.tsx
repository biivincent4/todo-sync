import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';

import { Button, Field } from '../components/ui';
import { useUser } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { joinByCode } from '../services/workspaces';
import { useTheme } from '../theme';

/** Join an organization with an invite code. Also the target of invite links (todosync://join?code=...). */
export default function JoinScreen() {
  const c = useTheme();
  const user = useUser();
  const { setActive } = useWorkspace();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    try {
      const id = await joinByCode(code, user);
      setActive(id);
      router.replace('/');
    } catch (e) {
      Alert.alert('Could not join', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: c.textMuted, marginBottom: 12 }}>
        Enter the 8-character code an organization admin shared with you. You need to be online to join.
      </Text>
      <Field
        label="Invite code"
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        autoCapitalize="characters"
        autoFocus={!params.code}
        placeholder="ABCD2345"
      />
      <Button title={busy ? 'Joining…' : 'Join organization'} onPress={join} disabled={busy || code.trim().length < 6} />
    </ScrollView>
  );
}
