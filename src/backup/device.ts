// Device side of Phase 8: print the PDF summary, write and share the encrypted backup, and read a
// backup back. Every file is made in the app cache, handed to the Android share sheet, and deleted
// when the sheet closes (the startup sweep catches any left behind). The app itself sends nothing.
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { DISCLAIMER } from '../components/Disclaimer';
import type { Db } from '../db/types';
import { decryptBackup, encryptBackup } from './crypto';
import { collectBackup, parseBackup, restoreBackup, type RestoreSummary } from './data';
import { loadSummary, summaryHtml } from './summaryHtml';

const today = () => new Date().toISOString().slice(0, 10);

function deleteQuietly(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // The startup sweep removes it next time.
  }
}

async function shareThenDelete(uri: string, mimeType: string, dialogTitle: string) {
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
    await Sharing.shareAsync(uri, { mimeType, dialogTitle });
  } finally {
    deleteQuietly(uri);
  }
}

export async function sharePdfSummary(db: Db, profileId: number, profileName: string) {
  const html = summaryHtml(profileName, await loadSummary(db, profileId), DISCLAIMER);
  const { uri } = await Print.printToFileAsync({ html });
  await shareThenDelete(uri, 'application/pdf', 'Save or send the PDF summary');
}

/** Runs the slow key derivation after the next frame, so the busy indicator shows first. */
const afterFrame = () => new Promise<void>((r) => setTimeout(r, 50));

export async function shareBackup(db: Db, passphrase: string) {
  const data = await collectBackup(db);
  await afterFrame();
  const file = encryptBackup(new TextEncoder().encode(JSON.stringify(data)), passphrase, Crypto.getRandomBytes);
  const dir = new Directory(Paths.cache, 'export');
  if (!dir.exists) dir.create({ intermediates: true });
  const out = new File(dir, `labtrends-backup-${today()}.ltbackup`);
  if (out.exists) out.delete();
  out.create();
  out.write(file);
  await shareThenDelete(out.uri, 'application/octet-stream', 'Save the encrypted backup');
}

/** Null when the user backs out of the picker. */
export async function pickAndRestore(db: Db, passphrase: string): Promise<RestoreSummary | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (r.canceled) return null;
  const uri = r.assets[0].uri;
  try {
    const bytes = await new File(uri).bytes();
    await afterFrame();
    const plain = decryptBackup(bytes, passphrase);
    return await restoreBackup(db, parseBackup(JSON.parse(new TextDecoder().decode(plain))));
  } finally {
    deleteQuietly(uri);
  }
}
