import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { formatDateTime } from '../../lib/dates';
import { restoreVersion, versionHistory } from '../../lib/ideas';
import { saveIdea } from '../../services/repo';
import { useTheme } from '../../theme';

export default function IdeaHistoryScreen() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ideas } = useData();
  const idea = ideas.find((i) => i.id === id);
  if (!idea) return <EmptyState emoji="💭" title="Idea not found" />;
  const history = versionHistory(idea);

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 12 }}
      data={history}
      keyExtractor={(v) => v.id}
      renderItem={({ item, index }) => (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.row}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>
              {formatDateTime(item.savedAt)}
              {index === 0 ? ' · current' : ''}
            </Text>
            {index > 0 ? (
              <Button
                small
                variant="ghost"
                title="Restore"
                onPress={() => {
                  saveIdea(restoreVersion(idea, item.id, Date.now()));
                  router.back();
                }}
              />
            ) : null}
          </View>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{item.title}</Text>
          {item.notes ? <Text style={{ color: c.text, marginTop: 4 }}>{item.notes}</Text> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 30 },
});
