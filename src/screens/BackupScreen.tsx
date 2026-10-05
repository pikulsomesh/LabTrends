// Back up every profile to one encrypted file, or restore one (PLAN.md Phase 8). The passphrase is
// never stored; without it the backup cannot be opened, by the user or anyone else.
import { useState } from 'react';
import { ActivityIndicator, Alert, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSecureScreen } from '../components/useSecureScreen';
import { MIN_PASSPHRASE } from '../backup/crypto';
import { pickAndRestore, shareBackup } from '../backup/device';
import { useProfiles } from '../state/ActiveProfile';

export default function BackupScreen() {
  useSecureScreen();
  const { db, reload } = useProfiles();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function work(label: string, fn: () => Promise<string | null>) {
    if (busy) return;
    setMessage(null);
    setBusy(label);
    try {
      const done = await fn();
      if (done) setMessage(done);
    } catch (e) {
      Alert.alert('That did not work', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const backupError =
    pass.length > 0 && pass.length < MIN_PASSPHRASE
      ? `Use at least ${MIN_PASSPHRASE} characters.`
      : confirm.length > 0 && confirm !== pass
        ? 'The two passphrases differ.'
        : null;
  const canBackup = pass.length >= MIN_PASSPHRASE && confirm === pass;

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Backup and restore</Text>

      <Text style={styles.heading}>Back up</Text>
      <Text style={styles.body}>
        Saves every profile, report and value into one encrypted file, then opens the share sheet so you can keep it
        somewhere safe. Write the passphrase down: it cannot be recovered.
      </Text>
      <TextInput style={styles.input} value={pass} onChangeText={setPass} secureTextEntry placeholder="Passphrase" accessibilityLabel="Backup passphrase" autoCapitalize="none" />
      <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Passphrase again" accessibilityLabel="Confirm backup passphrase" autoCapitalize="none" />
      {backupError && <Text style={styles.error}>{backupError}</Text>}
      <Button
        title="Create backup"
        disabled={!canBackup || !!busy}
        onPress={() =>
          work('Encrypting…', async () => {
            await shareBackup(db, pass);
            setPass('');
            setConfirm('');
            return 'Backup created.';
          })
        }
      />

      <Text style={styles.heading}>Restore</Text>
      <Text style={styles.body}>
        Adds the profiles from a backup file to this phone. Profiles already here are kept; a restored profile with the
        same name gets “(restored)” added.
      </Text>
      <TextInput style={styles.input} value={restorePass} onChangeText={setRestorePass} secureTextEntry placeholder="Backup passphrase" accessibilityLabel="Restore passphrase" autoCapitalize="none" />
      <Button
        title="Choose backup file"
        disabled={!restorePass || !!busy}
        onPress={() =>
          work('Decrypting…', async () => {
            const r = await pickAndRestore(db, restorePass);
            if (!r) return null;
            setRestorePass('');
            await reload();
            return `Restored ${r.profiles} profile${r.profiles === 1 ? '' : 's'}, ${r.reports} report${r.reports === 1 ? '' : 's'} and ${r.values} value${r.values === 1 ? '' : 's'}.`;
          })
        }
      />

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator />
          <Text style={styles.body}>{busy}</Text>
        </View>
      )}
      {message && <Text style={styles.done}>{message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 24, paddingTop: 56, gap: 12 },
  title: { fontSize: 28, fontWeight: '600' },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  body: { fontSize: 15, color: '#333' },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: '#111' },
  error: { color: '#b00020' },
  done: { color: '#1b5e20', fontSize: 15 },
  busy: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
