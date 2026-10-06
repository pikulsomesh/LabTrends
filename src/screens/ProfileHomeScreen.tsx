// Dashboard for the active profile (PLAN.md Phase 7): one tab per panel the profile has values in,
// and each marker's latest value with its date. Tapping a marker opens its trend chart. Values are
// listed as recorded, never flagged against their range (CLAUDE.md guardrail 4).
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sharePdfSummary } from '../backup/device';
import Disclaimer from '../components/Disclaimer';
import ProfileNameModal from '../components/ProfileNameModal';
import { useSecureScreen } from '../components/useSecureScreen';
import { getLatest, listMarkers, type MarkerSummary, type SeriesPoint } from '../db';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';
import { panelOf, PANEL_ORDER } from '../utils/panels';
import { Body, Button, Card, Chip, Screen, Small, Title } from '../ui';
import { color, radius, space, tintFor } from '../ui/theme';

interface Props {
  onSwitchProfile(): void;
  onAddReport(): void;
  onOpenMarker(key: string): void;
  onOpenChat(): void;
}

type Row = MarkerSummary & { latest: SeriesPoint | null; panel: string };

const ALL = 'All';

/** Two or three characters for a marker's badge: short names as they are, long ones by initials. */
function abbreviate(key: string) {
  if (key.length <= 4) return key;
  const words = key.split(/[\s/]+/).filter(Boolean);
  return words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 3).toUpperCase() : key.slice(0, 2);
}

export default function ProfileHomeScreen({ onSwitchProfile, onAddReport, onOpenMarker, onOpenChat }: Props) {
  useSecureScreen();
  const { db, rename, remove } = useProfiles();
  const profile = useActiveProfile();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState(ALL);
  const [renaming, setRenaming] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      await sharePdfSummary(db, profile.id, profile.name);
    } catch (e) {
      Alert.alert('Could not make the PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    let live = true;
    setRows(null);
    (async () => {
      const markers = await listMarkers(db, profile.id);
      const out: Row[] = [];
      for (const m of markers) out.push({ ...m, latest: await getLatest(db, profile.id, m.key), panel: panelOf(m.key) });
      if (live) setRows(out);
    })().catch((e) => live && Alert.alert('Could not load values', String(e)));
    return () => {
      live = false;
    };
  }, [db, profile.id]);

  const tabs = useMemo(() => {
    const present = new Set(rows?.map((r) => r.panel));
    return [ALL, ...PANEL_ORDER.filter((p) => present.has(p))];
  }, [rows]);
  const shown = rows?.filter((r) => tab === ALL || r.panel === tab) ?? [];

  function confirmDelete() {
    Alert.alert(
      `Delete ${profile.name}?`,
      'This removes the profile and all of its saved reports and values from this phone. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Leave this screen first: it needs an active profile to render.
            onSwitchProfile();
            remove(profile.id).catch((e) => Alert.alert('Could not delete the profile', String(e)));
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerText}>
          <Small>Profile</Small>
          <Title>{profile.name}</Title>
        </View>
      </View>

      <View style={styles.actions}>
        <Button title="Add a report" onPress={onAddReport} style={styles.action} />
        <Button title="Ask" variant="soft" onPress={onOpenChat} style={styles.action} />
      </View>
      {rows && rows.length > 0 && (
        <Button
          title={exporting ? 'Making PDF…' : 'Export PDF summary'}
          variant="soft"
          loading={exporting}
          onPress={exportPdf}
        />
      )}

      {rows == null ? null : rows.length === 0 ? (
        <Card tint={color.primarySoft}>
          <Body>No values yet. Add a report to start.</Body>
        </Card>
      ) : (
        <>
          <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.tabsContent} showsHorizontalScrollIndicator={false}>
            {tabs.map((t) => (
              <Chip key={t} label={t} selected={t === tab} tint={t === ALL ? undefined : tintFor(t)} onPress={() => setTab(t)} />
            ))}
          </ScrollView>
          {shown.map((item) => {
            const tint = tintFor(item.panel);
            return (
              <Card key={item.key} style={styles.row} onPress={() => onOpenMarker(item.key)}>
                <View style={[styles.badge, { backgroundColor: tint.bg }]}>
                  <Text style={[styles.badgeText, { color: tint.ink }]} numberOfLines={1}>
                    {abbreviate(item.key)}
                  </Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.marker}>{item.key}</Text>
                  <Small>
                    {item.count} value{item.count === 1 ? '' : 's'}, latest {item.latestDate}
                  </Small>
                </View>
                {item.latest && (
                  <Text style={styles.value}>
                    {item.latest.value} <Text style={styles.unit}>{item.latest.unit ?? ''}</Text>
                  </Text>
                )}
              </Card>
            );
          })}
        </>
      )}

      <View style={styles.footer}>
        <View style={styles.actions}>
          <Button title="Switch profile" variant="ghost" onPress={onSwitchProfile} style={styles.action} />
          <Button title="Rename" variant="ghost" onPress={() => setRenaming(true)} style={styles.action} />
        </View>
        <Button title="Delete profile" variant="danger" onPress={confirmDelete} />
        <Disclaimer />
      </View>
      <ProfileNameModal
        visible={renaming}
        title="Rename profile"
        initialName={profile.name}
        submitLabel="Save"
        onSubmit={(name) => rename(profile.id, name)}
        onClose={() => setRenaming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E6E1FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#4B3FAE' },
  headerText: { flex: 1, gap: 0 },
  actions: { flexDirection: 'row', gap: space.md },
  action: { flex: 1, paddingHorizontal: space.md },
  tabs: { flexGrow: 0, marginHorizontal: -space.xl },
  tabsContent: { gap: space.sm, paddingHorizontal: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  badge: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '800' },
  rowMain: { flex: 1, gap: 2 },
  marker: { fontSize: 17, fontWeight: '600', color: color.ink },
  value: { fontSize: 18, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, fontWeight: '500', color: color.inkSoft },
  footer: { gap: space.md, marginTop: space.lg },
});
