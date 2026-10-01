import { z } from 'zod';
import { AgentError, listAgents } from '../agents/registry.js';
import { buildAgentTrace } from '../observability/trace.js';
import type { ToolDefinition } from './registry.js';

/**
 * Observability tool family (REQ-181 wave 4) — the agent reads the SAME
 * trace the Observability pane renders. `trace_list` names the agents a
 * trace can be read for (id, name, state, model, timing); `trace_get`
 * returns one agent's timeline derived from durable state only (registry
 * events, SOUL/MEMORY mtimes, live advisory locks) — nothing invented, so
 * a fresh agent honestly shows a short timeline. A missing or malformed
 * agent id answers `agent_not_found` / `bad_agent_id`, never an empty
 * fake trace.
 */

const TraceListInput = z.object({});
const TraceGetInput = z.object({ agentId: z.string().min(1).max(64) });

export const OBSERVABILITY_TOOL_NAMES = ['trace_list', 'trace_get'] as const;

export function buildObservabilityTools(): ToolDefinition[] {
  return [
    {
      name: 'trace_list',
      description:
        'List the agents a trace can be read for: id, name, state, persona, model, creation time and worktree — the same rows the Observability pane picks from.',
      inputSchema: TraceListInput,
      readOnly: true,
      maxResultSizeChars: 8_000,
      handler: async () => {
        try {
          const agents = await listAgents();
          return {
            ok: true,
            agents: agents.map((a) => ({
              id: a.id,
              name: a.name,
              state: a.state,
              persona: a.persona,
              model: a.model,
              createdAt: a.createdAt ?? null,
              worktree: a.worktree ?? null,
            })),
            count: agents.length,
          };
        } catch (e) {
          if (e instanceof AgentError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'trace_get',
      description:
        'Read one agent trace: timeline events (created, spawned, state changes, doc writes, locks), currently held locks, document sizes and the worktree.',
      inputSchema: TraceGetInput,
      readOnly: true,
      maxResultSizeChars: 20_000,
      handler: async (input) => {
        const { agentId } = input as z.infer<typeof TraceGetInput>;
        try {
          const trace = await buildAgentTrace(agentId);
          return { ok: true, trace };
        } catch (e) {
          if (e instanceof AgentError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}
