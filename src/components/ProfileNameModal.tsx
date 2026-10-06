// Create-profile and rename-profile modal. The name rules (trimmed, 1 to 60 characters) are
// enforced again in src/db/profiles.ts; this only gives quick feedback.
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Button, Input, Notice, Title } from '../ui';
import { color, radius, shadow, space } from '../ui/theme';

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
          <Title>{title}</Title>
          <Input
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
          {error && <Notice tone="error">{error}</Notice>}
          <View style={styles.actions}>
            <Button title="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
            <Button title={submitLabel} onPress={submit} disabled={busy || !name.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(37, 35, 58, 0.45)', justifyContent: 'center', padding: space.xl },
  card: { backgroundColor: color.surface, borderRadius: radius.lg + 4, padding: space.xl, gap: space.lg, ...shadow },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
