#!/usr/bin/env bun
/**
 * Lokma release helper (npm + bun share the npm registry, so one publish
 * covers `npm i -g lokma` and `bun install -g lokma` / `bunx lokma`).
 *
 *   bun scripts/release.mjs pack     → tarballs into release/
 *   bun scripts/release.mjs publish  → pack + npm publish in dep order
 *
 * Staging copies rewrite `workspace:*` to `^<version>` (npm-safe) and drop
 * lokma-core's bin (the `lokma` command ships only with the lokma package).
 * Run `npm login` once before publish.
 */
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SHELL = process.platform === 'win32';
const ROOT = resolve(import.meta.dir, '..');
const PKGS = ['lokma-shared', 'lokma-ai', 'lokma-core', 'lokma'];
const DIRS = {
  'lokma-shared': 'packages/lokma-shared',
  'lokma-ai': 'packages/lokma-ai',
  'lokma-core': 'packages/lokma-core',
  lokma: 'packages/lokma',
};

async function rewritePkg(pkgDir, version) {
  const path = join(pkgDir, 'package.json');
  const raw = JSON.parse(await readFile(path, 'utf-8'));
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = raw[section];
    if (!deps) continue;
    for (const [k, v] of Object.entries(deps)) {
      if (v === 'workspace:*') deps[k] = `^${version}`;
    }
  }
  if (raw.name === 'lokma-core') delete raw.bin;
  await writeFile(path, JSON.stringify(raw, null, 2) + '\n');
}

/** npm is npm.cmd on Windows — needs a shell (and PATH can be thin). */
async function npm(args, opts = {}) {
  return exec('npm', args, { ...opts, shell: SHELL });
}

async function buildPublishables() {
  console.log('building publishable packages…');
  await exec('bun', ['run', 'build:shared'], { cwd: ROOT });
  await exec('bun', ['run', 'build:ai'], { cwd: ROOT });
  await exec('bun', ['run', 'build:core'], { cwd: ROOT });
  await exec('bun', ['--filter=lokma', 'run', 'build'], { cwd: ROOT });
}

async function pack() {
  await buildPublishables();
  const stage = join(ROOT, '.release-stage');
  const out = join(ROOT, 'release');
  await rm(stage, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const f of await readdir(out).catch(() => [])) {
    if (f.endsWith('.tgz')) await rm(join(out, f), { force: true });
  }
  const version = JSON.parse(await readFile(join(ROOT, 'packages/lokma/package.json'), 'utf-8')).version;
  for (const name of PKGS) {
    const dst = join(stage, name);
    await cp(join(ROOT, DIRS[name]), dst, {
      recursive: true,
      filter: (s) => !s.split(sep).includes('node_modules'),
    });
    await rewritePkg(dst, version);
    for (const binRel of ['dist/cli.js', 'dist/cli/index.js']) {
      try {
        await chmod(join(dst, binRel), 0o755);
      } catch {
        // Missing bin (libraries) — nothing to chmod.
      }
    }
    const { stdout } = await npm(['pack', '--pack-destination', out], { cwd: dst });
    console.log(stdout.trim());
  }
  console.log('tarballs in', out);
}

async function publish() {
  await pack();
  const out = join(ROOT, 'release');
  const files = (await readdir(out)).filter((f) => f.endsWith('.tgz'));
  const rank = (f) => PKGS.findIndex((n) => f.startsWith(`${n}-`));
  files.sort((a, b) => rank(a) - rank(b));
  for (const f of files) {
    console.log('publishing', f);
    await npm(['publish', join(out, f), '--access', 'public'], { cwd: ROOT, stdio: 'inherit' });
  }
}

const cmd = process.argv[2];
if (cmd === 'pack') await pack();
else if (cmd === 'publish') await publish();
else {
  console.error('usage: bun scripts/release.mjs pack|publish');
  process.exit(1);
}
