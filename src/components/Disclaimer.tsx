// Fixed "not a medical device" notice (CLAUDE.md guardrail 4). Shown on the landing screen and,
// later, on the dashboard and chat.
import { StyleSheet, Text } from 'react-native';

export const DISCLAIMER =
  'LabTrends stores and plots values you enter. It does not diagnose, interpret, or advise. ' +
  'Talk to a qualified clinician about your results.';

export default function Disclaimer() {
  return <Text style={styles.text}>{DISCLAIMER}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 12, color: '#555', textAlign: 'center' },
});
