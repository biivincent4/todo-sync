import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { WorkspaceHeader } from '../../components/WorkspaceHeader';
import { useTheme } from '../../theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        header: ({ options, route }) => <WorkspaceHeader title={options.title ?? route.name} />,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="my-day" options={{ title: 'My Day', tabBarIcon: icon('☀️') }} />
      <Tabs.Screen name="index" options={{ title: 'Board', tabBarIcon: icon('🗂️') }} />
      <Tabs.Screen name="deliverables" options={{ title: 'Deliverables', tabBarIcon: icon('🎯') }} />
      <Tabs.Screen name="ideas" options={{ title: 'Ideas', tabBarIcon: icon('💡') }} />
      <Tabs.Screen name="lists" options={{ title: 'Lists', tabBarIcon: icon('📋') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
