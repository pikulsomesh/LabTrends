// Backup file encryption (PLAN.md Phase 8, CLAUDE.md "never hand-roll crypto"): AES-256-GCM from
// @noble/ciphers with a key derived from the passphrase by Argon2id from @noble/hashes. Both are
// audited, pure-JS libraries, so the same code runs on the phone and under vitest.
//
// File layout: "LTBK" | version (1 byte) | header length (2 bytes, big endian) | header JSON |
// ciphertext with the 16-byte GCM tag. The header carries the KDF parameters, salt and nonce,
// and is authenticated as GCM associated data, so changing any of it makes decryption fail.
import { gcm } from '@noble/ciphers/aes.js';
import { argon2id } from '@noble/hashes/argon2.js';

export const MAGIC = 'LTBK';
export const VERSION = 1;

/** OWASP's minimum Argon2id setting (19 MiB, 2 passes). A few seconds on a phone. */
export const DEFAULT_KDF = { m: 19456, t: 2, p: 1 } as const;

export const MIN_PASSPHRASE = 8;

interface Header {
  kdf: 'argon2id';
  m: number;
  t: number;
  p: number;
  salt: string;
  nonce: string;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase does not open this backup, or the file was changed.');
  }
}

export class NotABackupError extends Error {
  constructor(detail: string) {
    super(`This is not a LabTrends backup file (${detail}).`);
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function deriveKey(passphrase: string, h: Header): Uint8Array {
  // NFC so the same passphrase typed on two keyboards gives the same key.
  return argon2id(enc.encode(passphrase.normalize('NFC')), unb64(h.salt), { m: h.m, t: h.t, p: h.p, dkLen: 32 });
}

export function encryptBackup(
  plain: Uint8Array,
  passphrase: string,
  randomBytes: (n: number) => Uint8Array,
  kdf: { m: number; t: number; p: number } = DEFAULT_KDF,
): Uint8Array {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  const header: Header = { kdf: 'argon2id', ...kdf, salt: b64(randomBytes(16)), nonce: b64(randomBytes(12)) };
  const headerBytes = enc.encode(JSON.stringify(header));
  const prefix = new Uint8Array(7 + headerBytes.length);
  prefix.set(enc.encode(MAGIC), 0);
  prefix[4] = VERSION;
  prefix[5] = headerBytes.length >> 8;
  prefix[6] = headerBytes.length & 0xff;
  prefix.set(headerBytes, 7);

  const key = deriveKey(passphrase, header);
  const sealed = gcm(key, unb64(header.nonce), prefix).encrypt(plain);
  key.fill(0);
  const out = new Uint8Array(prefix.length + sealed.length);
  out.set(prefix, 0);
  out.set(sealed, prefix.length);
  return out;
}

// Refuse KDF settings that would hang or exhaust memory on the phone; a real backup never has them.
const KDF_LIMITS = { m: [8192, 262144], t: [1, 10], p: [1, 4] } as const;

export function decryptBackup(file: Uint8Array, passphrase: string): Uint8Array {
  if (file.length < 7 || dec.decode(file.subarray(0, 4)) !== MAGIC) throw new NotABackupError('wrong file type');
  if (file[4] !== VERSION) throw new NotABackupError(`format version ${file[4]} is not supported by this app`);
  const len = (file[5] << 8) | file[6];
  if (7 + len + 16 > file.length) throw new NotABackupError('file is cut short');

  let header: Header;
  try {
    header = JSON.parse(dec.decode(file.subarray(7, 7 + len)));
  } catch {
    throw new NotABackupError('header is unreadable');
  }
  const okNum = (v: unknown, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  if (header?.kdf !== 'argon2id' || !okNum(header.m, KDF_LIMITS.m) || !okNum(header.t, KDF_LIMITS.t) || !okNum(header.p, KDF_LIMITS.p)) {
    throw new NotABackupError('unsupported key settings');
  }

  let nonce: Uint8Array;
  try {
    nonce = unb64(header.nonce);
    unb64(header.salt);
  } catch {
    throw new NotABackupError('header is unreadable');
  }
  if (nonce.length !== 12) throw new NotABackupError('header is unreadable');

  const key = deriveKey(passphrase, header);
  try {
    return gcm(key, nonce, file.subarray(0, 7 + len)).decrypt(file.subarray(7 + len));
  } catch {
    throw new WrongPassphraseError();
  } finally {
    key.fill(0);
  }
}
