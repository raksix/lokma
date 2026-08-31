import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { AgentSchema, type Agent } from 'lokma-shared';

/**
 * Agent registry — durable entities under ~/.lokma/agents/<id>/.
 * See Docs/30-AGENT-SYSTEM §2, §5, §12
 */

function agentDir(id: string): string {
  return join(homedir(), '.lokma', 'agents', id);
}

export async function createAgent(opts: { id: string; name: string; persona?: string; model?: string; soul?: string }): Promise<Agent> {
  const id = opts.id;
  const dir = agentDir(id);
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, 'sessions'), { recursive: true });

  const agent = AgentSchema.parse({
    id,
    name: opts.name,
    persona: opts.persona ?? 'builder',
    model: opts.model ?? 'anthropic/claude-4-sonnet',
    provider: (opts.model ?? 'anthropic/claude-4-sonnet').split('/')[0] ?? 'anthropic',
    state: 'idle',
    budgets: { tokens: 500_000, usd: 10 },
    createdBy: 'human',
    createdAt: new Date().toISOString(),
  });

  await writeFile(join(dir, 'config.json'), JSON.stringify(agent, null, 2), 'utf-8');
  // SOUL.md starter
  const soul = opts.soul ?? `# SOUL — ${agent.name}\n\nPersona: ${agent.persona}\nModel: ${agent.model}\n`;
  await writeFile(join(dir, 'SOUL.md'), soul, 'utf-8');
  await writeFile(join(dir, 'MEMORY.md'), '', 'utf-8');
  await writeFile(join(dir, 'IDENTITY.json'), JSON.stringify({ id, name: agent.name, createdAt: agent.createdAt, createdBy: 'human' }, null, 2), 'utf-8');
  return agent;
}

export async function getAgent(id: string): Promise<Agent | null> {
  try {
    const raw = await readFile(join(agentDir(id), 'config.json'), 'utf-8');
    return AgentSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function listAgents(): Promise<Agent[]> {
  const base = join(homedir(), '.lokma', 'agents');
  try {
    const entries = await readdir(base, { withFileTypes: true });
    const out: Agent[] = [];
    for (const e of entries as any[]) {
      if (!e.isDirectory()) continue;
      const ag = await getAgent(e.name);
      if (ag) out.push(ag);
    }
    return out;
  } catch {
    return [];
  }
}

export async function deleteAgent(id: string): Promise<void> {
  await rm(agentDir(id), { recursive: true, force: true });
}
