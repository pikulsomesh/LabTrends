// Landing screen: the family's profiles. Tapping one makes it active and opens it.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Disclaimer from '../components/Disclaimer';
import ProfileNameModal from '../components/ProfileNameModal';
import { useProfiles } from '../state/ActiveProfile';
import { Body, Button, Card, Heading, Screen, Small } from '../ui';
import { color, radius, space, type as t } from '../ui/theme';

interface Props {
  onOpenProfile(): void;
  onOpenBackup(): void;
  onOpenSettings(): void;
  /** Dev builds only: opens the Phase 0 spike screen. */
  onOpenSpike?: () => void;
}

// Avatar tints rotate by position only, so a profile keeps its colour and nothing is implied by it.
const AVATARS = [
  { bg: '#E6E1FF', ink: '#4B3FAE' },
  { bg: '#D9F4EA', ink: '#25664A' },
  { bg: '#FFE6D8', ink: '#8A4A2B' },
  { bg: '#E0F0FF', ink: '#2D5E8C' },
  { bg: '#FFE0EA', ink: '#8A3550' },
];

export default function ProfilesScreen({ onOpenProfile, onOpenBackup, onOpenSettings, onOpenSpike }: Props) {
  const { profiles, select, create } = useProfiles();
  const [creating, setCreating] = useState(false);

  return (
    <Screen>
      <LinearGradient colors={['#DCD6FF', '#FBE3F0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroTitle}>LabTrends</Text>
        <Text style={styles.heroSub}>Your lab results and their trends, kept private on this phone.</Text>
      </LinearGradient>

      <Heading>{profiles.length ? 'Choose a profile' : 'No profiles yet.'}</Heading>
      {profiles.length === 0 && <Body>Add a profile for yourself or someone in your family to get started.</Body>}

      {profiles.map((p, i) => {
        const tint = AVATARS[i % AVATARS.length];
        return (
          <Card
            key={p.id}
            style={styles.profile}
            onPress={async () => {
              await select(p.id);
              onOpenProfile();
            }}
          >
            <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
              <Text style={[styles.avatarText, { color: tint.ink }]}>{p.name.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.profileName}>{p.name}</Text>
            <Text style={styles.chevron}>›</Text>
          </Card>
        );
      })}

      <View style={styles.buttons}>
        <Button title="Add profile" onPress={() => setCreating(true)} />
        <Button title="Backup and restore" variant="soft" onPress={onOpenBackup} />
        <Button title="Settings" variant="ghost" onPress={onOpenSettings} />
        {onOpenSpike && <Button title="Open Phase 0 spike" variant="ghost" onPress={onOpenSpike} />}
      </View>
      <Small>Everything stays on this phone. There is no account and no network access.</Small>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg + 8, padding: space.xl, paddingVertical: space.xxl, gap: space.sm },
  heroTitle: { ...t.display, fontSize: 36 },
  heroSub: { ...t.body, color: color.ink, opacity: 0.75 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700' },
  profileName: { flex: 1, fontSize: 18, fontWeight: '600', color: color.ink },
  chevron: { fontSize: 28, color: color.inkFaint, marginTop: -4 },
  buttons: { gap: space.md, marginTop: space.sm },
});
