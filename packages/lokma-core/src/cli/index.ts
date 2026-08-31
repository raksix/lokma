#!/usr/bin/env node
import { parseArgs } from 'node:util';

/**
 * Lokma CLI — Phase 0 stub.
 * Commands: config, doctor, web, agent (stubs), --help, --version
 * Full Ink TUI in Phase 1; this stub proves the binary and layered config work.
 */

const VERSION = '0.0.1';

function printHelp(): void {
  console.log(`lokma v${VERSION} — innovative agentic harness
Usage:
  lokma web [--port 3456]          Start web harness (Fastify + Next.js)
  lokma config get <key>           Read layered config
  lokma config set <key> <value>   Write to ~/.lokma/config.json
  lokma doctor                     Check config/creds/perms
  lokma agent list                 List agents (Phase 0 stub)
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
      const serverPath = new URL('../../lokma-web/server/dist/index.js', import.meta.url).pathname;
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
    console.log('[lokma] config set/get — see Docs/26-CONFIG-and-CREDENTIALS.md');
    return;
  }

  if (cmd === 'doctor') {
    const { runDoctor } = await import('./doctor.js');
    await runDoctor();
    return;
  }

  if (cmd === 'agent') {
    console.log('[lokma] agent commands — scaffold ready, full CRUD in Phase 1 (see Docs/30)');
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
