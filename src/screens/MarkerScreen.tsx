// One marker for the active profile: trend chart with the printed range band, and every recorded
// value with its date, lab and printed range. A wrongly saved report can be deleted from here.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import TrendChart from '../components/TrendChart';
import { useSecureScreen } from '../components/useSecureScreen';
import { deleteReport, getSeries, type SeriesPoint } from '../db';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';

export default function MarkerScreen({ markerKey, onEmpty }: { markerKey: string; onEmpty(): void }) {
  useSecureScreen();
  const { db } = useProfiles();
  const profile = useActiveProfile();
  const [points, setPoints] = useState<SeriesPoint[] | null>(null);

  const load = useCallback(async () => {
    const p = await getSeries(db, profile.id, markerKey);
    if (!p.length) onEmpty();
    else setPoints(p);
  }, [db, profile.id, markerKey, onEmpty]);

  useEffect(() => {
    load().catch((e) => Alert.alert('Could not load values', String(e)));
  }, [load]);

  function confirmDeleteReport(p: SeriesPoint) {
    Alert.alert(
      `Delete the report from ${p.date}?`,
      'This removes that whole report and every value saved from it, not only this one. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete report',
          style: 'destructive',
          onPress: () =>
            deleteReport(db, profile.id, p.reportId)
              .then(load)
              .catch((e) => Alert.alert('Could not delete the report', String(e))),
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.title}>{markerKey}</Text>
      {points && <TrendChart points={points} />}
      <Text style={styles.heading}>Recorded values</Text>
      {[...(points ?? [])].reverse().map((p, i) => (
        <View key={`${p.reportId}:${i}`} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.value}>
              {p.value} {p.unit ?? ''}
            </Text>
            <Text style={styles.small}>
              {p.date}
              {p.labName ? `, ${p.labName}` : ''}
              {p.rawRefText ? `. Printed range: ${p.rawRefText}` : ''}
              {p.name !== markerKey ? `. Printed as "${p.name}"` : ''}
            </Text>
          </View>
          <Button title="Delete" color="#b00020" onPress={() => confirmDeleteReport(p)} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 16, paddingTop: 48, gap: 12 },
  title: { fontSize: 26, fontWeight: '600' },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  rowMain: { flex: 1, gap: 2 },
  value: { fontSize: 16, color: '#111' },
  small: { fontSize: 12, color: '#555' },
});
