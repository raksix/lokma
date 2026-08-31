import type { FastifyInstance } from 'fastify';
import { SessionStore } from 'lokma-core';
import { stream as aiStream } from 'lokma-ai';

/**
 * WS /ws/:sessionId — mock streaming that proves two surfaces share SessionStore.
 * Phase 0: echo + mock AI stream (word-by-word). Phase 1: wires lokma-core query() loop.
 * Protocol: ServerMessage (text_delta/tool_start/tool_result/done/cost) — see lokma-shared.
 */

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/:sessionId', { websocket: true }, (socket, req) => {
    const { sessionId } = req.params as { sessionId: string };
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);

    console.log(`[ws] client connected session=${sessionId} cwd=${cwd}`);

    // Send hello + replay existing transcript
    store.read(sessionId).then((msgs) => {
      for (const m of msgs) {
        socket.send(JSON.stringify({ type: 'text_delta', delta: `[replay] ${m.role}: ${m.content}\n`, sessionId }));
      }
    });

    socket.on('message', async (raw: Buffer) => {
      let msg: { type: string; prompt?: string } | null = null;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON', sessionId }));
        return;
      }

      if (msg?.type === 'prompt' && msg.prompt) {
        const prompt = msg.prompt;
        // Persist user message to JSONL (shared with CLI)
        await store.append(sessionId, { role: 'user', content: prompt, timestamp: new Date().toISOString() });

        // Mock AI streaming via lokma-ai (same stream() CLI uses)
        const model = 'anthropic/claude-sonnet-4-5';
        const provider = model.split('/')[0] ?? 'anthropic';
        let full = '';
        try {
          for await (const chunk of aiStream({ provider, model, messages: [{ role: 'user', content: prompt }] })) {
            if (chunk.type === 'text_delta') {
              full += chunk.delta;
              socket.send(JSON.stringify({ type: 'text_delta', delta: chunk.delta, sessionId }));
            } else if (chunk.type === 'done') {
              break;
            }
          }
          // Persist assistant reply to JSONL
          await store.append(sessionId, { role: 'assistant', content: full, timestamp: new Date().toISOString() });
          socket.send(JSON.stringify({ type: 'done', sessionId, reason: 'complete' }));
          // Send cost stub
          socket.send(JSON.stringify({ type: 'cost', sessionId, inputTokens: prompt.length, outputTokens: full.length, costUsd: 0.002, model }));
        } catch (e) {
          socket.send(JSON.stringify({ type: 'error', message: String(e), sessionId }));
        }
      } else if (msg?.type === 'abort') {
        socket.send(JSON.stringify({ type: 'done', sessionId, reason: 'aborted' }));
      }
    });

    socket.on('close', () => {
      console.log(`[ws] client disconnected session=${sessionId}`);
    });
  });
}
