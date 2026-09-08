# REQ-070 — İstek backend'de çalışsın: F5'e dayanıklı run queue

- **Status:** done (canlıda — kullanıcı "yap" dedi, implemente edildi)
- **Asked:** 2026-09-08 — "lokmada bir istek atınca backend tarafında işlensin, F5 attığımda istek arkada çalışmaya devam etsin. queue sistemi de backend tarafında olacak".
- **Gap:** `prompt` WS handler içinde doğrudan `runAgentLoop` koşturuyordu; F5 (socket close) → `rejectPendingGates` + abort → run ölüyordu. Kuyruk yoktu (composer'daki queue modu client-side).
- **Design:**
  1. Session-scoped run state (`Map<sessionId, {queue, running, abort, gates}>`) — socket'a değil session'a bağlı. Yeni socket aynı state'e bağlanır.
  2. `prompt` → kuyruğa girer, pump sırayla koşturur (FIFO). `send` bağlı socket yoksa yutulur (transcript'e yazım aynen sürer).
  3. `socket close` artık abort ETMEZ (sadece listener temizliği). Bilinçli iptal = Stop butonu (`abort` mesajı) aynen çalışır.
  4. Gate beklerken client yoksa mevcut `APPROVAL_TIMEOUT_MS` timer'ı deny/'' çözer — takılma yok.
  5. `GET /api/sessions/:id/run` → `{running, queued}` — client boot/reconnect'te çeker, "çalışıyor" rozeti gösterir.
  6. Server restart queue'yu uçurur (in-memory) — transcript kalır, status memory'de olduğu için takılı "running" yok.
- **Touched:** `server/session-runs.ts` (yeni: state map + FIFO + broadcast + status), `server/routes/ws.ts` (pump + session attach + detach-only close), `server/routes/sessions.ts` (`GET /:id/run`), web `lib/api.ts` (`getSessionRun`) + `chat/index.tsx` (runActive rozeti + 4sn poll + final reload).
- **Proof:** session-runs probe 8/8, srv+web tsc 0, iki build green, restart'lar, GERÇEK F5 E2E (mimo): reload ortasında `run.running:true` + rozet + transcript 1→3 satır (run F5'e rağmen tamamlandı, `F5DONE` yazıldı); gate test boyunca ON tutuldu (kısa OFF penceresinde E2E, sonrası `/api/auth/me` 401).
