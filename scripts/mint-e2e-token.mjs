/**
 * Mint a real Bearer token for E2E probes WITHOUT touching the login gate.
 *
 * WHY THIS EXISTS (REQ-076 follow-up): flipping `requireLogin` off on the
 * LIVE server for Playwright probes leaves the whole harness open to the
 * internet (and it kept happening — the flag would not "stick"). NEVER
 * write `/root/.lokma/auth/settings.json` by hand and NEVER PATCH
 * `/api/auth/settings` for tests. Mint a token with this script and send
 * `Authorization: Bearer <token>` (or `?token=` for WS) instead — the gate
 * stays ON the entire time.
 *
 * Run as ROOT only (it reads the live auth DB + signing secret):
 *   HOME=/root bun scripts/mint-e2e-token.mjs [email]
 * With no email it picks the oldest active superadmin. Token lives 7 days
 * (server TTL). The script file itself is chmod 700 — root only.
 */
import { listUsers, signToken } from 'lokma-core';

const home = process.env.HOME ?? '';
if (home !== '/root') {
  console.error(`REFUSE: run as root with HOME=/root (got HOME=${home || '(empty)'})`);
  process.exit(1);
}

const email = process.argv[2] ?? null;
const users = await listUsers();
const pool = users.filter((u) => u.status === 'active');
const picked =
  (email ? pool.find((u) => u.email.toLowerCase() === email.toLowerCase()) : null) ??
  pool
    .filter((u) => u.role === 'superadmin')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0] ??
  pool[0];

if (!picked) {
  console.error('No active user to mint for');
  process.exit(1);
}

const token = await signToken(picked.id);
console.log(token);
