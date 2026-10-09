// One marker for the active profile: trend chart with the printed range band, and every recorded
// value with its date, lab and printed range. A wrongly saved report can be deleted from here.
// Results printed as words ("Trace", "Pale yellow") have no number to plot, so they show as a
// timeline of chips, oldest to newest. A chip shows the printed words; it never flags them.
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import TrendChart from '../components/TrendChart';
import { useSecureScreen } from '../components/useSecureScreen';
import { numericPoints, textPoints } from '../dashboard/chartData';
import { deleteReport, formatValue, getSeries, type SeriesPoint } from '../db';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';
import { formatDate, shortDateIn } from '../utils/dates';
import { swatchFor } from '../utils/textResults';
import { Button, Card, Heading, Screen, Small, Title } from '../ui';
import { color, radius, space } from '../ui/theme';

export default function MarkerScreen({ markerKey, onEmpty }: { markerKey: string; onEmpty(): void }) {
  useSecureScreen();
  const { db, dateOrder } = useProfiles();
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
      `Delete the report from ${formatDate(p.date, dateOrder)}?`,
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
      {points && numericPoints(points).length > 0 && (
        <Card>
          <TrendChart points={points} />
        </Card>
      )}
      {points && textPoints(points).length > 0 && (
        <Card>
          <Heading>Results printed as text</Heading>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeline}>
            {textPoints(points).map((p, i) => {
              const swatch = swatchFor(p.valueText!);
              return (
                <View key={`${p.reportId}:${i}`} style={styles.step}>
                  <View style={styles.chip}>
                    {swatch && <View style={[styles.swatch, { backgroundColor: swatch }]} />}
                    <Text style={styles.chipText}>{p.valueText}</Text>
                  </View>
                  <Small>{shortDateIn(p.date, dateOrder)}</Small>
                </View>
              );
            })}
          </ScrollView>
          <Small>Oldest on the left. Shown as printed on each report.</Small>
        </Card>
      )}
      <Heading>Recorded values</Heading>
      {[...(points ?? [])].reverse().map((p, i) => (
        <Card key={`${p.reportId}:${i}`} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.value}>{formatValue(p)}</Text>
            <Small>
              {formatDate(p.date, dateOrder)}
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
  timeline: { gap: space.md, paddingVertical: space.sm },
  step: { alignItems: 'center', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: color.primarySoft },
  chipText: { fontSize: 14, fontWeight: '600', color: color.ink },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: color.line },
  del: { minHeight: 40, paddingVertical: 6, paddingHorizontal: space.lg },
});
