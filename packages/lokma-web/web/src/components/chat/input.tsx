'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * ChatInput — single input + send, DRY for all prompts.
 */

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = React.useState('');

  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="flex gap-2 border-t bg-card p-3">
      <Input
        placeholder={disabled ? 'Connecting…' : 'Ask Lokma… (mock WS → lokma-ai)'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        disabled={disabled}
      />
      <Button onClick={send} disabled={disabled || !text.trim()}>
        Send
      </Button>
    </div>
  );
}
