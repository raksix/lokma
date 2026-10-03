/**
 * REQ-191 — `lokma design system list|add|use`, the CLI half of the design
 * system catalog contract in `Docs/34-DESIGN-open-design-inspired.md` §5.1.
 *
 * Everything here is a THIN wrapper over `design/systems.ts` — the same
 * directory scan, the same SSRF/install guards, the same activation writer the
 * HTTP routes call. A second implementation of any of those would be a second
 * set of holes, so this file formats output and maps errors, nothing more.
 *
 * Exit codes: 0 success, 1 a refusal/failure with `code` + `message` on
 * stderr (the shape the shell can branch on), 2 bad usage.
 */

import { basename } from 'node:path';
import { homedir } from 'node:os';
import {
  installDesignSystem,
  listDesignSystems,
  useDesignSystem,
  type DesignSystemRow,
} from '../design/systems.js';

const USAGE = `lokma design system — the installed design system catalog

Usage:
  lokma design system list                     List catalog packages (and bundled presets)
  lokma design system add <url|path>           Install a package into the catalog
  lokma design system use <id> [--cwd <dir>]   Activate a package in a project (.lokma/)

Examples:
  lokma design system add https://github.com/openai/openai-cookbook
  lokma design system use stripe-linear --cwd ~/projects/my-app
`;

function fail(message: string, code?: string): never {
  console.error('[lokma] ' + (code ? code + ': ' : '') + message);
  process.exit(1);
}

/**
 * One catalog row on one line. `origin` is printed because the honest
 * distinction matters: `catalog` rows came from an installed package,
 * `bundled` rows are the built-in presets that appear only when no package
 * is installed — presenting them as packages would be the same lie the Web
 * picker avoids with its `(preset)` suffix.
 */
function line(row: DesignSystemRow): string {
  const tag = row.origin === 'catalog' ? '' : ' (preset)';
  const desc = row.description ? ' — ' + row.description : '';
  // A package that was FOUND but is unusable still lists (slice 1's
  // contract): it must read as broken here, not silently disappear.
  const bad = row.status === 'invalid' ? '  [invalid: ' + (row.problem ?? 'unknown') + ']' : '';
  return `  ${row.id.padEnd(28)} ${row.category.padEnd(18)}${tag}${desc}${bad}`;
}

async function list(root?: string): Promise<void> {
  const result = await listDesignSystems(root);
  console.log(
    `Design systems: ${result.count} (${result.source}) — ${result.root}`,
  );
  if (result.systems.length === 0) {
    console.log('  (empty — install one: lokma design system add <url|path>)');
    return;
  }
  for (const row of result.systems) console.log(line(row));
  if (result.source !== 'catalog') {
    console.log('  No packages installed yet — these are the built-in presets.');
  }
}

export async function runDesignSystemCli(
  positionals: string[],
  opts: { cwd?: string },
): Promise<void> {
  const sub = positionals[0];

  if (!sub || sub === 'help') {
    console.log(USAGE);
    return;
  }

  if (sub === 'list') {
    await list();
    return;
  }

  if (sub === 'add') {
    const source = positionals[1];
    if (!source) {
      console.error(USAGE);
      process.exit(2);
    }
    try {
      const row = await installDesignSystem(source);
      console.log(`[lokma] installed ${row.id} — files: ${row.files.join(', ')}`);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      fail(err.message ?? String(e), err.code);
    }
    return;
  }

  if (sub === 'use') {
    const id = positionals[1];
    if (!id) {
      console.error(USAGE);
      process.exit(2);
    }
    const cwd = opts.cwd ? opts.cwd : process.cwd();
    try {
      const result = await useDesignSystem(id, cwd);
      console.log(
        `[lokma] activated ${result.id} in ${cwd}/${basename(cwd)} (.lokma/) — copied: ${result.copied.join(', ')}`,
      );
    } catch (e) {
      const err = e as { code?: string; message?: string };
      fail(err.message ?? String(e), err.code);
    }
    return;
  }

  console.error('[lokma] Unknown subcommand: design system ' + sub);
  console.error(USAGE);
  process.exit(2);
}

/** Exported for the unit probe: the catalog root a CLI run would read. */
export function cliSystemsRoot(): string {
  return homedir() + '/.lokma/design/systems';
}