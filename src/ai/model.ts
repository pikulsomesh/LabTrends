// The user-imported GGUF model and the llama.rn session that runs it. Device only.
// The model is never bundled or downloaded: the user picks the file, it is checked for the GGUF
// header and moved into app storage, and every extraction loads it and releases it afterwards.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { initLlama } from 'llama.rn';
import type { SlmSession } from './extract';
import { isGguf } from './gguf';

const modelDir = () => new Directory(Paths.document, 'models');
const modelFile = () => new File(modelDir(), 'slm.gguf');

export interface ModelInfo {
  uri: string;
  sizeBytes: number;
}

export function importedModel(): ModelInfo | null {
  const f = modelFile();
  return f.exists ? { uri: f.uri, sizeBytes: f.size ?? 0 } : null;
}

export class NotAModelError extends Error {
  constructor() {
    super('That file is not a GGUF model. Pick the .gguf file for Qwen2.5-1.5B-Instruct (or 0.5B) Q4.');
  }
}

/** Null when the user backs out of the picker. Replaces any model imported before. */
export async function importModel(): Promise<ModelInfo | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (r.canceled) return null;
  const pickedUri = r.assets[0].uri;
  const picked = new File(pickedUri);
  try {
    const handle = picked.open();
    let head: Uint8Array | null;
    try {
      head = handle.readBytes(4);
    } finally {
      handle.close();
    }
    if (!head || !isGguf(head)) throw new NotAModelError();

    const dir = modelDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = modelFile();
    if (dest.exists) dest.delete();
    await picked.move(dest);
    return importedModel();
  } finally {
    // move() repoints `picked` at the model, so check the picker path itself. After a failure the
    // copy must not stay in the cache.
    const leftover = new File(pickedUri);
    if (leftover.exists) leftover.delete();
  }
}

export function removeModel() {
  const f = modelFile();
  if (f.exists) f.delete();
}

export async function loadSlm(uri: string): Promise<SlmSession> {
  // CPU only and a small context: the prompt is at most a handful of report lines.
  const ctx = await initLlama({ model: uri, n_ctx: 2048, n_gpu_layers: 0 });
  return {
    async complete(system, user, schema) {
      const r = await ctx.completion({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_schema', json_schema: { strict: true, schema } },
        temperature: 0,
        n_predict: 768,
      });
      return r.text;
    },
    release: () => ctx.release(),
  };
}
