import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import { LoginGate } from '@/components/auth/login-gate';
import { api } from '@/lib/api';
import './index.css';

/**
 * App boot gate (REQ-062 Parça A, REQ-063): when the instance is
 * bootstrapped AND `requireLogin` is on, the shell stays hidden behind a
 * full-screen login until `/api/auth/me` 200s. Gate-off (or fresh)
 * instances boot straight into the shell — legacy behavior, untouched.
 */

type GateState = { phase: 'loading' } | { phase: 'open' } | { phase: 'gated'; mode: 'login' | 'register' };

function useSessionId(): string {
  const [id, setId] = React.useState('sess_phase0_demo');
  React.useEffect(() => {
    const key = 'lokma:sessionId';
    const existing = localStorage.getItem(key);
    if (existing) {
      setId(existing);
      return;
    }
    const fresh = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(key, fresh);
    setId(fresh);
  }, []);
  return id;
}

function useGate(): { gate: GateState; refresh: () => void } {
  const [gate, setGate] = React.useState<GateState>({ phase: 'loading' });
  const check = React.useCallback(() => {
    setGate({ phase: 'loading' });
    void (async () => {
      try {
        const settingsRes = await api.getAuthSettings();
        if (!settingsRes.bootstrapped) {
          // Fresh instance: the owner registers from the Auth pane (or the
          // gate below once requireLogin flips on) — shell stays open.
          setGate({ phase: 'open' });
          return;
        }
        if (!settingsRes.settings.requireLogin) {
          setGate({ phase: 'open' });
          return;
        }
        try {
          await api.authMeQuiet();
          setGate({ phase: 'open' });
        } catch {
          setGate({ phase: 'gated', mode: 'login' });
        }
      } catch {
        // Settings unreadable (server down?) — show the shell so the
        // failure is visible instead of a dead splash screen.
        setGate({ phase: 'open' });
      }
    })();
  }, []);
  React.useEffect(() => {
    check();
  }, [check]);
  return { gate, refresh: check };
}

export default function App() {
  const sessionId = useSessionId();
  const { gate, refresh } = useGate();
  if (gate.phase === 'loading') {
    return <div className="h-screen w-screen grid place-items-center bg-[#FAF9F5] dark:bg-[#161618] text-sm text-zinc-400">Loading Lokma…</div>;
  }
  if (gate.phase === 'gated') {
    return <LoginGate mode={gate.mode} onDone={refresh} />;
  }
  return <AppShell sessionId={sessionId} />;
}
