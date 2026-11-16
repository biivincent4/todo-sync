import { router } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  FlatList,
  GestureDetector,
  RefreshControl,
  ScrollView,
  usePanGesture,
} from 'react-native-gesture-handler';

import { useUser } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useNow } from '../hooks/useNow';
import { dayKey } from '../lib/dates';
import { EMPTY_FILTER, filterTasks, isFilterActive, TaskFilter } from '../lib/filter';
import { isInMyDay } from '../lib/myDay';
import { canReorderWithinColumn, orderForDrop, sortTasks } from '../lib/sort';
import { Status, STATUS_LABEL, STATUSES, Task } from '../lib/types';
import { deleteTask, moveTask, setInMyDay, skipOccurrence } from '../services/repo';
import { useTheme } from '../theme';
import { FilterBar } from './FilterBar';
import { TaskCard } from './TaskCard';
import { EmptyState, OptionSheet, SheetOption } from './ui';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  task: Task;
  fromStatus: Status;
}

type ViewRef = React.ComponentRef<typeof View>;

const EDGE = 36;
const EDGE_DELAY = 550;

export interface KanbanBoardProps {
  tasks: Task[];
  /** Rendered above the column tabs (e.g. progress, suggestions). */
  header?: React.ReactNode;
  /** Query params for the "new task" screen. */
  newTaskParams?: Record<string, string>;
  emptyMessage?: string;
  /** Show the workspace name on cards from other workspaces (cross-workspace My Day). */
  showWorkspace?: boolean;
  /** Offer a list filter (boards that span lists). */
  listFilter?: boolean;
}

export function KanbanBoard({
  tasks,
  header,
  newTaskParams,
  emptyMessage = 'Tap + to add a task.',
  showWorkspace,
  listFilter,
}: KanbanBoardProps) {
  const c = useTheme();
  const user = useUser();
  const { width } = useWindowDimensions();
  const { settings, update } = useSettings();
  const { lists, refresh } = useData();
  const { workspaces, active } = useWorkspace();
  const sortMode = settings.sortMode;

  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [listId, setListId] = useState<string | 'all'>('all');
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [menuTask, setMenuTask] = useState<Task | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const now = useNow();

  const pager = useRef<FlatList<Status>>(null);
  const rootRef = useRef<ViewRef>(null);
  const tabRefs = useRef<(ViewRef | null)[]>([]);
  const listRefs = useRef<(ViewRef | null)[]>([]);
  const geometry = useRef<{ root: Rect; tabs: Rect[]; lists: Rect[] } | null>(null);
  const cardLayouts = useRef<Record<Status, Record<string, { y: number; height: number }>>>({
    todo: {},
    doing: {},
    done: {},
  });
  const scrollY = useRef<Record<Status, number>>({ todo: 0, doing: 0, done: 0 });
  const pageRef = useRef(0);
  const edgeSince = useRef<{ side: -1 | 1; at: number } | null>(null);
  const [dragPos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [hoverTab, setHoverTab] = useState<number | null>(null);

  const listName = useCallback((id: string) => lists.find((l) => l.id === id)?.name, [lists]);
  const workspaceById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces]);

  const columns = useMemo(() => {
    const visible = filterTasks(tasks, filter, {
      now,
      uid: user.uid,
      listId: listId === 'all' ? undefined : listId,
    });
    const by: Record<Status, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of visible) by[t.status].push(t);
    for (const s of STATUSES) by[s] = sortTasks(by[s], sortMode);
    return by;
  }, [tasks, filter, now, user.uid, listId, sortMode]);

  const goToPage = useCallback((i: number) => {
    const idx = Math.max(0, Math.min(STATUSES.length - 1, i));
    pageRef.current = idx;
    setPage(idx);
    pager.current?.scrollToIndex({ index: idx, animated: true });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // ---------- drag & drop ----------

  const measure = (v: ViewRef | null) =>
    new Promise<Rect>((resolve) => {
      if (!v) return resolve({ x: 0, y: 0, width: 0, height: 0 });
      v.measureInWindow((x, y, w, h) => resolve({ x, y, width: w, height: h }));
    });

  const beginDrag = useCallback(
    async (task: Task, x: number, y: number) => {
      const [root, tabs, listRects] = await Promise.all([
        measure(rootRef.current),
        Promise.all(STATUSES.map((_, i) => measure(tabRefs.current[i]))),
        Promise.all(STATUSES.map((_, i) => measure(listRefs.current[i]))),
      ]);
      geometry.current = { root, tabs, lists: listRects };
      dragPos.setValue({ x: x - root.x, y: y - root.y });
      setDrag({ task, fromStatus: task.status });
    },
    [dragPos],
  );

  const tabAt = (x: number, y: number) =>
    geometry.current?.tabs.findIndex((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) ?? -1;

  const updateDrag = useCallback(
    (x: number, y: number) => {
      const g = geometry.current;
      if (!g) return;
      dragPos.setValue({ x: x - g.root.x, y: y - g.root.y });
      const t = tabAt(x, y);
      setHoverTab(t >= 0 ? t : null);
      // Hold near a screen edge to page to the neighbouring column.
      const side: -1 | 1 | 0 = x < EDGE ? -1 : x > width - EDGE ? 1 : 0;
      if (side === 0) {
        edgeSince.current = null;
      } else if (!edgeSince.current || edgeSince.current.side !== side) {
        edgeSince.current = { side, at: Date.now() };
      } else if (Date.now() - edgeSince.current.at > EDGE_DELAY) {
        goToPage(pageRef.current + side);
        edgeSince.current = { side, at: Date.now() };
      }
    },
    [dragPos, goToPage, width],
  );

  const dropIndex = (status: Status, absY: number, taskId: string) => {
    const g = geometry.current;
    if (!g) return 0;
    const listTop = g.lists[STATUSES.indexOf(status)]?.y ?? 0;
    const contentY = absY - listTop + scrollY.current[status];
    const layouts = cardLayouts.current[status];
    return columns[status].filter((t) => t.id !== taskId && layouts[t.id] && layouts[t.id].y + layouts[t.id].height / 2 < contentY)
      .length;
  };

  const endDrag = useCallback(
    (x: number, y: number, cancelled: boolean) => {
      const d = drag;
      setDrag(null);
      setHoverTab(null);
      edgeSince.current = null;
      if (!d || cancelled) return;
      const tab = tabAt(x, y);
      const target: Status = tab >= 0 ? STATUSES[tab] : STATUSES[pageRef.current];
      const col = columns[target];
      if (tab < 0 && canReorderWithinColumn(sortMode)) {
        // Dropped into a column body: place at the drop position.
        moveTask(d.task, target, orderForDrop(col, d.task.id, dropIndex(target, y, d.task.id)));
      } else if (target !== d.task.status) {
        // Between columns always works; in non-manual sorts the column re-sorts itself.
        moveTask(d.task, target, orderForDrop(col, d.task.id, col.length));
      }
      if (tab >= 0) goToPage(tab);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drag, columns, sortMode, goToPage],
  );

  // ---------- menu ----------

  const today = dayKey(now);
  const menuOptions: SheetOption[] = menuTask
    ? [
        ...STATUSES.filter((s) => s !== menuTask.status).map((s) => ({
          label: `Move to ${STATUS_LABEL[s]}`,
          onPress: () => moveTask(menuTask, s, orderForDrop(columns[s], menuTask.id, columns[s].length)),
        })),
        isInMyDay(menuTask, user.uid, today)
          ? { label: 'Remove from My Day', onPress: () => setInMyDay(menuTask, user.uid, false) }
          : { label: 'Add to My Day ☀️', onPress: () => setInMyDay(menuTask, user.uid, true) },
        ...(menuTask.series && menuTask.status !== 'done'
          ? [{ label: '⏭ Skip this occurrence', onPress: () => skipOccurrence(menuTask) }]
          : []),
        { label: 'Edit', onPress: () => router.push(`/task/${menuTask.id}?ws=${menuTask.workspaceId}`) },
        { label: 'Delete', destructive: true, onPress: () => deleteTask(menuTask) },
      ]
    : [];

  const counts = STATUSES.map((s) => columns[s].length);
  const totalVisible = counts.reduce((a, b) => a + b, 0);

  return (
    <View ref={rootRef} style={{ flex: 1, backgroundColor: c.bg }} collapsable={false}>
      {header}
      <FilterBar
        filter={filter}
        onChange={setFilter}
        sortMode={sortMode}
        onSortChange={(m) => update({ sortMode: m })}
        showAssignee={active?.type === 'org' || showWorkspace}
        lists={listFilter ? lists : undefined}
        listId={listId}
        onListChange={setListId}
      />
      <View style={[styles.tabs, { borderColor: c.border }]}>
        {STATUSES.map((s, i) => (
          <View
            key={s}
            ref={(r) => {
              tabRefs.current[i] = r;
            }}
            collapsable={false}
            style={{ flex: 1 }}
          >
            <Text
              onPress={() => goToPage(i)}
              style={[
                styles.tab,
                {
                  color: page === i ? c.primary : c.textMuted,
                  borderBottomColor: page === i ? c.primary : 'transparent',
                  backgroundColor: hoverTab === i ? c.primary + '22' : 'transparent',
                },
              ]}
            >
              {STATUS_LABEL[s]} ({counts[i]})
            </Text>
          </View>
        ))}
      </View>
      <FlatList
        ref={pager}
        data={STATUSES}
        keyExtractor={(s) => s}
        horizontal
        pagingEnabled
        scrollEnabled={!drag}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          pageRef.current = i;
          setPage(i);
        }}
        renderItem={({ item: status, index }) => (
          <View
            style={{ width }}
            ref={(r) => {
              listRefs.current[index] = r;
            }}
            collapsable={false}
          >
            <ScrollView
              scrollEnabled={!drag}
              onScroll={(e) => {
                scrollY.current[status] = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={32}
              contentContainerStyle={{ padding: 12, paddingBottom: 96, flexGrow: 1 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {columns[status].length === 0 ? (
                <EmptyState
                  emoji={status === 'done' ? '🎉' : status === 'doing' ? '🚧' : '📝'}
                  title={
                    isFilterActive(filter)
                      ? 'No matching tasks'
                      : totalVisible === 0
                        ? 'Nothing here yet'
                        : `Nothing in ${STATUS_LABEL[status]}`
                  }
                  message={isFilterActive(filter) ? 'Try clearing the filters.' : emptyMessage}
                />
              ) : (
                columns[status].map((task) => (
                  <View
                    key={`${task.workspaceId}/${task.id}`}
                    onLayout={(e) => {
                      cardLayouts.current[status][task.id] = {
                        y: e.nativeEvent.layout.y,
                        height: e.nativeEvent.layout.height,
                      };
                    }}
                  >
                    <DraggableCard
                      task={task}
                      onDragStart={beginDrag}
                      onDragMove={updateDrag}
                      onDragEnd={endDrag}
                    >
                      <TaskCard
                        task={task}
                        now={now}
                        faded={drag?.task.id === task.id}
                        listName={listName(task.listId)}
                        workspaceName={
                          showWorkspace && task.workspaceId !== active?.id
                            ? workspaceById.get(task.workspaceId)?.name
                            : undefined
                        }
                        assignee={
                          task.assigneeId
                            ? workspaceById.get(task.workspaceId)?.memberProfiles[task.assigneeId]
                            : null
                        }
                        onPress={() => router.push(`/task/${task.id}?ws=${task.workspaceId}`)}
                        onMenu={() => setMenuTask(task)}
                      />
                    </DraggableCard>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}
      />
      {drag ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragOverlay,
            { width: width - 48, transform: [{ translateX: Animated.subtract(dragPos.x, (width - 48) / 2) }, { translateY: Animated.subtract(dragPos.y, 30) }] },
          ]}
        >
          <TaskCard task={drag.task} listName={listName(drag.task.listId)} now={now} />
        </Animated.View>
      ) : null}
      <Text
        accessibilityRole="button"
        accessibilityLabel="Add task"
        onPress={() =>
          router.push({ pathname: '/task/[id]', params: { id: 'new', status: STATUSES[page], ...newTaskParams } })
        }
        style={[styles.fab, { backgroundColor: c.primary, color: c.primaryText }]}
      >
        +
      </Text>
      <OptionSheet
        visible={!!menuTask}
        title={menuTask?.title}
        options={menuOptions}
        onClose={() => setMenuTask(null)}
      />
    </View>
  );
}

/** Long-press to pick a card up; then drag it to a column tab, screen edge, or position. */
function DraggableCard({
  task,
  children,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  task: Task;
  children: React.ReactNode;
  onDragStart: (t: Task, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number, cancelled: boolean) => void;
}) {
  const last = useRef({ x: 0, y: 0 });
  const gesture = usePanGesture({
    activateAfterLongPress: 350,
    runOnJS: true,
    onActivate: (e) => {
      last.current = { x: e.absoluteX, y: e.absoluteY };
      onDragStart(task, e.absoluteX, e.absoluteY);
    },
    onUpdate: (e) => {
      last.current = { x: e.absoluteX, y: e.absoluteY };
      onDragMove(e.absoluteX, e.absoluteY);
    },
    onDeactivate: (e) => {
      onDragEnd(e.absoluteX ?? last.current.x, e.absoluteY ?? last.current.y, false);
    },
  });
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    textAlign: 'center',
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    borderBottomWidth: 2,
  },
  dragOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 30,
    lineHeight: 56,
    elevation: 6,
    overflow: 'hidden',
  },
});
