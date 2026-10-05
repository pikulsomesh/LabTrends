// Create-profile and rename-profile modal. The name rules (trimmed, 1 to 60 characters) are
// enforced again in src/db/profiles.ts; this only gives quick feedback.
import { useEffect, useState } from 'react';
import { Button, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

export const MAX_NAME = 60;

interface Props {
  visible: boolean;
  title: string;
  initialName?: string;
  submitLabel: string;
  onSubmit(name: string): Promise<void>;
  onClose(): void;
}

export default function ProfileNameModal({ visible, title, initialName = '', submitLabel, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setError(null);
    }
  }, [visible, initialName]);

  async function submit() {
    if (!name.trim()) return setError('Enter a name.');
    setBusy(true);
    try {
      await onSubmit(name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            placeholder="Name, e.g. Asha"
            maxLength={MAX_NAME}
            autoFocus
            autoCapitalize="words"
            autoComplete="off"
            autoCorrect={false}
            importantForAutofill="no"
            returnKeyType="done"
            onSubmitEditing={submit}
            editable={!busy}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Button title="Cancel" onPress={onClose} disabled={busy} />
            <Button title={submitLabel} onPress={submit} disabled={busy || !name.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  error: { color: '#b00020' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
});
