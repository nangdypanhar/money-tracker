/**
 * Cloud backup cryptography. Web Crypto only (AES-256-GCM, HKDF-SHA-256, SHA-256) plus the built-in gzip
 * CompressionStream — no custom algorithms. Runs in browsers and Node 24 (for scripts/finance-check.ts).
 *
 * Envelope encryption:
 *   recovery key (160 random bits, shown once) ─HKDF→ auth id + auth password (cloud login)
 *                                               └HKDF→ KEK (wraps the data key)
 *   data key (DEK, random AES-256-GCM) encrypts each snapshot; only the KEK-wrapped DEK goes to the server.
 * The server never sees the recovery key, the KEK, or the DEK, so it can't decrypt backups.
 */

const RECOVERY_BYTES = 20;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648 base32
const CHECK_CHARS = 4;
const HKDF_SALT = new TextEncoder().encode("moneytrack-cloud-backup-v1");

export const SNAPSHOT_FORMAT = 1;

// ---------------------------------------------------------------------------------------------- encoding

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(text: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}

// ---------------------------------------------------------------------------------------------- recovery key

/** A new recovery key: 160 random bits + a 4-character checksum, as 9 groups of 4 ("ABCD-EFGH-…"). */
export async function generateRecoveryKey(): Promise<string> {
  return formatRecoveryKey(crypto.getRandomValues(new Uint8Array(RECOVERY_BYTES)));
}

async function formatRecoveryKey(bytes: Uint8Array): Promise<string> {
  const body = base32(bytes);
  const check = base32(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))).slice(0, CHECK_CHARS);
  return (body + check).match(/.{4}/g)!.join("-");
}

export type ParsedRecoveryKey = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

/** Accepts any spacing, dashes, or case. Detects typos with the checksum instead of failing later. */
export async function parseRecoveryKey(input: string): Promise<ParsedRecoveryKey> {
  const text = input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/0/g, "O").replace(/1/g, "I").replace(/8/g, "B");
  const length = Math.ceil((RECOVERY_BYTES * 8) / 5) + CHECK_CHARS;
  if (text.length !== length || [...text].some((c) => !ALPHABET.includes(c))) {
    return { ok: false, error: "That doesn't look like a MoneyTrack recovery key." };
  }
  const bytes = unbase32(text.slice(0, -CHECK_CHARS)).slice(0, RECOVERY_BYTES);
  const expected = await formatRecoveryKey(bytes);
  if (expected.replace(/-/g, "") !== text) return { ok: false, error: "That recovery key has a typo — check each group." };
  return { ok: true, bytes };
}

// ---------------------------------------------------------------------------------------------- key derivation

export interface CloudCredentials {
  /** Login email made from the recovery key; no mail is ever sent to it. */
  email: string;
  password: string;
}

async function hkdf(root: Uint8Array, info: string, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", root as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: new TextEncoder().encode(info) },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** Independent HKDF outputs: knowing the login password reveals nothing about the KEK. */
export async function deriveFromRecoveryKey(
  recovery: Uint8Array,
  emailDomain: string,
): Promise<{ credentials: CloudCredentials; kek: CryptoKey }> {
  const [id, password, kekBytes] = await Promise.all([
    hkdf(recovery, "moneytrack auth id", 16),
    hkdf(recovery, "moneytrack auth password", 32),
    hkdf(recovery, "moneytrack key-encryption key", 32),
  ]);
  const kek = await crypto.subtle.importKey("raw", kekBytes as BufferSource, "AES-GCM", false, ["wrapKey", "unwrapKey"]);
  return { credentials: { email: `mt-${toHex(id)}@${emailDomain}`, password: toBase64(password) }, kek };
}

// ---------------------------------------------------------------------------------------------- data key

export interface WrappedKey {
  iv: string;
  wrapped: string;
}

/** A new data key, already wrapped for the server, plus a non-extractable copy for this device. */
export async function createDataKey(kek: CryptoKey): Promise<{ dek: CryptoKey; wrapped: WrappedKey }> {
  const extractable = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", extractable, kek, { name: "AES-GCM", iv }));
  const wrappedKey = { iv: toBase64(iv), wrapped: toBase64(wrapped) };
  return { dek: await unwrapDataKey(kek, wrappedKey), wrapped: wrappedKey };
}

/** Throws (OperationError) when the KEK is wrong — i.e. the recovery key belongs to a different backup. */
export async function unwrapDataKey(kek: CryptoKey, wrapped: WrappedKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(wrapped.wrapped) as BufferSource,
    kek,
    { name: "AES-GCM", iv: fromBase64(wrapped.iv) as BufferSource },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------------------------------------------- snapshots

/** Bound into each ciphertext (GCM additional data): a snapshot can't be moved to another user, device, or revision. */
export interface SnapshotContext {
  format: number;
  userId: string;
  deviceId: string;
  snapshotId: string;
  revision: number;
}

const contextBytes = (c: SnapshotContext) =>
  new TextEncoder().encode(JSON.stringify([c.format, c.userId, c.deviceId, c.snapshotId, c.revision]));

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface SealedSnapshot {
  iv: string;
  ciphertext: string;
  sha256: string;
}

export async function sealSnapshot(dek: CryptoKey, plaintext: string, context: SnapshotContext): Promise<SealedSnapshot> {
  const compressed = await pipe(new TextEncoder().encode(plaintext), new CompressionStream("gzip"));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: contextBytes(context) as BufferSource }, dek, compressed as BufferSource),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext), sha256: await sha256Hex(ciphertext) };
}

/**
 * Verify the hash, decrypt (fails on a wrong key, tampering, or a mismatched context), and decompress.
 * Returns the plaintext JSON string; the caller still validates it as a backup.
 */
export async function openSnapshot(dek: CryptoKey, sealed: SealedSnapshot, context: SnapshotContext): Promise<string> {
  const ciphertext = fromBase64(sealed.ciphertext);
  if ((await sha256Hex(ciphertext)) !== sealed.sha256) throw new Error("The backup is damaged (checksum mismatch).");
  let compressed: ArrayBuffer;
  try {
    compressed = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.iv) as BufferSource, additionalData: contextBytes(context) as BufferSource },
      dek,
      ciphertext as BufferSource,
    );
  } catch {
    throw new Error("This backup can't be decrypted with this recovery key, or it was altered.");
  }
  return new TextDecoder().decode(await pipe(new Uint8Array(compressed), new DecompressionStream("gzip")));
}
