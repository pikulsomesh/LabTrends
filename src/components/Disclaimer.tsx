// Fixed "not a medical device" notice (CLAUDE.md guardrail 4). Shown on the landing screen, the
// dashboard and the chat.
import { Text } from 'react-native';
import { color } from '../ui/theme';

export const DISCLAIMER =
  'LabTrends stores and plots values you enter. It does not diagnose, interpret, or advise. ' +
  'Talk to a qualified clinician about your results.';

export default function Disclaimer() {
  return <Text style={{ fontSize: 12, lineHeight: 17, color: color.inkFaint, textAlign: 'center', paddingHorizontal: 8 }}>{DISCLAIMER}</Text>;
}
