import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import './index.css';

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

export default function App() {
  const sessionId = useSessionId();
  return <AppShell sessionId={sessionId} />;
}
