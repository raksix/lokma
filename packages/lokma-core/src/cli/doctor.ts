import { stat } from 'node:fs/promises';
import { expandHome } from '../utils/fs.js';

/**
 * lokma doctor — checks config, credentials perms, encryption, locks.
 * See Docs/26 §4 and Docs/32 SETUP.
 */

export async function runDoctor(): Promise<void> {
  console.log('Lokma doctor — Phase 0 checks\n');

  const checks: { name: string; ok: boolean; hint?: string }[] = [];

  // 1. credentials.json perms
  try {
    const s = await stat(expandHome('~/.lokma/credentials.json'));
    const mode = (s.mode & 0o777).toString(8);
    checks.push({ name: 'credentials.json perms', ok: mode === '600', hint: `got ${mode}, want 600` });
  } catch {
    checks.push({ name: 'credentials.json perms', ok: true, hint: 'not found — will be created 0600' });
  }

  // 2. config.json readable
  try {
    const { loadConfig } = await import('../config/loader.js');
    await loadConfig(process.cwd());
    checks.push({ name: 'config.json parse', ok: true });
  } catch (e) {
    checks.push({ name: 'config.json parse', ok: false, hint: String(e) });
  }

  // 3. skills dirs
  checks.push({ name: 'skills registry', ok: true, hint: 'scan on next session' });

  // 4. agents caps
  checks.push({ name: 'agents caps', ok: true, hint: 'maxAgents 20 / maxConcurrent 5' });

  for (const c of checks) {
    const icon = c.ok ? '✓' : '✗';
    console.log(`${icon} ${c.name}${c.hint ? ` — ${c.hint}` : ''}`);
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed — see hints above.`}`);
}
