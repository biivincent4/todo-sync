import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { initials } from '../lib/permissions';
import { MemberProfile } from '../lib/types';
import { useTheme } from '../theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useTheme();
  const bg =
    variant === 'primary' ? c.primary : variant === 'danger' ? c.danger : variant === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? c.primaryText : variant === 'danger' ? '#fff' : variant === 'ghost' ? c.primary : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  onLongPress,
  color,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? (color ?? c.primary) : c.surfaceAlt,
          borderColor: selected ? (color ?? c.primary) : c.border,
        },
        style,
      ]}
    >
      <Text numberOfLines={1} style={{ color: selected ? '#fff' : c.text, fontSize: 13, fontWeight: '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {children}
    </ScrollView>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const c = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.textMuted}
        {...props}
        style={[
          styles.input,
          { backgroundColor: c.surface, borderColor: c.border, color: c.text },
          props.multiline && { minHeight: 90, textAlignVertical: 'top' },
          props.style,
        ]}
      />
    </View>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.label, { color: c.textMuted }]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

export function EmptyState({
  emoji,
  title,
  message,
  action,
}: {
  emoji: string;
  title: string;
  message?: string;
  action?: { title: string; onPress: () => void };
}) {
  const c = useTheme();
  return (
    <View style={styles.centerBox}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      {message ? <Text style={[styles.emptyMsg, { color: c.textMuted }]}>{message}</Text> : null}
      {action ? <Button title={action.title} onPress={action.onPress} style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const c = useTheme();
  return (
    <View style={styles.centerBox}>
      <ActivityIndicator color={c.primary} size="large" />
      <Text style={[styles.emptyMsg, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      emoji="⚠️"
      title="Something went wrong"
      message={message}
      action={onRetry ? { title: 'Try again', onPress: onRetry } : undefined}
    />
  );
}

export function Banner({ message, tone = 'warning' }: { message: string; tone?: 'warning' | 'info' }) {
  const c = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: tone === 'warning' ? c.warning + '33' : c.primary + '22' }]}>
      <Text style={{ color: c.text, fontSize: 12 }}>{message}</Text>
    </View>
  );
}

export function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  const c = useTheme();
  return (
    <View style={[styles.progressTrack, { backgroundColor: c.surfaceAlt }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color ?? c.primary },
        ]}
      />
    </View>
  );
}

export function Avatar({ profile, size = 22 }: { profile?: MemberProfile | null; size?: number }) {
  const c = useTheme();
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (profile?.photoURL) return <Image source={{ uri: profile.photoURL }} style={dim} />;
  return (
    <View style={[dim, { backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: c.primaryText, fontSize: size * 0.42, fontWeight: '700' }}>{initials(profile?.name)}</Text>
    </View>
  );
}

export interface SheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
}

/** Simple bottom sheet with a list of options. */
export function OptionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  const c = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface }]}>
          {title ? <Text style={[styles.sheetTitle, { color: c.textMuted }]}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: 420 }}>
            {options.map((o) => (
              <Pressable
                key={o.label}
                onPress={() => {
                  onClose();
                  o.onPress();
                }}
                style={({ pressed }) => [styles.sheetItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
              >
                <Text style={{ color: o.destructive ? c.danger : c.text, fontSize: 16, fontWeight: o.selected ? '700' : '400' }}>
                  {o.selected ? '✓ ' : ''}
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Button title="Cancel" variant="secondary" onPress={onClose} style={{ marginTop: 8 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function PromptModal({
  visible,
  title,
  placeholder,
  initial = '',
  submitLabel = 'Save',
  onSubmit,
  onClose,
  keyboardType,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  initial?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
  keyboardType?: TextInputProps['keyboardType'];
}) {
  const c = useTheme();
  const [value, setValue] = React.useState(initial);
  // Reset the text each time the modal opens.
  const [wasVisible, setWasVisible] = React.useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setValue(initial);
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface }]}>
          <Text style={[styles.emptyTitle, { color: c.text, marginBottom: 12 }]}>{title}</Text>
          <Field
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            keyboardType={keyboardType}
            autoCapitalize={keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences'}
            onSubmitEditing={() => value.trim() && (onSubmit(value.trim()), onClose())}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title={submitLabel}
              disabled={!value.trim()}
              onPress={() => {
                onSubmit(value.trim());
                onClose();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, marginRight: 6, maxWidth: 200 },
  chipRow: { paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 240 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  emptyMsg: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  banner: { paddingHorizontal: 12, paddingVertical: 6 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  sheetItem: { paddingVertical: 14, paddingHorizontal: 8, borderRadius: 8 },
});
