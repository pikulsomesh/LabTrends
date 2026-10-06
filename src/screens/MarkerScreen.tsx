// One marker for the active profile: trend chart with the printed range band, and every recorded
// value with its date, lab and printed range. A wrongly saved report can be deleted from here.
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import TrendChart from '../components/TrendChart';
import { useSecureScreen } from '../components/useSecureScreen';
import { deleteReport, getSeries, type SeriesPoint } from '../db';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';
import { Button, Card, Heading, Screen, Small, Title } from '../ui';
import { color, space } from '../ui/theme';

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
    <Screen>
      <Title>{markerKey}</Title>
      {points && (
        <Card>
          <TrendChart points={points} />
        </Card>
      )}
      <Heading>Recorded values</Heading>
      {[...(points ?? [])].reverse().map((p, i) => (
        <Card key={`${p.reportId}:${i}`} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.value}>
              {p.value} {p.unit ?? ''}
            </Text>
            <Small>
              {p.date}
              {p.labName ? `, ${p.labName}` : ''}
              {p.rawRefText ? `. Printed range: ${p.rawRefText}` : ''}
              {p.name !== markerKey ? `. Printed as "${p.name}"` : ''}
            </Small>
          </View>
          <Button title="Delete" variant="danger" style={styles.del} onPress={() => confirmDeleteReport(p)} />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowMain: { flex: 1, gap: 2 },
  value: { fontSize: 18, fontWeight: '700', color: color.ink },
  del: { minHeight: 40, paddingVertical: 6, paddingHorizontal: space.lg },
});
