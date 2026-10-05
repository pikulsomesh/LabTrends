// Add a report: photograph it, pick photos, or pick a PDF, and get its text. The text lives in this
// screen's state only and is dropped on leaving. Phase 5 parses it and Phase 6 adds review and save.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appendPages, ingest, type Extracted, type IngestInput } from '../ingest/ingest';
import { deviceDeps, pickImages, pickPdf, setSecure, takePhoto } from '../ingest/native';
import { useActiveProfile } from '../state/ActiveProfile';

type Picker = () => Promise<IngestInput | null>;

const METHOD_LABEL: Record<Extracted['method'], string> = {
  'text-layer': 'read from the PDF text',
  ocr: 'read with on-device text recognition',
};

export default function IngestScreen() {
  const profile = useActiveProfile();
  const [result, setResult] = useState<Extracted | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Report contents are on screen: block screenshots and the recents thumbnail.
  useEffect(() => {
    setSecure(true).catch(() => {});
    return () => {
      setSecure(false).catch(() => {});
    };
  }, []);

  async function run(pick: Picker, append: boolean) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const input = await pick();
      if (!input) return;
      const r = await ingest(input, deviceDeps);
      setResult((prev) => (append && prev ? appendPages(prev, r) : r));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canAppend = result?.kind === 'images';

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Add a report</Text>
      <Text style={styles.body}>For {profile.name}. Files are read on this phone, then deleted. Nothing is saved yet.</Text>

      {result == null ? (
        <View style={styles.actions}>
          <Button title="Take a photo" disabled={busy} onPress={() => run(takePhoto, false)} />
          <Button title="Choose photos" disabled={busy} onPress={() => run(pickImages, false)} />
          <Button title="Choose a PDF" disabled={busy} onPress={() => run(pickPdf, false)} />
        </View>
      ) : (
        <>
          <Text style={styles.body}>
            {result.pageCount} page{result.pageCount === 1 ? '' : 's'}, {METHOD_LABEL[result.method]}.
          </Text>
          <View style={styles.actions}>
            {canAppend && <Button title="Add a page: take a photo" disabled={busy} onPress={() => run(takePhoto, true)} />}
            {canAppend && <Button title="Add a page: choose photos" disabled={busy} onPress={() => run(pickImages, true)} />}
            <Button title="Discard and start over" color="#b00020" disabled={busy} onPress={() => setResult(null)} />
          </View>
          <ScrollView style={styles.textBox}>
            <Text style={styles.mono} selectable={false}>
              {result.text}
            </Text>
          </ScrollView>
        </>
      )}

      {busy && <ActivityIndicator />}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 56, gap: 12 },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16, color: '#333' },
  actions: { gap: 12 },
  textBox: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 4, padding: 8 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#222' },
  error: { color: '#b00020' },
});
