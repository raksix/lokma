
import * as React from 'react';
import { ChatMessage, StreamingMessage, type ChatRole } from './message';
import { ChatInput } from './input';
import { useWs, type UseWs } from '@/hooks/use-ws';
import { Card } from '@/components/ui/card';

/**
 * Chat — renders one session transcript from an already-open `useWs` socket.
 * The socket lives here or lifted in AppShell (so shell chrome can show
 * status/cost); either way exactly one socket exists per rendered Chat.
 */

export function Chat({ sessionId, ws }: { sessionId: string; ws: UseWs }) {
  const { status, messages, stream, sendPrompt } = ws;
  const [history, setHistory] = React.useState<{ role: ChatRole; content: string }[]>([]);

  // Convert WS messages to chat history
  React.useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.type === 'text_delta') return; // handled as stream
    if (last.type === 'done') {
      // Flush stream into history as assistant message
      setHistory((h) => (stream ? [...h, { role: 'assistant', content: stream }] : h));
    }
  }, [messages, stream]);

  const handleSend = (text: string) => {
    setHistory((h) => [...h, { role: 'user', content: text }]);
    sendPrompt(text);
  };

  const isStreaming = status === 'open' && stream.length > 0 && messages[messages.length - 1]?.type !== 'done';

  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-9 items-center border-b px-3 text-xs text-muted-foreground">
        <span className="font-mono">{sessionId}</span>
        <span className="ml-auto capitalize">{status}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
        {history.length === 0 && !stream ? (
          <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
            No messages yet — type below to stream via the harness server.
            <br />
            <span className="text-xs">Check <code className="rounded bg-muted px-1">~/.lokma/projects/&lt;hash&gt;/sessions/{sessionId}.jsonl</code> after sending — CLI and Web share it.</span>
          </div>
        ) : null}
        {history.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}
        {isStreaming ? <StreamingMessage content={stream} /> : null}
      </div>
      <ChatInput onSend={handleSend} disabled={status !== 'open'} />
    </Card>
  );
}

/** Standalone Chat — owns its socket (used outside AppShell). */
export function ChatWithSocket({ sessionId }: { sessionId: string }) {
  const ws = useWs(sessionId);
  return <Chat sessionId={sessionId} ws={ws} />;
}
