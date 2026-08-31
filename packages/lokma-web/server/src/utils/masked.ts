import { loadConfig } from 'lokma-core';
import { getMaskedCredentials } from 'lokma-core';

/**
 * Masked config for GET /api/config — never leaks raw apiKey.
 * Returns keySet boolean per provider, same as Docs/26 §4.
 */

export async function getMaskedConfig(cwd: string): Promise<Record<string, unknown>> {
  const cfg = await loadConfig(cwd);
  const creds = await getMaskedCredentials();
  return {
    ...cfg,
    // Override providers with masked creds
    _credentials: creds,
  };
}
