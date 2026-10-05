// Home for the active profile. Phase 7 puts the dashboard here; for now it shows the report count
// and lets the user rename or delete the profile.
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import Disclaimer from '../components/Disclaimer';
import ProfileNameModal from '../components/ProfileNameModal';
import { listReports } from '../db';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';

interface Props {
  onSwitchProfile(): void;
}

export default function ProfileHomeScreen({ onSwitchProfile }: Props) {
  const { db, rename, remove } = useProfiles();
  const profile = useActiveProfile();
  const [reportCount, setReportCount] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    let live = true;
    setReportCount(null);
    listReports(db, profile.id).then((r) => live && setReportCount(r.length));
    return () => {
      live = false;
    };
  }, [db, profile.id]);

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
      <Text style={styles.body}>
        {reportCount == null ? ' ' : reportCount === 0 ? 'No reports yet.' : `${reportCount} saved report${reportCount === 1 ? '' : 's'}.`}
      </Text>
      <View style={styles.actions}>
        <Button title="Switch profile" onPress={onSwitchProfile} />
        <Button title="Rename" onPress={() => setRenaming(true)} />
        <Button title="Delete profile" color="#b00020" onPress={confirmDelete} />
      </View>
      <View style={styles.footer}>
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
  root: { flex: 1, padding: 24, paddingTop: 56, gap: 16 },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16, color: '#333' },
  actions: { gap: 12 },
  footer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 8 },
});
