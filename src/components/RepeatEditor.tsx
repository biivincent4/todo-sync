import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { formatMinutes, parseTimes, RepeatEnd, RepeatFreq, RepeatRule } from '../lib/recurrence';
import { useTheme } from '../theme';
import { DateTimeField } from './DateTimeField';
import { Chip, Label } from './ui';

export type RepeatDraft = Omit<RepeatRule, 'anchor'>;

type Preset = 'none' | 'hourly' | 'times' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'none', label: 'Never' },
  { id: 'hourly', label: 'Every N hours' },
  { id: 'times', label: 'Times a day' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const UNIT: Record<RepeatFreq, string> = { hourly: 'hours', daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' };

function presetOf(r: RepeatDraft | null): Preset {
  if (!r) return 'none';
  if (r.freq === 'daily' && r.times?.length) return 'times';
  if (r.freq === 'weekly' && (r.weekdays?.length ?? 0) > 1) return 'weekdays';
  return r.freq;
}

function draftFor(p: Preset, prev: RepeatDraft | null, dueAt: number | null): RepeatDraft | null {
  const end: RepeatEnd = prev?.end ?? { type: 'never' };
  const day = new Date(dueAt ?? Date.now()).getDay();
  switch (p) {
    case 'none':
      return null;
    case 'hourly':
      return { freq: 'hourly', interval: 1, window: null, end };
    case 'times':
      return { freq: 'daily', interval: 1, times: [8 * 60, 13 * 60, 18 * 60], end };
    case 'daily':
      return { freq: 'daily', interval: 1, end };
    case 'weekdays':
      return { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], end };
    case 'weekly':
      return { freq: 'weekly', interval: 1, weekdays: [day], end };
    default:
      return { freq: p, interval: 1, end };
  }
}

/** Editor for a task's repeat rule (the anchor comes from the task's due date). */
export function RepeatEditor({
  value,
  dueAt,
  onChange,
}: {
  value: RepeatDraft | null;
  dueAt: number | null;
  onChange: (next: RepeatDraft | null) => void;
}) {
  const c = useTheme();
  const preset = presetOf(value);
  const [timesText, setTimesText] = useState(value?.times?.map(formatMinutes).join(', ') ?? '08:00, 13:00, 18:00');
  const [windowText, setWindowText] = useState(
    value?.window ? `${formatMinutes(value.window.start)}-${formatMinutes(value.window.end)}` : '',
  );

  const set = (patch: Partial<RepeatDraft>) => value && onChange({ ...value, ...patch });
  const inputStyle = [styles.input, { borderColor: c.border, color: c.text, backgroundColor: c.surface }];

  return (
    <View style={{ marginBottom: 12 }}>
      <Label>Repeat</Label>
      <View style={styles.wrap}>
        {PRESETS.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            selected={preset === p.id}
            onPress={() => {
              const next = draftFor(p.id, value, dueAt);
              if (next?.times) setTimesText(next.times.map(formatMinutes).join(', '));
              onChange(next);
            }}
            style={{ marginBottom: 6 }}
          />
        ))}
      </View>

      {value ? (
        <>
          {preset !== 'times' && preset !== 'weekdays' ? (
            <View style={styles.row}>
              <Text style={{ color: c.text }}>Every</Text>
              <TextInput
                keyboardType="number-pad"
                value={String(value.interval)}
                onChangeText={(t) => set({ interval: Math.max(1, Math.min(999, Number(t.replace(/\D/g, '')) || 1)) })}
                style={[inputStyle, { width: 64, textAlign: 'center' }]}
              />
              <Text style={{ color: c.text }}>{UNIT[value.freq]}</Text>
            </View>
          ) : null}

          {preset === 'hourly' ? (
            <View style={styles.row}>
              <Text style={{ color: c.text }}>Only between</Text>
              <TextInput
                value={windowText}
                placeholder="08:00-20:00 (optional)"
                placeholderTextColor={c.textMuted}
                onChangeText={(t) => {
                  setWindowText(t);
                  const m = /^\s*(\S+)\s*-\s*(\S+)\s*$/.exec(t);
                  const a = m && parseTimes(m[1]);
                  const b = m && parseTimes(m[2]);
                  set({ window: a && b && a[0] < b[0] ? { start: a[0], end: b[0] } : null });
                }}
                style={[inputStyle, { flex: 1 }]}
              />
            </View>
          ) : null}

          {preset === 'times' ? (
            <View style={styles.row}>
              <Text style={{ color: c.text }}>At</Text>
              <TextInput
                value={timesText}
                placeholder="08:00, 13:00, 18:00"
                placeholderTextColor={c.textMuted}
                onChangeText={(t) => {
                  setTimesText(t);
                  const times = parseTimes(t);
                  if (times) set({ times });
                }}
                style={[inputStyle, { flex: 1 }]}
              />
            </View>
          ) : null}

          {value.freq === 'weekly' ? (
            <View style={[styles.wrap, { marginTop: 6 }]}>
              {WEEKDAYS.map((d) => {
                const on = value.weekdays?.includes(d) ?? false;
                return (
                  <Chip
                    key={d}
                    label={WEEKDAY_LABEL[d]}
                    selected={on}
                    onPress={() => {
                      const cur = value.weekdays ?? [];
                      const next = on ? cur.filter((x) => x !== d) : [...cur, d];
                      if (next.length) set({ weekdays: next });
                    }}
                    style={{ marginBottom: 6 }}
                  />
                );
              })}
            </View>
          ) : null}

          <Text style={[styles.sub, { color: c.textMuted }]}>Ends</Text>
          <View style={styles.wrap}>
            <Chip label="Never" selected={value.end.type === 'never'} onPress={() => set({ end: { type: 'never' } })} />
            <Chip
              label="On a date"
              selected={value.end.type === 'until'}
              onPress={() => set({ end: { type: 'until', until: (dueAt ?? Date.now()) + 30 * 86_400_000 } })}
            />
            <Chip
              label="After N times"
              selected={value.end.type === 'count'}
              onPress={() => set({ end: { type: 'count', count: 10 } })}
            />
          </View>
          {value.end.type === 'until' ? (
            <DateTimeField
              label="Last date"
              value={value.end.until}
              onChange={(ms) => set({ end: ms == null ? { type: 'never' } : { type: 'until', until: ms } })}
            />
          ) : null}
          {value.end.type === 'count' ? (
            <View style={styles.row}>
              <Text style={{ color: c.text }}>After</Text>
              <TextInput
                keyboardType="number-pad"
                value={String(value.end.count)}
                onChangeText={(t) => set({ end: { type: 'count', count: Math.max(1, Number(t.replace(/\D/g, '')) || 1) } })}
                style={[inputStyle, { width: 64, textAlign: 'center' }]}
              />
              <Text style={{ color: c.text }}>times</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  sub: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
});
