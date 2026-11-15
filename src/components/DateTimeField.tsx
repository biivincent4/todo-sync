import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatDateTime } from '../lib/dates';
import { Button, Label } from './ui';

/** Android date + time picker (two native dialogs in sequence). */
export function DateTimeField({
  label = 'Due',
  value,
  onChange,
}: {
  label?: string;
  value: number | null;
  onChange: (ms: number | null) => void;
}) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const [draft, setDraft] = useState<Date>(() => new Date(value ?? defaultDue()));

  const onPick = (e: DateTimePickerEvent, d?: Date) => {
    if (e.type !== 'set' || !d) {
      setMode(null);
      return;
    }
    if (mode === 'date') {
      const next = new Date(draft);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      setDraft(next);
      setMode('time');
    } else {
      const next = new Date(draft);
      next.setHours(d.getHours(), d.getMinutes(), 0, 0);
      setMode(null);
      onChange(next.getTime());
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title={value != null ? formatDateTime(value) : 'No date'}
          variant="secondary"
          onPress={() => {
            setDraft(new Date(value ?? defaultDue()));
            setMode('date');
          }}
          style={{ flex: 1 }}
        />
        {value != null ? <Button title="Clear" variant="ghost" onPress={() => onChange(null)} /> : null}
      </View>
      {mode ? <DateTimePicker value={draft} mode={mode} is24Hour onChange={onPick} /> : null}
    </View>
  );
}

function defaultDue(): number {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.getTime();
}
