import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, updateDoc } from '@react-native-firebase/firestore';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
  Event,
  EventType,
  Notification,
  RepeatFrequency,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';

import { formatDue, formatTime, nextTimeOfDay, nextWeekday } from '../lib/dates';
import { staleIdeas } from '../lib/ideas';
import {
  channelIdFor,
  diffReminders,
  planAllReminders,
  PlannedReminder,
  reminderSignature,
  snoozeUntil,
} from '../lib/reminders';
import { AppSettings, Idea, Priority, PRIORITIES, Task } from '../lib/types';
import { db, paths } from './firebase';

const SCHEDULED_KEY = 'reminders:scheduled:v1';
const PLAN_DAY_ID = 'plan-your-day';
const IDEA_REVISIT_ID = 'idea-revisit';
const GENERAL_CHANNEL = 'general';

const PRIORITY_TITLE: Record<Priority, string> = {
  high: '⏰ High priority',
  medium: 'Reminder',
  low: 'Reminder',
};

export async function requestNotificationPermission(): Promise<boolean> {
  const s = await notifee.requestPermission();
  return s.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

/**
 * One Android channel per priority + sound/vibration combination. Channel sound
 * and importance are immutable once created, so changing the settings switches
 * to a differently-named channel.
 */
export async function ensureChannels(settings: AppSettings): Promise<void> {
  for (const p of PRIORITIES) {
    const s = settings.reminders[p];
    const silent = s.sound === 'silent';
    await notifee.createChannel({
      id: channelIdFor(p, s),
      name: `${p[0].toUpperCase()}${p.slice(1)} priority reminders${silent ? ' (silent)' : ''}`,
      importance: p === 'high' ? AndroidImportance.HIGH : silent ? AndroidImportance.LOW : AndroidImportance.DEFAULT,
      sound: silent ? undefined : 'default',
      vibration: s.vibrate,
      vibrationPattern: s.vibrate ? (p === 'high' ? [300, 600, 300, 600] : [250, 250]) : undefined,
      visibility: AndroidVisibility.PUBLIC,
      bypassDnd: p === 'high',
    });
  }
  await notifee.createChannel({ id: GENERAL_CHANNEL, name: 'Planning & ideas', importance: AndroidImportance.DEFAULT });
}

function reminderNotification(r: Pick<PlannedReminder, 'id' | 'taskId' | 'workspaceId' | 'priority' | 'channelId' | 'title'>, body: string): Notification {
  const data = { kind: 'reminder', taskId: r.taskId, workspaceId: r.workspaceId, priority: r.priority };
  const high = r.priority === 'high';
  return {
    id: r.id,
    title: `${PRIORITY_TITLE[r.priority]}: ${r.title || 'Task'}`,
    body,
    data,
    android: {
      channelId: r.channelId,
      pressAction: { id: 'default', launchActivity: 'default' },
      // High priority behaves like an alarm: full-screen, persistent until dismissed or snoozed.
      ...(high
        ? {
            category: AndroidCategory.ALARM,
            fullScreenAction: { id: 'default', launchActivity: 'default' },
            ongoing: true,
            autoCancel: false,
            loopSound: true,
            lightUpScreen: true,
          }
        : {}),
      actions: [
        { title: 'Mark done', pressAction: { id: 'done' } },
        { title: 'Snooze 15m', pressAction: { id: 'snooze-15' } },
        high
          ? { title: 'Dismiss', pressAction: { id: 'dismiss' } }
          : { title: 'Snooze 1h', pressAction: { id: 'snooze-60' } },
      ],
    },
  };
}

async function loadScheduled(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SCHEDULED_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

let reconcileChain: Promise<void> = Promise.resolve();

/**
 * Bring scheduled reminders in line with the tasks this user should be reminded
 * about (assigned to them, or unassigned tasks they created) across workspaces.
 */
export function reconcileReminders(tasks: readonly Task[], settings: AppSettings, uid: string): Promise<void> {
  reconcileChain = reconcileChain
    .then(async () => {
      const now = Date.now();
      const desired = planAllReminders(tasks, settings.reminders, now, uid);
      const scheduled = await loadScheduled();
      const { toCancel, toSchedule } = diffReminders(scheduled, desired);
      for (const id of toCancel) {
        await notifee.cancelTriggerNotification(id);
        delete scheduled[id];
      }
      for (const r of toSchedule) {
        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: r.fireAt,
          alarmManager: { allowWhileIdle: true },
        };
        const dueAt = r.fireAt + r.leadMinutes * 60_000;
        const body = r.leadMinutes === 0 ? 'Due now' : `Due ${formatDue(dueAt, r.fireAt)}`;
        await notifee.createTriggerNotification(reminderNotification(r, body), trigger);
        scheduled[r.id] = reminderSignature(r);
      }
      await AsyncStorage.setItem(SCHEDULED_KEY, JSON.stringify(scheduled));
    })
    .catch((e) => console.warn('[reminders] reconcile failed', e));
  return reconcileChain;
}

export async function snoozeReminder(
  data: { taskId: string; workspaceId: string; priority: Priority; title: string },
  minutes: number,
  settings: AppSettings,
): Promise<void> {
  const fireAt = snoozeUntil(Date.now(), minutes);
  await notifee.createTriggerNotification(
    reminderNotification(
      {
        id: `${data.taskId}:snooze`,
        taskId: data.taskId,
        workspaceId: data.workspaceId,
        priority: data.priority,
        channelId: channelIdFor(data.priority, settings.reminders[data.priority]),
        title: data.title,
      },
      `Snoozed reminder (${formatTime(fireAt)})`,
    ),
    { type: TriggerType.TIMESTAMP, timestamp: fireAt, alarmManager: { allowWhileIdle: true } },
  );
}

export async function markTaskDone(workspaceId: string, taskId: string): Promise<void> {
  const now = Date.now();
  const ids = (await notifee.getTriggerNotificationIds()).filter((id) => id.startsWith(`${taskId}:`));
  if (ids.length) await notifee.cancelTriggerNotifications(ids);
  await updateDoc(doc(db(), paths.tasks(workspaceId), taskId), {
    status: 'done',
    completedAt: now,
    updatedAt: now,
  }).catch((e) => console.warn('[reminders] mark done failed', e));
}

async function settingsForBackground(): Promise<AppSettings> {
  const { loadSettings } = await import('./settingsStore');
  return loadSettings();
}

/** Handles notification button presses in both foreground and background (headless) contexts. */
export async function handleNotificationEvent({ type, detail }: Event): Promise<void> {
  const n = detail.notification;
  const data = n?.data as { kind?: string; taskId?: string; workspaceId?: string; priority?: Priority } | undefined;
  if (type !== EventType.ACTION_PRESS || !n?.id || data?.kind !== 'reminder' || !data.taskId || !data.workspaceId) {
    return;
  }
  const actionId = detail.pressAction?.id;
  await notifee.cancelNotification(n.id);
  if (actionId === 'done') {
    await markTaskDone(data.workspaceId, data.taskId);
  } else if (actionId?.startsWith('snooze-')) {
    const minutes = Number(actionId.slice('snooze-'.length));
    const title = (n.title ?? '').replace(/^[^:]*:\s*/, '');
    await snoozeReminder(
      { taskId: data.taskId, workspaceId: data.workspaceId, priority: data.priority ?? 'medium', title },
      minutes,
      await settingsForBackground(),
    );
  }
}

export async function scheduleMorningPlan(settings: AppSettings): Promise<void> {
  await notifee.cancelTriggerNotification(PLAN_DAY_ID);
  if (!settings.morningPlan.enabled) return;
  const { hour, minute } = settings.morningPlan;
  await notifee.createTriggerNotification(
    {
      id: PLAN_DAY_ID,
      title: '☀️ Plan your day',
      body: 'Pick what you want to get done today.',
      data: { kind: 'plan-day' },
      android: { channelId: GENERAL_CHANNEL, pressAction: { id: 'default', launchActivity: 'default' } },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: nextTimeOfDay(Date.now(), hour, minute),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: { allowWhileIdle: true },
    },
  );
}

/** Weekly nudge listing ideas not edited in N days. Re-run whenever ideas or settings change. */
export async function scheduleIdeaRevisit(ideas: readonly Idea[], settings: AppSettings): Promise<void> {
  await notifee.cancelTriggerNotification(IDEA_REVISIT_ID);
  const { enabled, staleDays, weekday, hour } = settings.ideaRevisit;
  if (!enabled) return;
  const fireAt = nextWeekday(Date.now(), weekday, hour);
  const stale = staleIdeas(ideas, staleDays, fireAt);
  if (stale.length === 0) return;
  const names = stale.slice(0, 3).map((i) => i.title).join(', ');
  await notifee.createTriggerNotification(
    {
      id: IDEA_REVISIT_ID,
      title: `💭 ${stale.length} idea${stale.length === 1 ? '' : 's'} to revisit`,
      body: `Not edited in ${staleDays}+ days: ${names}${stale.length > 3 ? '…' : ''}`,
      data: { kind: 'ideas' },
      android: { channelId: GENERAL_CHANNEL, pressAction: { id: 'default', launchActivity: 'default' } },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: fireAt,
      repeatFrequency: RepeatFrequency.WEEKLY,
      alarmManager: { allowWhileIdle: true },
    },
  );
}

/** Where a tapped notification should take the user. */
export function routeForNotification(n: Notification | undefined): string | null {
  const data = n?.data as { kind?: string; taskId?: string; workspaceId?: string } | undefined;
  if (!data) return null;
  if (data.kind === 'reminder' && data.taskId && data.workspaceId) {
    return `/reminder/${data.taskId}?ws=${data.workspaceId}`;
  }
  if (data.kind === 'plan-day') return '/my-day';
  if (data.kind === 'ideas') return '/ideas';
  return null;
}

export async function initialNotificationRoute(): Promise<string | null> {
  const initial = await notifee.getInitialNotification();
  return routeForNotification(initial?.notification);
}

export function onForegroundNotification(navigate: (route: string) => void): () => void {
  return notifee.onForegroundEvent(async (event) => {
    if (event.type === EventType.PRESS) {
      const route = routeForNotification(event.detail.notification);
      if (route) navigate(route);
      return;
    }
    await handleNotificationEvent(event);
  });
}

export async function cancelReminderNotification(taskId: string): Promise<void> {
  const displayed = await notifee.getDisplayedNotifications();
  for (const d of displayed) {
    if (d.id?.startsWith(`${taskId}:`)) await notifee.cancelNotification(d.id);
  }
}
