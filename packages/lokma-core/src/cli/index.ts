#!/usr/bin/env node
import { parseArgs } from 'node:util';

/**
 * Lokma CLI — thin terminal entry into the harness.
 * Commands: config (layered read + global write), doctor, web, agent list, --help, --version.
 * The full interactive loop lives in the Web harness; this CLI proves the
 * binary, the layered config, and the agent registry work.
 */

const VERSION = '0.0.1';

function printHelp(): void {
  console.log(`lokma v${VERSION} — innovative agentic harness
Usage:
  lokma web [--port 3456]          Start web harness (Fastify + Vite SPA)
  lokma config get <key>           Read layered config
  lokma config set <dotted.key> <value>  Write to ~/.lokma/config.json
  lokma doctor                     Check config/creds/perms
  lokma agent list                 List agents (live registry)
  lokma --help | --version
`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: 'string', default: '3456' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    return;
  }
  if (values.version) {
    console.log(VERSION);
    return;
  }

  const cmd = positionals[0];

  if (!cmd) {
    printHelp();
    return;
  }

  if (cmd === 'web') {
    const port = Number(values.port ?? '3456');
    console.log(`[lokma] Starting web harness on port ${port}...`);
    // Delegate to lokma-server package if available
    try {
      // Dynamic import so lokma-core doesn't hard-depend on server at build time
      const serverPath = new URL('../../../lokma-web/server/dist/index.js', import.meta.url).pathname;
      const { startServer } = await import(serverPath);
      await startServer({ port });
    } catch (e) {
      console.error('[lokma] Failed to start server. Did you run bun run build?');
      console.error(String(e));
      process.exit(1);
    }
    return;
  }

  if (cmd === 'config') {
    const sub = positionals[1];
    if (sub === 'get' || sub === '--dump') {
      const { loadConfig } = await import('../config/loader.js');
      const cfg = await loadConfig(process.cwd());
      console.log(JSON.stringify(cfg, null, 2));
      return;
    }
    if (sub === 'set') {
      const key = positionals[2];
      const raw = positionals[3];
      if (!key || raw === undefined) {
        console.error('[lokma] Usage: lokma config set <dotted.key> <value>');
        process.exit(1);
      }
      // JSON-coerce the value ("true" -> true, "42" -> 42, '{"a":1}' -> object);
      // anything that is not valid JSON stays a plain string.
      let value: unknown = raw;
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      try {
        const { loadConfig, saveGlobal } = await import('../config/loader.js');
        const cur = (await loadConfig(process.cwd())) as Record<string, unknown>;
        const parts = key.split('.');
        const top = parts[0];
        if (!(top in cur)) {
          console.error(`[lokma] Unknown config key: ${top}`);
          process.exit(1);
        }
        // Deep-set onto the live config so sibling keys survive saveGlobal's
        // shallow merge, then persist only the touched top-level branch.
        const merged = JSON.parse(JSON.stringify(cur)) as Record<string, unknown>;
        let node = merged;
        for (let i = 0; i < parts.length - 1; i++) {
          const seg = parts[i];
          if (typeof node[seg] !== 'object' || node[seg] === null) node[seg] = {};
          node = node[seg] as Record<string, unknown>;
        }
        node[parts[parts.length - 1]] = value;
        // Guard against silent drops: the schema strips unknown fields, so
        // verify the value survives a parse round-trip before persisting.
        const { GlobalConfigSchema } = await import('lokma-shared');
        const parsed = GlobalConfigSchema.parse(merged) as Record<string, unknown>;
        let check: unknown = parsed;
        for (const seg of parts) check = (check as Record<string, unknown> | null)?.[seg];
        if (JSON.stringify(check) !== JSON.stringify(value)) {
          console.error(`[lokma] Key '${key}' is not a known config field (value would be dropped)`);
          process.exit(1);
        }
        await saveGlobal({ [top]: parsed[top] } as Parameters<typeof saveGlobal>[0]);
        console.log(`[lokma] set ${key}`);
      } catch (e) {
        console.error(`[lokma] Invalid config value: ${String(e)}`);
        process.exit(1);
      }
      return;
    }
    console.log('[lokma] config get/set — see Docs/26-CONFIG-and-CREDENTIALS.md');
    return;
  }

  if (cmd === 'doctor') {
    const { runDoctor } = await import('./doctor.js');
    await runDoctor();
    return;
  }

  if (cmd === 'agent') {
    const { listAgents } = await import('../agents/registry.js');
    const agents = await listAgents();
    console.log(`Agents: ${agents.length} (maxAgents 20, maxConcurrent 5)`);
    for (const a of agents) console.log(` - ${a.id} (${a.persona}) [${a.state}] model=${a.model}`);
    return;
  }

  console.error(`[lokma] Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
