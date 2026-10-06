// Small set of styled building blocks used by every screen, so the app has one consistent look
// instead of the stock React Native controls.
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { color, radius, shadow, space, topInset, type as t } from './theme';

/** Page background with room for the status bar. Scrolls unless `fixed`. */
export function Screen({ children, fixed, footer }: { children: ReactNode; fixed?: boolean; footer?: ReactNode }) {
  return (
    <View style={styles.screen}>
      {fixed ? (
        <View style={styles.pageFixed}>{children}</View>
      ) : (
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      )}
      {footer}
    </View>
  );
}

export const Title = ({ children }: { children: ReactNode }) => <Text style={t.title}>{children}</Text>;
export const Display = ({ children }: { children: ReactNode }) => <Text style={t.display}>{children}</Text>;
export const Heading = ({ children }: { children: ReactNode }) => <Text style={[t.heading, styles.heading]}>{children}</Text>;
export const Body = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <Text style={[t.body, style as object]}>{children}</Text>
);
export const Small = ({ children }: { children: ReactNode }) => <Text style={t.small}>{children}</Text>;

export function Card({ children, style, onPress, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tint?: string }) {
  const base = [styles.card, tint ? { backgroundColor: tint } : null, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress(): void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, btnBg[variant], variant === 'primary' && !off && shadow, pressed && styles.pressed, off && styles.off, style]}
    >
      {loading && <ActivityIndicator size="small" color={btnInk[variant]} />}
      <Text style={[styles.btnText, { color: btnInk[variant] }]}>{title}</Text>
    </Pressable>
  );
}

const btnBg: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: color.primary },
  soft: { backgroundColor: color.primarySoft },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: color.dangerSoft },
};
const btnInk: Record<Variant, string> = {
  primary: color.onPrimary,
  soft: color.primary,
  ghost: color.primary,
  danger: color.danger,
};

export function Chip({ label, selected, onPress, tint }: { label: string; selected?: boolean; onPress(): void; tint?: { bg: string; ink: string } }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected ? { backgroundColor: tint?.ink ?? color.primary } : { backgroundColor: tint?.bg ?? color.primarySoft }]}
    >
      <Text style={[styles.chipText, { color: selected ? '#fff' : (tint?.ink ?? color.primary) }]}>{label}</Text>
    </Pressable>
  );
}

export function Input({ label, style, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={t.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={color.inkFaint}
        accessibilityLabel={props.accessibilityLabel ?? label}
        {...props}
        style={[styles.input, style]}
      />
    </View>
  );
}

/** Heads-up box. `tone` only separates kinds of message, it never says anything about a value. */
export function Notice({ children, tone = 'notice' }: { children: ReactNode; tone?: 'notice' | 'error' | 'success' }) {
  const palette = {
    notice: { bg: color.notice, ink: color.noticeInk },
    error: { bg: color.dangerSoft, ink: color.danger },
    success: { bg: color.success, ink: color.successInk },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]}>
      <Text style={[t.small, { color: palette.ink, fontSize: 14, lineHeight: 20 }]}>{children}</Text>
    </View>
  );
}

export function Busy({ label }: { label: string }) {
  return (
    <View style={styles.busy}>
      <ActivityIndicator color={color.primary} />
      <Text style={t.small}>{label}</Text>
    </View>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.row, style]}>{children}</View>;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  page: { paddingTop: topInset, paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.lg },
  pageFixed: { flex: 1, paddingTop: topInset, paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.lg },
  heading: { marginTop: space.sm },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, ...shadow },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  off: { opacity: 0.45 },
  btn: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingHorizontal: space.lg, paddingVertical: 9, borderRadius: radius.pill },
  chipText: { fontSize: 14, fontWeight: '700' },
  field: { gap: 6, flex: 1 },
  input: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    fontSize: 16,
    color: color.ink,
  },
  notice: { borderRadius: radius.md, padding: space.md },
  busy: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
});
