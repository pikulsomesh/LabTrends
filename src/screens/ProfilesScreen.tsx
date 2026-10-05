// Landing screen: the family's profiles. Tapping one makes it active and opens it.
import { useState } from 'react';
import { Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Disclaimer from '../components/Disclaimer';
import ProfileNameModal from '../components/ProfileNameModal';
import { useProfiles } from '../state/ActiveProfile';

interface Props {
  onOpenProfile(): void;
  /** Dev builds only: opens the Phase 0 spike screen. */
  onOpenSpike?: () => void;
}

export default function ProfilesScreen({ onOpenProfile, onOpenSpike }: Props) {
  const { profiles, active, select, create } = useProfiles();
  const [creating, setCreating] = useState(false);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>LabTrends</Text>
      <Text style={styles.subtitle}>{profiles.length ? 'Choose a profile' : 'No profiles yet.'}</Text>
      <FlatList
        style={styles.list}
        data={profiles}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, item.id === active?.id && styles.rowActive, pressed && styles.rowPressed]}
            onPress={async () => {
              await select(item.id);
              onOpenProfile();
            }}
          >
            <Text style={styles.rowText}>{item.name}</Text>
          </Pressable>
        )}
      />
      <Button title="Add profile" onPress={() => setCreating(true)} />
      {onOpenSpike && <Button title="Open Phase 0 spike" onPress={onOpenSpike} />}
      <Disclaimer />
      <ProfileNameModal
        visible={creating}
        title="New profile"
        submitLabel="Create"
        onSubmit={async (name) => {
          await create(name);
          onOpenProfile();
        }}
        onClose={() => setCreating(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 56, gap: 12 },
  title: { fontSize: 28, fontWeight: '600' },
  subtitle: { fontSize: 16, color: '#333' },
  list: { flexGrow: 1 },
  row: { paddingVertical: 16, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  rowActive: { backgroundColor: '#E6F4FE' },
  rowPressed: { opacity: 0.6 },
  rowText: { fontSize: 18 },
});
