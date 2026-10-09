// Verification (PLAN.md Phase 6): every extracted value as an editable row, with the report line it
// came from shown above it. Nothing reaches the database until the user taps Save, and then only
// through saveDraft. Values are shown as printed; no row is labelled good or bad (guardrail 4).
// A row is a number with a range, or a text result ("Trace", "Pale yellow") with its printed reference.
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { Report } from '../db';
import { useProfiles } from '../state/ActiveProfile';
import { datePattern, formatDate } from '../utils/dates';
import { swatchFor } from '../utils/textResults';
import { addManualRow, draftDate, removeRow, updateRow, type Draft, type DraftErrors, type DraftRow } from '../verify/draft';
import { findDuplicates, saveDraft } from '../verify/save';
import { Body, Button, Card, Chip, Heading, Input, Notice, Small, Title } from '../ui';
import { color, radius, space } from '../ui/theme';

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
  const { db, dateOrder } = useProfiles();
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
      const r = await saveDraft(db, profileId, draft, new Date(), dateOrder);
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
  const readDate = draftDate(draft, dateOrder);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Title>Check and save</Title>
      <Body>Compare each value with the line from the report. Fix anything that was misread, then save.</Body>

      {duplicates.length > 0 && (
        <Notice>
          This file was already saved for this profile ({duplicates.map((d) => d.date).join(', ')}). Saving again adds a second copy.
        </Notice>
      )}

      <Card>
        <Field label={`Collection date (${datePattern(dateOrder)})`} value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
        {err('date')}
        {/* The month as a word, so a day and month swapped by the wrong order is easy to spot. */}
        {readDate ? <Small>Reads as {formatDate(readDate, 'dmy')}. Day and month order is in Settings.</Small> : null}
        <Field label="Lab name (optional)" value={draft.labName} onChange={(labName) => setDraft({ ...draft, labName })} />
        <Field label="Category (optional)" value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
      </Card>

      <Heading>Values ({draft.rows.filter((r) => r.included).length} to save)</Heading>
      {err('rows')}
      {draft.rows.map((row) => (
        <Card key={row.key} style={!row.included && styles.cardOff}>
          {row.sourceLine ? <Text style={styles.source}>{row.sourceLine}</Text> : null}
          {ORIGIN_LABEL[row.origin] ? <Small>{ORIGIN_LABEL[row.origin]}</Small> : null}
          {row.specimen === 'urine' ? <Small>Urine test</Small> : null}
          <Field label="Test name" value={row.name} onChange={(name) => edit(row, { name })} />
          {err(`${row.key}.name`)}
          <View style={styles.kinds}>
            <Chip label="Number" selected={row.kind === 'number'} onPress={() => edit(row, { kind: 'number' })} />
            <Chip label="Text result" selected={row.kind === 'text'} onPress={() => edit(row, { kind: 'text' })} />
          </View>
          {row.kind === 'text' ? (
            <>
              <View style={styles.pair}>
                <Field label="Result as printed" value={row.value} onChange={(value) => edit(row, { value })} />
                <Field label="Unit" value={row.unit} onChange={(unit) => edit(row, { unit })} />
              </View>
              {swatchFor(row.value) ? (
                <View style={styles.swatchRow}>
                  <View style={[styles.swatch, { backgroundColor: swatchFor(row.value)! }]} />
                  <Small>{row.value.trim()}</Small>
                </View>
              ) : null}
              {err(`${row.key}.value`)}
              <Field label="Printed reference (optional)" value={row.rawRefText} onChange={(rawRefText) => edit(row, { rawRefText })} />
            </>
          ) : (
            <>
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
              {row.rawRefText ? <Small>Printed range: {row.rawRefText}</Small> : null}
            </>
          )}
          <View style={styles.rowActions}>
            <View style={styles.toggle}>
              <Switch
                value={row.included}
                onValueChange={(included) => edit(row, { included })}
                trackColor={{ false: color.line, true: color.primarySoft }}
                thumbColor={row.included ? color.primary : '#fff'}
              />
              <Small>{row.included ? 'Save this value' : 'Skipped'}</Small>
            </View>
            <Button title="Remove" variant="danger" style={styles.small} onPress={() => setDraft((d) => removeRow(d, row.key))} />
          </View>
        </Card>
      ))}

      {draft.unparsed.length > 0 && (
        <>
          <Heading>Lines not read</Heading>
          {draft.unparsed.map((line, i) => (
            <Card key={`${i}:${line}`}>
              <Text style={styles.source}>{line}</Text>
              <Button title="Enter this value" variant="soft" onPress={() => setDraft((d) => addManualRow(d, line))} />
            </Card>
          ))}
        </>
      )}

      <Button title="Add a value by hand" variant="soft" onPress={() => setDraft((d) => addManualRow(d))} />
      {hasErrors && <Notice tone="error">Fix the fields marked above, then save.</Notice>}
      <View style={styles.actions}>
        <Button title={saving ? 'Saving…' : 'Save report'} disabled={saving} onPress={save} />
        <Button title="Back" variant="ghost" disabled={saving} onPress={onBack} />
      </View>
    </ScrollView>
  );
}

function Field({ label, value, onChange, numeric }: { label: string; value: string; onChange(v: string): void; numeric?: boolean }) {
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChange}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      autoCorrect={false}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, marginHorizontal: -space.xl },
  content: { gap: space.md, paddingHorizontal: space.xl, paddingBottom: 48 },
  cardOff: { opacity: 0.55 },
  source: { fontFamily: 'monospace', fontSize: 12, color: color.ink, backgroundColor: color.bg, padding: space.sm, borderRadius: radius.sm },
  pair: { flexDirection: 'row', gap: space.sm },
  kinds: { flexDirection: 'row', gap: space.sm },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: color.line },
  input: { paddingVertical: 10, fontSize: 15 },
  rowActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  small: { minHeight: 40, paddingVertical: 6, paddingHorizontal: space.lg },
  actions: { gap: space.sm, marginTop: space.sm },
  error: { color: color.danger, fontSize: 13 },
});
