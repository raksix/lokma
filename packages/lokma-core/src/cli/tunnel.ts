/**
 * REQ-193 slice 7 — `lokma tunnel status|start|stop`, the CLI half of the
 * public tunnel contract in `Docs/00-LOKMA-KONTEKST.md` (Kapsam 4).
 *
 * Everything here is a THIN wrapper over `cloud/tunnel.ts` — the same provider
 * resolution, the same url parsing, the same honesty contract the HTTP routes
 * use. A second implementation of any of those would be a second set of holes,
 * so this file formats output and maps errors, nothing more. That is the same
 * rule `cli/design-system.ts` follows over `design/systems.ts`.
 *
 * The honesty contract is the point of this file: `status` prints the provider's
 * own url or says it is off, and NEVER prints a plausible-looking host. A
 * tunnel that cannot be reached is not a tunnel, so a recorded `running` whose
 * pid is gone already reads as stopped inside `tunnelStatus()` — the CLI has no
 * second opinion to add.
 *
 * Exit codes: 0 success, 1 a refusal/failure with `code` + `message` on
 * stderr (the shape the shell can branch on), 2 bad usage.
 */

import {
  parseTunnelPort,
  startTunnel,
  stopTunnel,
  tunnelStatus,
  TunnelError,
  type TunnelStatus,
} from '../cloud/tunnel.js';

const USAGE = `lokma tunnel — expose THIS box to the internet

Usage:
  lokma tunnel status                  Report the provider-reported status
  lokma tunnel start [--port <port>]   Start cloudflared / ngrok / the relay
  lokma tunnel stop                    Stop it (always answers "off")

Examples:
  lokma tunnel status
  lokma tunnel start --port 3456
  lokma tunnel stop

Notes:
  The url printed by 'start' is read from the provider's own output. If no
  provider is installed you get the install command instead — Lokma never
  invents a public url.
  Relay fallback: set LOKMA_RELAY_URL (+ LOKMA_RELAY_TOKEN) to your own relay,
  or pin one provider with LOKMA_TUNNEL_PROVIDER=cloudflared|ngrok|relay.
`;

function fail(message: string, code?: string, installHint?: string | null): never {
  console.error('[lokma] ' + (code ? code + ': ' : '') + message);
  // The install sentence prints on its OWN line so it can be copied out of the
  // terminal without re-parsing a sentence (measured in slice 7: the refusal
  // only named the missing env var and never said what to do about it).
  if (installHint) console.error('[lokma] install: ' + installHint);
  process.exit(1);
}

/**
 * Render a status as shell lines.
 *
 * `url` is printed ONLY when the provider actually reported one, so the
 * absence of the line is itself the answer: a shell that greps for the url
 * gets nothing rather than a fabricated host.
 */
function render(status: TunnelStatus): void {
  console.log(`state:    ${status.state}`);
  console.log(`provider: ${status.provider ?? '(none)'}`);
  if (status.url) console.log(`url:      ${status.url}`);
  console.log(`started:  ${status.startedAt ?? '-'}`);
  console.log(`expires:  ${status.expiresAt ?? '-'}`);
  console.log(status.message);
  if (status.installHint) console.log(`hint:     ${status.installHint}`);
}

export async function runTunnelCli(
  positionals: string[],
  opts: { port?: string },
): Promise<void> {
  const sub = positionals[0];

  if (!sub || sub === 'help') {
    console.log(USAGE);
    return;
  }

  if (sub === 'status') {
    render(await tunnelStatus());
    return;
  }

  if (sub === 'start') {
    let port: number;
    try {
      port = parseTunnelPort(opts.port);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      fail(err.message ?? String(e), err.code);
    }
    try {
      render(await startTunnel({ port }));
    } catch (e) {
      const err = e as { code?: string; message?: string; installHint?: string | null };
      fail(err.message ?? String(e), err.code, err.installHint);
    }
    return;
  }

  if (sub === 'stop') {
    render(await stopTunnel());
    return;
  }

  console.error('[lokma] Unknown subcommand: tunnel ' + sub);
  console.error(USAGE);
  process.exit(2);
}

export { TunnelError };