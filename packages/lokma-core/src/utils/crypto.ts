import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * AES-256-GCM encrypt/decrypt for credentials.json.
 * Key: 32-byte hex from LOKMA_ENCRYPTION_KEY env or derived.
 * Kept in lokma-core so both CLI and server reuse the same logic (DRY).
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** Derive 32-byte key from hex env or generate ephemeral (warn). */
export function getEncryptionKey(): Buffer | null {
  const hex = process.env.LOKMA_ENCRYPTION_KEY;
  if (!hex) return null;
  // Accept 64 hex chars (32 bytes) or raw 32 bytes base64
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  return Buffer.from(hex, 'utf-8').subarray(0, 32);
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as base64: iv + tag + ciphertext
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf-8');
}

/** Whether credentials file is encrypted (base64 blob vs JSON). */
export function isEncrypted(raw: string): boolean {
  const trimmed = raw.trim();
  // Encrypted is single base64 line, JSON starts with {
  return !trimmed.startsWith('{') && !trimmed.startsWith('[');
}
