import { stat } from 'node:fs/promises';
import { expandHome } from '../utils/fs.js';

/**
 * lokma doctor — 8 real subsystem checks (mirrors `GET /api/doctor` in
 * `packages/lokma-web/server/src/routes/setup.ts`, minus the server-only
 * provider-views/models-catalog probes which need lokma-ai + the web server).
 * Every check reads real state; failures carry detail, nothing is invented.
 * See Docs/26 §4 and Docs/32 §7.
 */

type Check = { name: string; ok: boolean; hint?: string };

export async function runDoctor(): Promise<void> {
  console.log('Lokma doctor — 8 subsystem checks\n');

  const checks: Check[] = [];
  const { loadConfig } = await import('../config/loader.js');

  // 1. config.json parses
  try {
    const cfg = await loadConfig(process.cwd());
    checks.push({ name: 'config', ok: true, hint: `theme ${cfg.theme} · model ${cfg.defaultModel}` });
  } catch (e) {
    checks.push({ name: 'config', ok: false, hint: String(e).slice(0, 160) });
  }

  // 2. credentials.json perms + keySet count
  try {
    const { getMaskedCredentials } = await import('../config/credentials.js');
    let mode: string | null = null;
    try {
      const s = await stat(expandHome('~/.lokma/credentials.json'));
      mode = (s.mode & 0o777).toString(8);
    } catch {
      checks.push({ name: 'credentials', ok: true, hint: 'not created yet — written 0600 on the first key save' });
    }
    if (mode !== null) {
      const masked = await getMaskedCredentials();
      const ids = Object.keys(masked);
      const withKey = ids.filter((id) => masked[id]?.keySet).length;
      const perms = mode === '600' ? '0600' : `perms ${mode} (want 600)`;
      checks.push({ name: 'credentials', ok: mode === '600', hint: `${perms} · keySet ${withKey}/${ids.length}` });
    }
  } catch (e) {
    checks.push({ name: 'credentials', ok: false, hint: String(e).slice(0, 160) });
  }

  // 3. providers configured
  try {
    const cfg = await loadConfig(process.cwd());
    const providers = cfg.providers ?? [];
    const enabled = providers.filter((p) => p.enabled !== false).length;
    checks.push({
      name: 'providers',
      ok: providers.length > 0,
      hint: providers.length === 0 ? 'none configured — add one in the Providers tab' : `${enabled}/${providers.length} enabled`,
    });
  } catch (e) {
    checks.push({ name: 'providers', ok: false, hint: String(e).slice(0, 160) });
  }

  // 4. defaultModel resolves to a configured provider (catches dangling model refs)
  try {
    const cfg = await loadConfig(process.cwd());
    const providerId = String(cfg.defaultModel ?? '').split('/')[0];
    const ids = (cfg.providers ?? []).map((p) => p.id);
    const ok = providerId.length > 0 && ids.includes(providerId);
    checks.push({
      name: 'models',
      ok,
      hint: ok ? `${cfg.defaultModel} resolves to provider '${providerId}'` : `'${cfg.defaultModel}' has no matching provider in config.json`,
    });
  } catch (e) {
    checks.push({ name: 'models', ok: false, hint: String(e).slice(0, 160) });
  }

  // 5. sessions on disk for this project
  try {
    const { SessionStore } = await import('../session/store.js');
    const summaries = await new SessionStore(process.cwd()).listSummaries();
    checks.push({ name: 'sessions', ok: true, hint: `${summaries.length} session(s) on disk` });
  } catch (e) {
    checks.push({ name: 'sessions', ok: false, hint: String(e).slice(0, 160) });
  }

  // 6. agents registry + caps
  try {
    const { listAgents } = await import('../agents/registry.js');
    const agents = await listAgents();
    checks.push({ name: 'agents', ok: true, hint: `${agents.length} registered · maxAgents 20 / maxConcurrent 5` });
  } catch (e) {
    checks.push({ name: 'agents', ok: false, hint: String(e).slice(0, 160) });
  }

  // 7. skills registry
  try {
    const { scan } = await import('../skills/registry.js');
    const skills = await scan({ dirs: ['skills', '~/.lokma/skills'] });
    checks.push({ name: 'skills', ok: true, hint: `${skills.length} skill(s) (bundled + user)` });
  } catch (e) {
    checks.push({ name: 'skills', ok: false, hint: String(e).slice(0, 160) });
  }

  // 8. agent file locks
  try {
    const { listLocks } = await import('../agents/locks.js');
    const locks = await listLocks();
    const now = Date.now();
    const live = locks.filter((l) => l.leaseUntil > now).length;
    checks.push({ name: 'locks', ok: true, hint: `${live} live · ${locks.length - live} stale (${locks.length} total)` });
  } catch (e) {
    checks.push({ name: 'locks', ok: false, hint: String(e).slice(0, 160) });
  }

  for (const c of checks) {
    const icon = c.ok ? '✓' : '✗';
    console.log(`${icon} ${c.name}${c.hint ? ` — ${c.hint}` : ''}`);
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed — see hints above.`}`);
}
