// Phase 0 feasibility spike. Throwaway UI: measures extraction, OCR, parser and SLM on-device.
// Nothing here writes to a DB. Text lives in component state only; picked files are deleted after use.
import { useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as PdfText from 'expo-pdf-text-extract';
import { initLlama, type LlamaContext } from 'llama.rn';
import * as PdfPages from '../../modules/pdf-page-renderer';
import { extractPdfText, type PdfDeps } from '../ingest/pdf';
import { rebuildRows, type OcrLine } from '../utils/ocrLayout';
import { parseReport } from '../utils/parser';

const SLM_PROMPT = (lines: string[]) =>
  `Extract lab results from these lines as JSON array of {"name","value","unit","ref_low","ref_high"}. Output JSON only.\n\n${lines.join('\n')}`;

async function ocrLines(uri: string): Promise<OcrLine[]> {
  const ocr = await TextRecognition.recognize(uri);
  return ocr.blocks.flatMap((b) => b.lines).filter((l) => l.frame).map((l) => ({ text: l.text, ...l.frame! }));
}

const ms = (t0: number) => `${Math.round(performance.now() - t0)} ms`;

export default function SpikeScreen() {
  const [log, setLog] = useState<string[]>([]);
  const [text, setText] = useState('');
  const llama = useRef<LlamaContext | null>(null);
  const modelFile = useRef<File | null>(null);
  const add = (s: string) => setLog((l) => [...l, s]);

  async function pick(types: string[]) {
    const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
    return r.canceled ? null : r.assets[0];
  }

  async function ingest() {
    const a = await pick(['application/pdf', 'image/*']);
    if (!a) return;
    try {
      const t0 = performance.now();
      let out = '';
      if (a.mimeType === 'application/pdf') {
        const deps: PdfDeps = {
          extractTextLayer: async (uri) => {
            const info = await PdfText.extractTextWithInfo(uri);
            add(`PDF info: pages=${info.pageCount} success=${info.success} encrypted=${info.isEncrypted} err=${info.errorCode ?? '-'} ${info.error ?? ''}`);
            add(`PDF text layer: ${info.text.trim().length} chars in ${ms(t0)}`);
            return info;
          },
          getPageCount: PdfPages.getPageCount,
          renderPage: async (uri, i) => {
            const t = performance.now();
            const page = await PdfPages.renderPage(uri, i);
            add(`  page ${i + 1}: rendered ${page.width}x${page.height} in ${ms(t)}`);
            return page.uri;
          },
          ocrImage: async (uri) => {
            const t = performance.now();
            const lines = await ocrLines(uri);
            add(`  OCR: ${lines.length} lines in ${ms(t)}`);
            return lines;
          },
          deleteFile: (uri) => new File(uri).delete(),
        };
        const r = await extractPdfText(a.uri, deps);
        out = r.text;
        add(r.source === 'ocr'
          ? `No usable text layer (${r.reason}${r.textLayerError ? `: ${r.textLayerError}` : ''}): render + OCR gave ${out.length} chars in ${ms(t0)}`
          : `Using text layer (${out.trim().length} chars)`);
      } else {
        const lines = await ocrLines(a.uri);
        out = rebuildRows(lines);
        add(`OCR: ${out.length} chars, ${lines.length} lines in ${ms(t0)} (rows rebuilt from boxes)`);
      }
      setText(out);
      const t1 = performance.now();
      const p = parseReport(out);
      add(`Parser: ${p.rows.length} rows, ${p.unparsed.length} unparsed, date=${p.date} in ${ms(t1)}`);
      p.unparsed.forEach((u) => add(`  unparsed: ${u}`));
    } catch (e) {
      add(`ERROR: ${String(e)}`);
    } finally {
      new File(a.uri).delete(); // guardrail 2: no cached copies left behind
    }
  }

  async function loadModel() {
    const a = await pick(['*/*']);
    if (!a) return;
    const t0 = performance.now();
    llama.current = await initLlama({ model: a.uri, n_ctx: 2048, n_gpu_layers: 0 });
    modelFile.current = new File(a.uri);
    add(`Model loaded (${a.name}, ${((a.size ?? 0) / 1e6).toFixed(0)} MB) in ${ms(t0)}. Note RAM in Android Studio profiler / adb dumpsys meminfo.`);
  }

  async function runSlm() {
    if (!llama.current) return add('Load a model first');
    const unparsed = parseReport(text).unparsed;
    const lines = unparsed.length ? unparsed : text.split('\n').filter((l) => /\d/.test(l)).slice(0, 15);
    const t0 = performance.now();
    const r = await llama.current.completion({ prompt: SLM_PROMPT(lines), n_predict: 400, temperature: 0 });
    add(`SLM: ${ms(t0)}, ${r.timings?.predicted_per_second?.toFixed(1)} tok/s`);
    add(r.text);
  }

  async function release() {
    await llama.current?.release();
    llama.current = null;
    modelFile.current?.delete();
    modelFile.current = null;
    add('Model released, cache copy deleted');
  }

  return (
    <ScrollView contentContainerStyle={s.c}>
      <Text style={s.h}>LabTrends Phase 0 spike</Text>
      <Button title="1. Pick PDF or image → extract + parse" onPress={ingest} />
      <Button title="2. Load GGUF model" onPress={loadModel} />
      <Button title="3. Run SLM on unparsed lines" onPress={runSlm} />
      <Button title="4. Release model" onPress={release} />
      <View>{log.map((l, i) => <Text key={i} style={s.m} selectable>{l}</Text>)}</View>
      <Text style={s.h}>Extracted text (memory only)</Text>
      <Text style={s.m} selectable>{text}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { padding: 16, paddingTop: 56, gap: 8 },
  h: { fontSize: 18, fontWeight: '600', marginTop: 8, color: '#888' },
  m: { fontFamily: 'monospace', fontSize: 12, color: '#888' },
});
