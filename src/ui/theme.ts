// Design tokens: a calm pastel palette, generous rounding and soft shadows.
// Colour here is decoration and structure only. It never encodes whether a lab value is good or bad
// (CLAUDE.md guardrail 4): no red/green for ranges, and each panel's tint is fixed by its name.
import { Platform, StatusBar } from 'react-native';

export const color = {
  bg: '#F7F5FF', // lavender-tinted off-white
  surface: '#FFFFFF',
  ink: '#25233A', // text
  inkSoft: '#5E5B78', // secondary text, 6.5:1 on bg
  inkFaint: '#8C89A6', // hints and placeholders
  line: '#E8E5F5',

  primary: '#6A5FDB', // buttons, selected states; white text 5:1
  primaryPressed: '#5A4FC9',
  primarySoft: '#E8E4FF',
  onPrimary: '#FFFFFF',

  // Destructive actions only (delete, remove). Never used on values.
  danger: '#B4415C',
  dangerSoft: '#FDE8EE',

  notice: '#FFF3DC', // soft butter for heads-up boxes
  noticeInk: '#7A5200',
  success: '#E3F6EC',
  successInk: '#25664A',
} as const;

/** One tint per panel, picked by panel name so a marker's colour never changes with its value. */
export const panelTint: Record<string, { bg: string; ink: string }> = {
  Liver: { bg: '#FFE6D8', ink: '#8A4A2B' },
  'Blood count': { bg: '#FFE0EA', ink: '#8A3550' },
  Diabetes: { bg: '#E0F0FF', ink: '#2D5E8C' },
  Lipids: { bg: '#FFF1C9', ink: '#7A5A10' },
  Thyroid: { bg: '#E6E1FF', ink: '#4B3FAE' },
  Kidney: { bg: '#D9F4EA', ink: '#25664A' },
  'Vitamins and iron': { bg: '#EAF6C9', ink: '#55671A' },
  Other: { bg: '#ECEAF5', ink: '#4D4A66' },
};
export const tintFor = (panel: string) => panelTint[panel] ?? panelTint.Other;

export const radius = { sm: 12, md: 18, lg: 24, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  display: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5, color: color.ink },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3, color: color.ink },
  heading: { fontSize: 18, fontWeight: '700', color: color.ink },
  body: { fontSize: 16, lineHeight: 23, color: color.inkSoft },
  label: { fontSize: 13, fontWeight: '600', color: color.inkSoft },
  small: { fontSize: 13, lineHeight: 18, color: color.inkSoft },
} as const;

export const shadow = Platform.select({
  android: { elevation: 3, shadowColor: '#4B3FAE' },
  default: { shadowColor: '#4B3FAE', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
})!;

/** Room for the status bar, since screens draw edge to edge. */
export const topInset = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44) + 12;
