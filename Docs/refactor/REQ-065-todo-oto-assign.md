# REQ-065 — Uygulama-içi todo + AI oto-assign (claim kilidi)

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "birden fazla çalışanın aynı yerde çalışması için uygulamanın kendi içinde todo sistemi; todo'yu AI yapmaya başlayınca oto-assign etsin, başka bir ajan gelip o görevi yapmasın" (REQ-062'nin C parçası, bağımsız istek).
- **Mevcut durum:** todo sistemi YOK. Ama kilit primitifi HAZIR: `lokma-core/agents/locks.ts` (`.agentlocks/locks/<sha1>.json` + `acquire(owner, leaseMs)` + `heartbeat` + süresi dolmuşu devralma, Docs/30 §10.1). Bu iş sıfırdan icat edilmez, lock deseninin üstüne kurulur.
- **İstenen mimari:**
  1. Proje başına `todos.json`: `{id, title, status: open|claimed|done, claimedBy(sessionId+userId), leaseUntil}`.
  2. AI göreve başlarken TEK atomik yazmada `open→claimed` + `claimedBy` + `leaseUntil=now+5dk` yazar. Başka ajan claim'li + lease-canlı todo'ya dokunursa RED alır ("şu session yapıyor" mesajıyla).
  3. Agent loop çalışırken ~60sn'de bir `heartbeat` atar; loop ölürse lease düşer → todo otomatik `open`'a döner (yetim görev kalmaz).
  4. Aynı session'dan tekrar claim = idempotent OK (kendi işine devam eder).
  5. UI: proje içinde Todo pane (açık / bende / devam eden / bitmiş) + manuel assign + AI'ya "şunu yap" butonu (session açıp prompt basar).
  6. Claim'siz dosya yazımı serbest kalır (todo'suz hızlı işler ölmez); ama todo'ya bağlı dosyalarda çakışma uyarısı verilir.
- **Touched (plan):** core todos store + claim (locks deseniyle), agent-loop heartbeat kablosu, server `/api/todos/*` route'ları, web Todo pane, agent tool setine `claim_todo`/`complete_todo`.
- **Verify (plan):** root+web+srv tsc 0, build'ler green, restart'lar, headless E2E: iki session aynı todo'ya sarılır → biri OK biri RED + lease düşünce todo geri `open`'a döner + Todo pane'den AI'ya iş verme çalışır; bundle match.
