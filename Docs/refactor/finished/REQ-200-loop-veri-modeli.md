# REQ-200 — Loop veri modeli ve kalıcılığı (state + bütçe + ledger)

**Status:** done
**Tarih:** 2026-10-03 (kapanış: 2026-10-05)
**Kaynak:** Kullanıcı mesajı (3 Ekim 2026):
> "abi var olan loopları lokmaya ekleme sadece biz ya da agent loop oluşturunca lokma harnessinde çalışan loopları arayüzden görebileceğiz.

istersek tüm looplar istersek proje bazlı"

> Ayrım **vurgulu**: Hermes'in `~/.hermes/loops/` altındaki mevcut loop'lar (redwind-w1/w2/w3, grammar-sprint vb.) Lokma'ya **eklenmez** — yalnız **Lokma harness'i içinde** (kullanıcı ya da ajan) oluşturulan loop'lar katalogda görünür.

**İlişkiler:** REQ-200 (veri modeli) → REQ-201 (yürütücü) → REQ-202 (arayüz) · REQ-203 (proje bazlı görünüm) · REQ-181 (yüzey→araç kataloğu: loop aracı da katalogdan gelir) · REQ-062 (proje kapsamı) · mevcut `cron/` (zamanlanmış iş) ile **aynı yüzey değil**.

## Bugünkü durum (ölçülmüş, `file:line`)

1. **Lokma'da loop kavramı **yok**. `grep -rn "loop" packages/lokma-core/src packages/lokma-web/server/src packages/lokma-web/web/src` → yalnız `agent-loop` / `runAgentLoop` / `loopback` / TUI'nin "turn-loop" yorumları. Yani **bütçeli, durumlu, tekrar eden** bir iş birimi hiç yok.
2. **Zamanlanmış iş var ama farklı:** `packages/lokma-core/src/cron/` (`cron.ts` store + `runner.ts` + `approvals.ts`) — `CronJob` alanları: agentId, schedule, task; `matchesMinute`/`selectDueJobs`/`appendRunRecord`. Yani "bir ajana saatlik tek iş ver" var. **Loop** ise "bir işi, durumunu ve bütçesini tutarak **tekrar ederek** yap, kendi ilerlemesini ölç, bitince dur" — bu eksik. Loop, cron'un `repeat` + state taşıyan hali olarak **aynı altyapıyı paylaşabilir** ama ayrı bir kavramdır (kullanıcı da ayrımı vurguladı).
3. **Çalıştırma yolu hazır:** `agent-loop.ts` `runAgentLoop({ cwd, prompt, sessionId, maxTurns, reasoningEffort, send, deliverSessionPrompt })` + `session-runs.ts` `enqueuePrompt`/`getRunState`/`runStatus` → bir oturuma prompt enqueue etmek **koşuyu başlatıyor**. Loop bu ikisini kullanır, **kendi kuyruğunu yazmaz**.
4. **Proje kapsamı hazır:** `auth/store.ts` `createProject/listProjects/getProject` + `Project.cwd`; tasarım/design zaten proje bazlı çalışıyor (REQ-178). Loop'un `projectId` alanı buraya bağlanır.
5. **Ajan olayları hazır:** `agents/events.ts` `emitAgentEvent/onAgentEvent` (`AgentLifecycleAction` = create/start/stop/…) — panel bununla canlı güncellenir (WS push, yoksa 4 sn poll).

## Kapsam

1. **Loop kaydı** (yeni `packages/lokma-core/src/loops/`):
   ```ts
   type Loop = {
     id: string; name: string; projectId: string | null; cwd: string;
     prompt: string;                  // her turda kullanılan görev metni
     origin: 'user' | 'agent';        // kim başlattı (vurgulu ayrım)
     status: 'draft' | 'running' | 'paused' | 'done' | 'error';
     stopReason: string | null;       // 'target_score' | 'max_iters' | 'max_hours' | 'budget' | 'idle'
     budget: { maxIters: number; maxHours: number; maxUsd: number };
     spent: { iters: number; hours: number; usd: number; tokens: number };
     score: { best: string | null; last: string | null; target: string | null };
     nextHint: string | null;         // "sırada ne var"
     model: string; reasoningEffort: string;
     createdAt/updatedAt/startedAt/finishedAt;
   };
   ```
   Tek doğruluk kaynağı `~/.lokma/loops/<id>/` altında: `state.json` + `ledger.md` (**kalıcı, insan-okur** — tüm loop'lar tek dosyada değil, loop başına ayrı) + `prompt.md` + isteğe bağlı `scope.md`/`invariants.md`.
2. **Bütçe sayacı gerçek:** `spent.iters/hours/usd` **ölçümden** gelir (koşu süresi, usage frame'i, tur sayacı) — elle yazılmaz. `maxUsd` aşılınca loop **kendiliğinden** durur ve `stopReason:'budget'` yazar.
3. **Durum geçişleri kural:** `draft→running` yalnız ilk koşuyla; `running→paused` kullanıcı; `paused→running` resume; `done`/`error` **terminal** (yeniden başlatmak yeni `run` açar, eski geçmiş korunur). Terminal durumdan otomatik yeniden çalışma yok.
4. **Ledger append-only:** her tur sonunda 3-5 satır (ne yapıldı, ne ölçüldü, sırada ne var) — CLI'nin `ledger.md` disiplini; dosya şişerse **kırpılır** (son N tur + özet) ama **silinmez**.
5. **Kilit disiplini:** bir loop'un `cwd` dosyalarını kilitler (`agents/locks.ts` `acquire/release` mevcut) — REQ-062 çakışma kuralı; iki loop aynı dosyayı düzenleyemez, çakışan loop **dürüst** "kilitli" der.
6. **Migrasyon:** yok → yeni; mevcut Hermes loop'ları **okunmaz** (bilinçli: kapsam dışı, `~/.hermes/loops` yoluna **hiç dokunulmaz**).

## Kontrol (kabul kriterleri)

- `GET /api/loops` boşken `[]`, bir loop oluşturulunca 1 kayıt; `state.json` diskte doğrulanan (dosya sistemi kanıtı).
- Bütçe aşımı (`maxIters: 2` ile 3. tur) loop'u **kendiliğinden** `done` + `stopReason:max_iters` yapar; `spent.iters` gerçek sayımla eşleşir.
- Kapılar: birim + `bun x tsc --noEmit` 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk hash + prob `scripts/probe-loop-store.cjs`.

## Dokunulacak yerler

- Yeni: `packages/lokma-core/src/loops/{store,types,ledger}.ts`
- `packages/lokma-core/src/agents/locks.ts` (mevcut — yeniden kullanılır)
- `packages/lokma-web/server/src/routes/loops.ts` (yeni)
- `packages/lokma-shared` (zod şema — **WS validator alanı taşımak zorunda**)

## Bitirme (done)

1. Kontroller PASS + prob (+ ekran görüntüsü).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı (spec tick'i).
- **Kapanış (2026-10-05):** iki commit — `0ddbaa9` veri modeli + ledger + rotalar, `1728162` cwd kilit disiplini (kapsam 5). Kanıt: birim 118/118 · canlı prob `scripts/probe-loop-store.cjs` 73/73 (kapı hiç açılmadı, tokenless 401) · proven-to-fail canlı probu kırmızıya düşürüyor · kök `tsc --noEmit` 0 · shared/ai/core/server build temiz · concept 1863 modül / 497 kB · `pm2 restart lokma-server` (tek proc, `pm2 kill` yok).
- Kapsam disiplini: bu dalga **görünürlük + yönetim** katmanı; executor ayrı REQ (aşağıda). Kullanıcının "looplar arka planda çalışcak zaten" cümlesi = UI'ın onlara **dokunmaması**, panelin **izleme + kontrol** olması.
