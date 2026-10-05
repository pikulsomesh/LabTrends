// Landing screen placeholder. Phase 3 replaces the body with the profile list and create-profile modal.
import { Button, StyleSheet, Text, View } from 'react-native';
import Disclaimer from '../components/Disclaimer';

interface Props {
  /** Dev builds only: opens the Phase 0 spike screen. */
  onOpenSpike?: () => void;
}

export default function HomeScreen({ onOpenSpike }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>LabTrends</Text>
      <Text style={styles.body}>No profiles yet.</Text>
      {onOpenSpike && <Button title="Open Phase 0 spike" onPress={onOpenSpike} />}
      <View style={styles.footer}>
        <Disclaimer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16, color: '#333' },
  footer: { position: 'absolute', bottom: 32, left: 24, right: 24 },
});
