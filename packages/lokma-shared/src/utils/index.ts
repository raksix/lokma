/**
 * Shared utils — DRY helpers used by CLI + Web + server.
 * Add only pure, dependency-free helpers; keep I/O in lokma-core.
 */

import { createHash } from 'node:crypto';

/** SHA-1 hex — used for .agentlocks/locks/<sha1(path)>.json */
export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Sync SHA-1 via Node crypto when SubtleCrypto unavailable (server). */
export function sha1HexSync(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

/** Mask a secret for API responses — returns keySet boolean + last4. */
export function maskKey(key: string | undefined): { keySet: boolean; last4: string | null } {
  if (!key) return { keySet: false, last4: null };
  return { keySet: true, last4: key.slice(-4) };
}

/** Normalize Turkish i/İ for vault routing — first 140 chars norm(). */
export function normTr(s: string): string {
  return s
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'i')
    .toLowerCase();
}
