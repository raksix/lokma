/**
 * Minimal SSE reader shared by the streaming adapters (DRY).
 * Parses `event:` / `data:` lines from a fetch response body without any
 * dependency — both OpenAI-compatible (`data:` JSON, `[DONE]` terminator)
 * and Anthropic (`event:` + `data:` JSON, `message_stop` terminator) ride
 * on this. Lines over 1MB are skipped (never buffered unboundedly).
 */

export type SseEvent = { event: string; data: string };

const MAX_LINE_BYTES = 1024 * 1024;

export async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event = 'message';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      if (done) buf += decoder.decode();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          event = line.slice(6).trim() || 'message';
          continue;
        }
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;
          yield { event, data };
          event = 'message';
        }
        // Unknown fields are ignored per the SSE spec.
        if (buf.length > MAX_LINE_BYTES) buf = '';
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

/** True for loopback/local hosts — keyless access is allowed there (Ollama). */
export function isLocalBaseUrl(raw: string): boolean {
  let host = '';
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  );
}

/** Read at most `cap` chars of an error body for diagnostics (never huge). */
export async function readErrorSnippet(res: Response, cap = 500): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, cap);
  } catch {
    return '';
  }
}
