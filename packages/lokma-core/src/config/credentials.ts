import { readFile } from 'node:fs/promises';
import { CredentialsSchema, type Credentials } from 'lokma-shared';
import { expandHome, writeAtomic } from '../utils/fs.js';
import { decrypt, encrypt, getEncryptionKey, isEncrypted } from '../utils/crypto.js';

const CRED_PATH = '~/.lokma/credentials.json';

/**
 * Load credentials — handles both encrypted (base64 blob) and plain JSON (0600 fallback).
 * See Docs/26 §4: 0600 + AES-256-GCM when LOKMA_ENCRYPTION_KEY set.
 */

export async function loadCredentials(): Promise<Credentials> {
  const fallback = CredentialsSchema.parse({ version: 1, providers: {}, oauth: {} });
  try {
    const raw = await readFile(expandHome(CRED_PATH), 'utf-8');
    const trimmed = raw.trim();
    if (!trimmed) return fallback;

    if (isEncrypted(trimmed)) {
      const key = getEncryptionKey();
      if (!key) {
        console.warn('[lokma] credentials.json is encrypted but LOKMA_ENCRYPTION_KEY not set — returning empty');
        return fallback;
      }
      const json = decrypt(trimmed, key);
      return CredentialsSchema.parse(JSON.parse(json));
    }

    return CredentialsSchema.parse(JSON.parse(trimmed));
  } catch {
    return fallback;
  }
}

export async function saveCredentials(provider: string, apiKey: string): Promise<void> {
  const cur = await loadCredentials();
  const next: Credentials = {
    ...cur,
    providers: {
      ...cur.providers,
      [provider]: { apiKey, oauth: null },
    },
  };
  const json = JSON.stringify(CredentialsSchema.parse(next), null, 2);
  const key = getEncryptionKey();
  const payload = key ? encrypt(json, key) : json;
  await writeAtomic(CRED_PATH, payload, 0o600);
}

/** Masked view for GET /api/config — never leaks raw keys. */
export async function getMaskedCredentials(): Promise<Record<string, { keySet: boolean; last4: string | null }>> {
  const creds = await loadCredentials();
  // Env overrides also count as keySet
  const envProviders: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
  };
  const out: Record<string, { keySet: boolean; last4: string | null }> = {};
  const allIds = new Set([...Object.keys(creds.providers), ...Object.keys(envProviders)]);
  for (const id of allIds) {
    const fileKey = (creds.providers[id] as { apiKey?: string } | undefined)?.apiKey;
    const envKey = envProviders[id];
    const key = envKey ?? fileKey;
    out[id] = { keySet: !!key, last4: key ? key.slice(-4) : null };
  }
  // Always include known providers even if empty
  for (const id of ['anthropic', 'openai', 'deepseek', 'google', 'ollama', 'openrouter']) {
    if (!out[id]) out[id] = { keySet: false, last4: null };
  }
  return out;
}
