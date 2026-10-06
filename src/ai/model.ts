// The GGUF model and the llama.rn session that runs it. Device only, never downloaded.
// Release builds from CI carry the model inside the APK (an Android asset, see
// plugins/withBundledSlm.js) and use it directly. A build without one falls back to a GGUF the
// user imports: it is checked for the GGUF header and moved into app storage. Every extraction
// loads the model and releases it afterwards.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { initLlama } from 'llama.rn';
import type { SlmSession } from './extract';
import { isGguf } from './gguf';

const modelDir = () => new Directory(Paths.document, 'models');
const modelFile = () => new File(modelDir(), 'slm.gguf');

export interface ModelInfo {
  /** A file URI, or for a bundled model the asset path inside the APK. */
  uri: string;
  sizeBytes: number;
  bundled: boolean;
}

/**
 * Asset path of the model built into this APK, or undefined. Metro inlines the variable at bundle
 * time; CI sets it only on the builds that pack the model.
 */
export const BUNDLED_MODEL_ASSET: string | undefined = process.env.EXPO_PUBLIC_BUNDLED_SLM || undefined;

export function importedModel(): ModelInfo | null {
  const f = modelFile();
  return f.exists ? { uri: f.uri, sizeBytes: f.size ?? 0, bundled: false } : null;
}

/** The model to use: the one built into the APK, else the one the user imported. */
export function activeModel(): ModelInfo | null {
  if (BUNDLED_MODEL_ASSET) return { uri: BUNDLED_MODEL_ASSET, sizeBytes: 0, bundled: true };
  return importedModel();
}

export class NotAModelError extends Error {
  constructor() {
    super('That file is not a GGUF model. Pick a .gguf file, for example Qwen3-0.6B Q4.');
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

export async function loadSlm(model: ModelInfo): Promise<SlmSession> {
  // CPU only and a small context: the prompt is one report line plus the rules.
  const ctx = await initLlama({
    model: model.uri,
    is_model_asset: model.bundled,
    n_ctx: 2048,
    n_gpu_layers: 0,
  });
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
