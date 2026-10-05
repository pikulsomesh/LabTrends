// Verification (PLAN.md Phase 6): every extracted value as an editable row, with the report line it
// came from shown above it. Nothing reaches the database until the user taps Save, and then only
// through saveDraft. Values are shown as printed; no row is labelled good or bad (guardrail 4).
import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { Report } from '../db';
import { useProfiles } from '../state/ActiveProfile';
import { addManualRow, removeRow, updateRow, type Draft, type DraftErrors, type DraftRow } from '../verify/draft';
import { findDuplicates, saveDraft } from '../verify/save';

interface Props {
  profileId: number;
  initial: Draft;
  onSaved(reportId: number): void;
  onBack(): void;
}

const ORIGIN_LABEL: Record<DraftRow['origin'], string> = {
  parser: '',
  slm: 'Read by the local model. Check it against the line.',
  manual: 'Added by you.',
};

export default function VerifyForm({ profileId, initial, onSaved, onBack }: Props) {
  const { db } = useProfiles();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [duplicates, setDuplicates] = useState<Report[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    findDuplicates(db, profileId, initial.fileHashes).then((d) => live && setDuplicates(d));
    return () => {
      live = false;
    };
  }, [db, profileId, initial.fileHashes]);

  const edit = (row: DraftRow, patch: Parameters<typeof updateRow>[2]) => setDraft((d) => updateRow(d, row.key, patch));

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const r = await saveDraft(db, profileId, draft);
      if (r.ok) onSaved(r.reportId);
      else setErrors(r.errors);
    } catch (e) {
      Alert.alert('Could not save the report', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const err = (k: string) => (errors[k] ? <Text style={styles.error}>{errors[k]}</Text> : null);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Check and save</Text>
      <Text style={styles.body}>Compare each value with the line from the report. Fix anything that was misread, then save.</Text>

      {duplicates.length > 0 && (
        <Text style={styles.warning}>
          This file was already saved for this profile ({duplicates.map((d) => d.date).join(', ')}). Saving again adds a second copy.
        </Text>
      )}

      <Field label="Collection date (yyyy-mm-dd)" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
      {err('date')}
      <Field label="Lab name (optional)" value={draft.labName} onChange={(labName) => setDraft({ ...draft, labName })} />
      <Field label="Category (optional)" value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />

      <Text style={styles.heading}>Values ({draft.rows.filter((r) => r.included).length} to save)</Text>
      {err('rows')}
      {draft.rows.map((row) => (
        <View key={row.key} style={[styles.card, !row.included && styles.cardOff]}>
          {row.sourceLine ? <Text style={styles.source}>{row.sourceLine}</Text> : null}
          {ORIGIN_LABEL[row.origin] ? <Text style={styles.small}>{ORIGIN_LABEL[row.origin]}</Text> : null}
          <Field label="Test name" value={row.name} onChange={(name) => edit(row, { name })} />
          {err(`${row.key}.name`)}
          <View style={styles.pair}>
            <Field label="Value" value={row.value} numeric onChange={(value) => edit(row, { value })} />
            <Field label="Unit" value={row.unit} onChange={(unit) => edit(row, { unit })} />
          </View>
          {err(`${row.key}.value`)}
          <View style={styles.pair}>
            <Field label="Range low" value={row.refLow} numeric onChange={(refLow) => edit(row, { refLow })} />
            <Field label="Range high" value={row.refHigh} numeric onChange={(refHigh) => edit(row, { refHigh })} />
          </View>
          {err(`${row.key}.refLow`)}
          {err(`${row.key}.refHigh`)}
          {row.rawRefText ? <Text style={styles.small}>Printed range: {row.rawRefText}</Text> : null}
          <View style={styles.rowActions}>
            <View style={styles.toggle}>
              <Switch value={row.included} onValueChange={(included) => edit(row, { included })} />
              <Text style={styles.small}>{row.included ? 'Save this value' : 'Skipped'}</Text>
            </View>
            <Button title="Remove" color="#b00020" onPress={() => setDraft((d) => removeRow(d, row.key))} />
          </View>
        </View>
      ))}

      {draft.unparsed.length > 0 && (
        <>
          <Text style={styles.heading}>Lines not read</Text>
          {draft.unparsed.map((line, i) => (
            <View key={`${i}:${line}`} style={styles.card}>
              <Text style={styles.source}>{line}</Text>
              <Button title="Enter this value" onPress={() => setDraft((d) => addManualRow(d, line))} />
            </View>
          ))}
        </>
      )}

      <Button title="Add a value by hand" onPress={() => setDraft((d) => addManualRow(d))} />
      {hasErrors && <Text style={styles.error}>Fix the fields marked above, then save.</Text>}
      <View style={styles.actions}>
        <Button title={saving ? 'Saving…' : 'Save report'} disabled={saving} onPress={save} />
        <Button title="Back" disabled={saving} onPress={onBack} />
      </View>
    </ScrollView>
  );
}

function Field({ label, value, onChange, numeric }: { label: string; value: string; onChange(v: string): void; numeric?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.small}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCorrect={false}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 10, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '600' },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  body: { fontSize: 15, color: '#333' },
  small: { fontSize: 12, color: '#555' },
  warning: { fontSize: 14, color: '#7a4b00', backgroundColor: '#fff4e0', padding: 8, borderRadius: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 6, padding: 10, gap: 6 },
  cardOff: { opacity: 0.5 },
  source: { fontFamily: 'monospace', fontSize: 12, color: '#222', backgroundColor: '#f2f2f2', padding: 6 },
  pair: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, gap: 2 },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 6, fontSize: 15, color: '#111' },
  rowActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { gap: 12, marginTop: 8 },
  error: { color: '#b00020', fontSize: 13 },
});
