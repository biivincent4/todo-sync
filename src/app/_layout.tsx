import { ErrorBoundaryProps, router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SignInScreen } from '../components/SignInScreen';
import { LoadingState } from '../components/ui';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { DataProvider } from '../context/DataContext';
import { SettingsProvider } from '../context/SettingsContext';
import { WorkspaceProvider } from '../context/WorkspaceContext';
import { initialNotificationRoute, onForegroundNotification } from '../services/notifications';
import { useTheme } from '../theme';

/** Shown instead of closing the app when rendering throws. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const c = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
      <Text style={{ fontSize: 40 }}>⚠️</Text>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', marginVertical: 8 }}>Something went wrong</Text>
      <Text style={{ color: c.textMuted, marginBottom: 16 }} selectable>
        {error.message}
      </Text>
      <Text onPress={retry} style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>
        Try again
      </Text>
    </ScrollView>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsProvider>
            <Gate />
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Gate() {
  const { user, initializing } = useAuth();
  const c = useTheme();

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <LoadingState label="Starting…" />
      </View>
    );
  }
  if (!user) return <SignInScreen />;
  return (
    <WorkspaceProvider key={user.uid}>
      <DataProvider>
        <AppStack />
      </DataProvider>
    </WorkspaceProvider>
  );
}

function AppStack() {
  const c = useTheme();

  useEffect(() => {
    // Opened from a notification (including the full-screen high-priority alarm).
    initialNotificationRoute().then((route) => route && router.push(route as never));
    return onForegroundNotification((route) => router.push(route as never));
  }, []);

  return (
    <>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.text,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ title: 'Task', presentation: 'modal' }} />
        <Stack.Screen name="idea/[id]" options={{ title: 'Idea' }} />
        <Stack.Screen name="idea-history/[id]" options={{ title: 'Version history' }} />
        <Stack.Screen name="deliverable/[id]" options={{ title: 'Deliverable' }} />
        <Stack.Screen name="workspaces" options={{ title: 'Workspaces' }} />
        <Stack.Screen name="workspace/[id]" options={{ title: 'Organization' }} />
        <Stack.Screen name="join" options={{ title: 'Join organization' }} />
        <Stack.Screen name="reminder/[taskId]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}
