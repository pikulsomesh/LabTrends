// Dashboard for the active profile (PLAN.md Phase 7): one tab per panel the profile has values in,
// and each marker's latest value with its date. Tapping a marker opens its trend chart. Values are
// listed as recorded, never flagged against their range (CLAUDE.md guardrail 4).
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Disclaimer from '../components/Disclaimer';
import ProfileNameModal from '../components/ProfileNameModal';
import { useSecureScreen } from '../components/useSecureScreen';
import { getLatest, listMarkers, type MarkerSummary, type SeriesPoint } from '../db';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';
import { panelOf, PANEL_ORDER } from '../utils/panels';

interface Props {
  onSwitchProfile(): void;
  onAddReport(): void;
  onOpenMarker(key: string): void;
  onOpenChat(): void;
}

type Row = MarkerSummary & { latest: SeriesPoint | null; panel: string };

const ALL = 'All';

export default function ProfileHomeScreen({ onSwitchProfile, onAddReport, onOpenMarker, onOpenChat }: Props) {
  useSecureScreen();
  const { db, rename, remove } = useProfiles();
  const profile = useActiveProfile();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState(ALL);
  const [renaming, setRenaming] = useState(false);

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
    <View style={styles.root}>
      <Text style={styles.title}>{profile.name}</Text>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button title="Add a report" onPress={onAddReport} />
        </View>
        <View style={styles.action}>
          <Button title="Ask" onPress={onOpenChat} />
        </View>
      </View>

      {rows == null ? null : rows.length === 0 ? (
        <Text style={styles.body}>No values yet. Add a report to start.</Text>
      ) : (
        <>
          <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.tabsContent} showsHorizontalScrollIndicator={false}>
            {tabs.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: t === tab }}
                onPress={() => setTab(t)}
                style={[styles.tab, t === tab && styles.tabOn]}
              >
                <Text style={[styles.tabText, t === tab && styles.tabTextOn]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <FlatList
            style={styles.list}
            data={shown}
            keyExtractor={(r) => r.key}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" onPress={() => onOpenMarker(item.key)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <View style={styles.rowMain}>
                  <Text style={styles.marker}>{item.key}</Text>
                  <Text style={styles.small}>
                    {item.count} value{item.count === 1 ? '' : 's'}, latest {item.latestDate}
                  </Text>
                </View>
                {item.latest && (
                  <Text style={styles.value}>
                    {item.latest.value} {item.latest.unit ?? ''}
                  </Text>
                )}
              </Pressable>
            )}
          />
        </>
      )}

      <View style={styles.footer}>
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button title="Switch profile" onPress={onSwitchProfile} />
          </View>
          <View style={styles.action}>
            <Button title="Rename" onPress={() => setRenaming(true)} />
          </View>
        </View>
        <Button title="Delete profile" color="#b00020" onPress={confirmDelete} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, paddingTop: 48, gap: 12 },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16, color: '#333' },
  small: { fontSize: 12, color: '#555' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
  tabs: { flexGrow: 0 },
  tabsContent: { gap: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#bbb' },
  tabOn: { backgroundColor: '#1f5fa8', borderColor: '#1f5fa8' },
  tabText: { fontSize: 14, color: '#333' },
  tabTextOn: { color: '#fff' },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  rowPressed: { backgroundColor: '#f2f2f2' },
  rowMain: { flex: 1, gap: 2 },
  marker: { fontSize: 16, color: '#111' },
  value: { fontSize: 16, color: '#111', fontVariant: ['tabular-nums'] },
  footer: { gap: 8, paddingBottom: 8 },
});
