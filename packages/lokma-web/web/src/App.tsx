import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import { LoginGate } from '@/components/auth/login-gate';
import { OnboardingWizard } from '@/components/auth/onboarding-wizard';
import { api } from '@/lib/api';
import './index.css';

/**
 * App boot gate (REQ-062 Parça A, REQ-063 + REQ-066 onboarding): fresh
 * instances (unbootstrapped, onboarding not done) boot into the
 * full-screen onboarding wizard; bootstrapped AND `requireLogin` on
 * hides the shell behind login until `/api/auth/me` 200s. Gate-off (or
 * fresh-but-onboarded-open) instances boot straight into the shell —
 * legacy behavior, untouched.
 */

type GateState = { phase: 'loading' } | { phase: 'open' } | { phase: 'onboarding' } | { phase: 'gated'; mode: 'login' | 'register' };

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
          // Fresh instance (REQ-066): first launch shows the onboarding
          // wizard; a fresh-but-onboarded-open instance (owner picked
          // "no login") boots straight into the shell.
          setGate(settingsRes.settings.onboardingDone ? { phase: 'open' } : { phase: 'onboarding' });
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
  if (gate.phase === 'onboarding') {
    return <OnboardingWizard onDone={refresh} />;
  }
  return <AppShell sessionId={sessionId} />;
}
