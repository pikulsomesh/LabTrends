// Add a report: photograph it, pick photos, or pick a PDF, read its text, pull out candidate
// values (parser first, the imported local model for lines the parser cannot read), then check
// and save them on the verification form. Text and candidates live in this screen's state only:
// they are dropped on leaving, and cleared as soon as the report is saved.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSecureScreen } from '../components/useSecureScreen';
import VerifyForm from '../components/VerifyForm';
import { extractReport, type Extraction, type ExtractedRow } from '../ai/extract';
import { activeModel, importModel, loadSlm, removeModel, type ModelInfo } from '../ai/model';
import { appendPages, ingest, type Extracted, type IngestInput } from '../ingest/ingest';
import { deviceDeps, pickImages, pickPdf, takePhoto } from '../ingest/native';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';
import { formatDate } from '../utils/dates';
import { draftFromExtraction, type Draft } from '../verify/draft';
import { Body, Busy, Button, Card, Heading, Notice, Screen, Small, Title } from '../ui';
import { color, radius, space } from '../ui/theme';

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
  const { dateOrder } = useProfiles();
  const [result, setResult] = useState<Extracted | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [model, setModel] = useState<ModelInfo | null>(() => activeModel());
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
    setExtraction(await extractReport(text, m ? () => loadSlm(m) : null, { dateOrder, today: new Date() }));
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
    setModel(activeModel());
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
      <Screen fixed>
        <VerifyForm profileId={profile.id} initial={draft} onSaved={saved} onBack={() => setDraft(null)} />
      </Screen>
    );
  }

  const canAppend = result?.kind === 'images';
  const fromModel = extraction?.rows.filter((r) => r.origin === 'slm').length ?? 0;

  return (
    <Screen>
      <Title>Add a report</Title>
      <Body>For {profile.name}. Files are read on this phone, then deleted. Nothing is saved yet.</Body>

      {result == null ? (
        <View style={styles.actions}>
          <Button title="Take a photo" disabled={!!busy} onPress={() => add(takePhoto, false)} />
          <Button title="Choose photos" variant="soft" disabled={!!busy} onPress={() => add(pickImages, false)} />
          <Button title="Choose a PDF" variant="soft" disabled={!!busy} onPress={() => add(pickPdf, false)} />
        </View>
      ) : (
        <>
          <Card tint={color.primarySoft}>
            <Text style={styles.summary}>
              {result.pageCount} page{result.pageCount === 1 ? '' : 's'}, {METHOD_LABEL[result.method]}.
              {extraction &&
                ` ${extraction.rows.length} value${extraction.rows.length === 1 ? '' : 's'} found` +
                  (fromModel ? `, ${fromModel} by the local model` : '') +
                  (extraction.date ? `. Report date ${formatDate(extraction.date, dateOrder)}.` : '. No report date found.')}
            </Text>
          </Card>
          <View style={styles.actions}>
            {extraction && (
              <Button
                title="Review and save"
                disabled={!!busy}
                onPress={() => setDraft(draftFromExtraction(extraction, result.fileHashes, dateOrder))}
              />
            )}
            {canAppend && <Button title="Add a page: take a photo" variant="soft" disabled={!!busy} onPress={() => add(takePhoto, true)} />}
            {canAppend && <Button title="Add a page: choose photos" variant="soft" disabled={!!busy} onPress={() => add(pickImages, true)} />}
            <Button title="Discard and start over" variant="danger" disabled={!!busy} onPress={discard} />
          </View>
          {extraction && extraction.rows.length > 0 && (
            <Card>
              <Heading>Found so far</Heading>
              {extraction.rows.map((item, i) => (
                <Text key={i} style={styles.row}>
                  {item.name}: {item.valueText ?? item.value} {item.unit}
                  {rangeLabel(item)}
                  {item.origin === 'slm' ? '  [model]' : ''}
                </Text>
              ))}
            </Card>
          )}
          {extraction && extraction.unparsed.length > 0 && (
            <Card>
              <Body>
                {extraction.unparsed.length} line{extraction.unparsed.length === 1 ? '' : 's'} not read. {SLM_NOTE[extraction.slm]}
              </Body>
              {extraction.unparsed.map((l, i) => (
                <Text key={i} style={styles.mono}>
                  {l}
                </Text>
              ))}
            </Card>
          )}
        </>
      )}

      <View style={styles.model}>
        {model?.bundled ? (
          <Small>Built-in local model ready. Values it reads still go through review.</Small>
        ) : (
          <>
            <Small>{model ? `Local model imported (${mb(model.sizeBytes)}).` : 'No local model. Values are read by rules only.'}</Small>
            <Button title={model ? 'Replace model' : 'Import model (.gguf)'} variant="ghost" disabled={!!busy} onPress={onImportModel} />
            {model && <Button title="Remove model" variant="ghost" disabled={!!busy} onPress={onRemoveModel} />}
          </>
        )}
      </View>

      {busy && <Busy label={busy} />}
      {error && <Notice tone="error">{error}</Notice>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md },
  summary: { fontSize: 16, lineHeight: 23, color: color.ink },
  row: { fontSize: 15, paddingVertical: 4, color: color.ink },
  mono: { fontFamily: 'monospace', fontSize: 12, color: color.inkSoft, backgroundColor: color.bg, padding: space.sm, borderRadius: radius.sm },
  model: { gap: space.sm, marginTop: space.sm },
});
