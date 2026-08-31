import { cn } from '@/lib/utils';

/**
 * ChatMessage — single bubble, DRY for user/assistant/system.
 */

export type ChatRole = 'user' | 'assistant' | 'system';

export function ChatMessage({ role, content }: { role: ChatRole; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-lg px-3 py-2 text-sm leading-relaxed',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        <span className="whitespace-pre-wrap">{content}</span>
      </div>
    </div>
  );
}

export function StreamingMessage({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="flex justify-start">
      <div className="max-w-[78%] rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed">
        <span className="whitespace-pre-wrap">{content}</span>
        <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />
      </div>
    </div>
  );
}
