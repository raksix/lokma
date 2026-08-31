'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { api, type HealthRes } from '@/lib/api';

/**
 * HealthBadge — pings /api/health, shows live status.
 * Single component, reused in Header (DRY).
 */

export function HealthBadge() {
  const [health, setHealth] = useState<HealthRes | null>(null);

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const h = await api.health();
        if (alive) setHealth(h);
      } catch {
        if (alive) setHealth(null);
      }
    };
    ping();
    const id = setInterval(ping, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return <Badge variant={health?.ok ? 'default' : 'secondary'}>{health?.ok ? '● server up' : '○ checking…'}</Badge>;
}
