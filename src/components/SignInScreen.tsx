import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { SignInCancelled } from '../services/authService';
import { useTheme } from '../theme';
import { Button } from './ui';

export function SignInScreen() {
  const c = useTheme();
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    setBusy(true);
    try {
      await signIn();
    } catch (e) {
      if (!(e instanceof SignInCancelled)) {
        Alert.alert('Sign-in failed', e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: c.bg }]}>
      <Text style={{ fontSize: 56 }}>✅</Text>
      <Text style={[styles.title, { color: c.text }]}>todo-sync</Text>
      <Text style={[styles.sub, { color: c.textMuted }]}>
        Plan your day, run your board, and stay in sync across devices and teams.
      </Text>
      <Button title={busy ? 'Signing in…' : 'Sign in with Google'} onPress={onSignIn} disabled={busy} style={styles.btn} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 32, fontWeight: '800', marginTop: 12 },
  sub: { fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  btn: { alignSelf: 'stretch' },
});
