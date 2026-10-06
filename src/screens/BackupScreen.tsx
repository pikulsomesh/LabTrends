// Back up every profile to one encrypted file, or restore one (PLAN.md Phase 8). The passphrase is
// never stored; without it the backup cannot be opened, by the user or anyone else.
import { useState } from 'react';
import { Alert } from 'react-native';
import { useSecureScreen } from '../components/useSecureScreen';
import { MIN_PASSPHRASE } from '../backup/crypto';
import { pickAndRestore, shareBackup } from '../backup/device';
import { useProfiles } from '../state/ActiveProfile';
import { Body, Busy, Button, Card, Heading, Input, Notice, Screen, Title } from '../ui';

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
    <Screen>
      <Title>Backup and restore</Title>

      <Card>
        <Heading>Back up</Heading>
        <Body>
          Saves every profile, report and value into one encrypted file, then opens the share sheet so you can keep it
          somewhere safe. Write the passphrase down: it cannot be recovered.
        </Body>
        <Input value={pass} onChangeText={setPass} secureTextEntry placeholder="Passphrase" accessibilityLabel="Backup passphrase" autoCapitalize="none" />
        <Input value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Passphrase again" accessibilityLabel="Confirm backup passphrase" autoCapitalize="none" />
        {backupError && <Notice tone="error">{backupError}</Notice>}
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
      </Card>

      <Card>
        <Heading>Restore</Heading>
        <Body>
          Adds the profiles from a backup file to this phone. Profiles already here are kept; a restored profile with the
          same name gets “(restored)” added.
        </Body>
        <Input value={restorePass} onChangeText={setRestorePass} secureTextEntry placeholder="Backup passphrase" accessibilityLabel="Restore passphrase" autoCapitalize="none" />
        <Button
          title="Choose backup file"
          variant="soft"
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
      </Card>

      {busy && <Busy label={busy} />}
      {message && <Notice tone="success">{message}</Notice>}
    </Screen>
  );
}
