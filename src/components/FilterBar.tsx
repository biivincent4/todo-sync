import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { DUE_FILTER_LABEL, DueFilter, TaskFilter } from '../lib/filter';
import { SORT_LABEL } from '../lib/sort';
import { SortMode, TaskList } from '../lib/types';
import { useTheme } from '../theme';
import { Chip, ChipRow, OptionSheet } from './ui';

const DUE_OPTIONS: DueFilter[] = ['all', 'overdue', 'today', 'upcoming', 'none'];
const SORT_OPTIONS: SortMode[] = ['due', 'priority', 'created', 'manual'];

export function FilterBar({
  filter,
  onChange,
  sortMode,
  onSortChange,
  showAssignee,
  lists,
  listId,
  onListChange,
}: {
  filter: TaskFilter;
  onChange: (f: TaskFilter) => void;
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
  showAssignee?: boolean;
  lists?: TaskList[];
  listId?: string;
  onListChange?: (id: string) => void;
}) {
  const c = useTheme();
  const [sheet, setSheet] = useState<'due' | 'sort' | 'list' | null>(null);
  const currentList = lists?.find((l) => l.id === listId);

  return (
    <View style={{ backgroundColor: c.bg }}>
      <View style={styles.searchRow}>
        <TextInput
          value={filter.query}
          onChangeText={(query) => onChange({ ...filter, query })}
          placeholder="Search tasks"
          placeholderTextColor={c.textMuted}
          style={[styles.search, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <ChipRow>
        <Chip label={`↕ ${SORT_LABEL[sortMode]}`} onPress={() => setSheet('sort')} />
        <Chip
          label={filter.due === 'all' ? '📅 Due' : `📅 ${DUE_FILTER_LABEL[filter.due]}`}
          selected={filter.due !== 'all'}
          onPress={() => setSheet('due')}
        />
        {lists && onListChange ? (
          <Chip
            label={currentList ? `🗂 ${currentList.name}` : '🗂 All lists'}
            selected={!!currentList}
            onPress={() => setSheet('list')}
          />
        ) : null}
        {showAssignee ? (
          <Chip
            label="👤 Assigned to me"
            selected={filter.assignedToMe}
            onPress={() => onChange({ ...filter, assignedToMe: !filter.assignedToMe })}
          />
        ) : null}
      </ChipRow>
      <OptionSheet
        visible={sheet === 'sort'}
        title="Sort columns by"
        onClose={() => setSheet(null)}
        options={SORT_OPTIONS.map((m) => ({
          label: m === 'manual' ? `${SORT_LABEL[m]} (drag to reorder)` : SORT_LABEL[m],
          selected: m === sortMode,
          onPress: () => onSortChange(m),
        }))}
      />
      <OptionSheet
        visible={sheet === 'due'}
        title="Due date"
        onClose={() => setSheet(null)}
        options={DUE_OPTIONS.map((d) => ({
          label: DUE_FILTER_LABEL[d],
          selected: d === filter.due,
          onPress: () => onChange({ ...filter, due: d }),
        }))}
      />
      <OptionSheet
        visible={sheet === 'list'}
        title="List"
        onClose={() => setSheet(null)}
        options={[
          { label: 'All lists', selected: !currentList, onPress: () => onListChange?.('all') },
          ...(lists ?? []).map((l) => ({
            label: l.name,
            selected: l.id === listId,
            onPress: () => onListChange?.(l.id),
          })),
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { paddingHorizontal: 12, paddingTop: 8 },
  search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
});
