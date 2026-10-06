// Add a report: photograph it, pick photos, or pick a PDF, read its text, pull out candidate
// values (parser first, the imported local model for lines the parser cannot read), then check
// and save them on the verification form. Text and candidates live in this screen's state only:
// they are dropped on leaving, and cleared as soon as the report is saved.
import { useState } from 'react';
import { ActivityIndicator, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSecureScreen } from '../components/useSecureScreen';
import VerifyForm from '../components/VerifyForm';
import { extractReport, type Extraction, type ExtractedRow } from '../ai/extract';
import { importedModel, importModel, loadSlm, removeModel, type ModelInfo } from '../ai/model';
import { appendPages, ingest, type Extracted, type IngestInput } from '../ingest/ingest';
import { deviceDeps, pickImages, pickPdf, takePhoto } from '../ingest/native';
import { useActiveProfile } from '../state/ActiveProfile';
import { draftFromExtraction, type Draft } from '../verify/draft';

type Picker = () => Promise<IngestInput | null>;

const METHOD_LABEL: Record<Extracted['method'], string> = {
  'text-layer': 'read from the PDF text',
  ocr: 'read with on-device text recognition',
};

const SLM_NOTE: Record<Extraction['slm'], string> = {
  'not-needed': '',
  'no-model': 'Import a local model to try reading the lines below, or enter them by hand when you review.',
  used: '',
  failed: 'The local model could not run, so the lines below are left for you.',
};

const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

function rangeLabel(r: ExtractedRow) {
  return r.rawRefText ? ` (ref ${r.rawRefText})` : '';
}

interface Props {
  /** Leaves the screen after a save. */
  onDone(): void;
}

export default function IngestScreen({ onDone }: Props) {
  const profile = useActiveProfile();
  const [result, setResult] = useState<Extracted | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [model, setModel] = useState<ModelInfo | null>(() => importedModel());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useSecureScreen();

  async function work(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function extract(text: string, m: ModelInfo | null) {
    setExtraction(null);
    setExtraction(await extractReport(text, m ? () => loadSlm(m.uri) : null));
  }

  const add = (pick: Picker, append: boolean) =>
    work('Reading the report…', async () => {
      const input = await pick();
      if (!input) return;
      const r = await ingest(input, deviceDeps);
      const next = append && result ? appendPages(result, r) : r;
      setResult(next);
      setBusy('Finding values…');
      await extract(next.text, model);
    });

  const onImportModel = () =>
    work('Importing the model…', async () => {
      const m = await importModel();
      if (!m) return;
      setModel(m);
      if (result && extraction?.unparsed.length) {
        setBusy('Finding values…');
        await extract(result.text, m);
      }
    });

  function onRemoveModel() {
    removeModel();
    setModel(null);
  }

  function discard() {
    setResult(null);
    setExtraction(null);
    setDraft(null);
  }

  function saved() {
    discard(); // Guardrail 2: no report text or model output kept after the save.
    onDone();
  }

  if (draft) {
    return (
      <View style={styles.root}>
        <VerifyForm profileId={profile.id} initial={draft} onSaved={saved} onBack={() => setDraft(null)} />
      </View>
    );
  }

  const canAppend = result?.kind === 'images';
  const fromModel = extraction?.rows.filter((r) => r.origin === 'slm').length ?? 0;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Add a report</Text>
      <Text style={styles.body}>For {profile.name}. Files are read on this phone, then deleted. Nothing is saved yet.</Text>

      {result == null ? (
        <View style={styles.actions}>
          <Button title="Take a photo" disabled={!!busy} onPress={() => add(takePhoto, false)} />
          <Button title="Choose photos" disabled={!!busy} onPress={() => add(pickImages, false)} />
          <Button title="Choose a PDF" disabled={!!busy} onPress={() => add(pickPdf, false)} />
        </View>
      ) : (
        <>
          <Text style={styles.body}>
            {result.pageCount} page{result.pageCount === 1 ? '' : 's'}, {METHOD_LABEL[result.method]}.
            {extraction &&
              ` ${extraction.rows.length} value${extraction.rows.length === 1 ? '' : 's'} found` +
                (fromModel ? `, ${fromModel} by the local model` : '') +
                (extraction.date ? `. Report date ${extraction.date}.` : '. No report date found.')}
          </Text>
          <View style={styles.actions}>
            {canAppend && <Button title="Add a page: take a photo" disabled={!!busy} onPress={() => add(takePhoto, true)} />}
            {canAppend && <Button title="Add a page: choose photos" disabled={!!busy} onPress={() => add(pickImages, true)} />}
            {extraction && (
              <Button
                title="Review and save"
                disabled={!!busy}
                onPress={() => setDraft(draftFromExtraction(extraction, result.fileHashes))}
              />
            )}
            <Button title="Discard and start over" color="#b00020" disabled={!!busy} onPress={discard} />
          </View>
          {extraction && (
            <FlatList
              style={styles.list}
              data={extraction.rows}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <Text style={styles.row}>
                  {item.name}: {item.value} {item.unit}
                  {rangeLabel(item)}
                  {item.origin === 'slm' ? '  [model]' : ''}
                </Text>
              )}
              ListFooterComponent={
                extraction.unparsed.length ? (
                  <View style={styles.unparsed}>
                    <Text style={styles.body}>
                      {extraction.unparsed.length} line{extraction.unparsed.length === 1 ? '' : 's'} not read.{' '}
                      {SLM_NOTE[extraction.slm]}
                    </Text>
                    {extraction.unparsed.map((l, i) => (
                      <Text key={i} style={styles.mono}>
                        {l}
                      </Text>
                    ))}
                  </View>
                ) : null
              }
            />
          )}
        </>
      )}

      <View style={styles.model}>
        <Text style={styles.small}>
          {model ? `Local model imported (${mb(model.sizeBytes)}).` : 'No local model. Values are read by rules only.'}
        </Text>
        <Button title={model ? 'Replace model' : 'Import model (.gguf)'} disabled={!!busy} onPress={onImportModel} />
        {model && <Button title="Remove model" disabled={!!busy} onPress={onRemoveModel} />}
      </View>

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator />
          <Text style={styles.small}>{busy}</Text>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 56, gap: 12 },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16, color: '#333' },
  small: { fontSize: 13, color: '#555' },
  actions: { gap: 12 },
  list: { flex: 1 },
  row: { fontSize: 15, paddingVertical: 4, color: '#222' },
  unparsed: { marginTop: 12, gap: 4 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#444' },
  model: { gap: 8 },
  busy: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  error: { color: '#b00020' },
});
