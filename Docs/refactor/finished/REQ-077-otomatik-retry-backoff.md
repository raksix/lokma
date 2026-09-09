# REQ-077 — Hata alınca otomatik tekrar (ayarlanabilir backoff)

- **Status:** done (canlıda — 2026-09-09; impl 9ce6056+e2960c5+708a506, close 0e53e01, filing this tick — REQ-073/074 precedent)
- **Asked:** "hata falan alınca ... default 10 kez tekrar desin; ilkinde 3sn, sonra 10, 15, 20, 30, 40, 50 diye gitsin. Ayarlarda da olsun."
- **Did:**
  - shared `RetryConfigSchema` (`maxAttempts` default 10, `delaysSec` default [3,10,15,20,30,40,50,60,90,120]) → `GlobalConfig.retry` (PATCH /api/config).
  - agent-loop: stream hatası/boş cevap abort DEĞİLSE aynı turn'ü backoff ile tekrarlar (`retryDelayMs` pure, liste sonu tekrar eder); her denemede `retry_notice` frame; tükenince `[run failed after N tries]` + throw. Abort (Durdur/timeout) ASLA retry'lamaz; bekleme abort-aware (Durdur beklerken de işler).
  - Web: `retry_notice` → state + her denemede toast "Tekrar deneniyor (2/10, 15sn sonra)".
  - Ayarlar → General → "Auto-retry on error" (deneme sayısı + backoff saniyeleri, validasyonlu).
- **Proof:** loop probe 14/14, ws probe retry caseleri, tsc 0 (srv/web/shared), build green; config round-trip (10/[3,10,15,20,30,40,50] default, PATCH 2/[1,2] verify, restore); UI'da bölüm + "10 attempts"; GERÇEK retry: sahte key 401 → 2 retry_notice (attempt 1,2) → throw.
- **Files:** shared config+protocol, server agent-loop(+test)/ws pump, web ws(+test)/use-ws/chat/settings.
