// Device side of ingestion: pickers, camera, ML Kit and the local native module, wired into the
// pure pipeline in ingest.ts. Needs a dev-client build; unit tests use fakes instead.
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as PdfText from 'expo-pdf-text-extract';
import * as Native from '../../modules/pdf-page-renderer';
import type { OcrLine } from '../utils/ocrLayout';
import { INGEST_CACHE_DIRS, type IngestDeps, type IngestInput } from './ingest';

export class CameraPermissionError extends Error {
  constructor() {
    super('LabTrends needs camera access to photograph a report. Allow it in Android Settings, or pick a photo instead.');
  }
}

async function ocrLines(uri: string): Promise<OcrLine[]> {
  const ocr = await TextRecognition.recognize(uri);
  return ocr.blocks.flatMap((b) => b.lines).filter((l) => l.frame).map((l) => ({ text: l.text, ...l.frame! }));
}

function deleteFile(uri: string) {
  const f = new File(uri);
  if (f.exists) f.delete();
}

export const deviceDeps: IngestDeps = {
  cacheDir: Paths.cache.uri,
  extractTextLayer: (uri) => PdfText.extractTextWithInfo(uri),
  getPageCount: Native.getPageCount,
  renderPage: async (uri, i) => (await Native.renderPage(uri, i)).uri,
  ocrImage: ocrLines,
  deleteFile,
  prepareImage: async (uri) => (await Native.prepareImage(uri)).uri,
  hashFile: Native.sha256File,
};

/** Null when the user backs out of the picker. */
export async function pickPdf(): Promise<IngestInput | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  return r.canceled ? null : { kind: 'pdf', uri: r.assets[0].uri };
}

/** Gallery photos in the order the user tapped them. No storage permission: Android's photo picker. */
export async function pickImages(): Promise<IngestInput | null> {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    orderedSelection: true,
    quality: 1,
  });
  return r.canceled ? null : { kind: 'images', uris: r.assets.map((a) => a.uri) };
}

export async function takePhoto(): Promise<IngestInput | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new CameraPermissionError();
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return r.canceled ? null : { kind: 'images', uris: r.assets.map((a) => a.uri) };
}

/** Deletes report files and page images left in the cache by an import the app did not finish. */
export function sweepIngestCache() {
  for (const name of INGEST_CACHE_DIRS) {
    try {
      const dir = new Directory(Paths.cache, name);
      if (dir.exists) dir.delete();
    } catch {
      // Best effort; the next launch tries again.
    }
  }
}

export const setSecure = Native.setSecure;
