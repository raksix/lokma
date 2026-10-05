# REQ-203 — Loop görünümü proje bazlı olabilsin (tüm looplar ↔ tek proje)

**Status:** pending
**Tarih:** 2026-10-03
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

1. **İki görünüm, bir veri:** üstte anahtar — **All loops** ↔ **This project**. `This project` seçiliyken liste **o projenin** loop'larına (`projectId` eşleşmesi, projesiz loop'lar ayrı grupta "no project") filtrelenir; aktif oturumun `cwd`'si hangi projeye düşüyorsa o seçili gelir.
2. **Filtreler:** durum (running/paused/done/error), proje, sıralama (varsayılan: aktif + son güncellenen). Arama kutusu ad/`nextHint` üzerinde.
3. **Proje kapsamı sözleşmesi:** loop'un `cwd`'si **projenin cwd'siyle aynı olmalı** (ya da proje kaydı `cwd`'sini işaret etmeli) — REQ-178'in "tek doğruluk kaynağı cwd" disiplini; iki farklı yol yazan loop yok.
4. **Proje silinince:** loop **silinmez**; listede `project missing` rozetiyle durur ve `cwd` geçersizse `error` yazılır (sessiz kayıp yok).
5. **Çapraz görünüm uyarısı:** "This project" görünümünde başka projelerde **çalışan** loop varsa üstte ince bir satır: "3 loop başka projelerde çalışıyor" → tıkla tümüne geç (kullanıcı bunu kaçırmasın).

## Kontrol (kabul kriterleri)

- `This project` seçiliyken yalnız o projenin loop'ları listelenir; projesiz loop'lar ayrı grupta; diğer projelerdeki **çalışan** loop varsa uyarı satırı görünür. Anahtar tercihi + filtreler reload'da korunur (`lokma-loops-view:v1`).
- Proje silinince loop kaybolmaz: `project missing` rozeti + `error` durumu; cwd geçersizken dürüst hata.
- Kapılar: birim + `bun x tsc --noEmit` 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk hash + prob `scripts/probe-loop-project-view.cjs`.

## Dokunulacak yerler

- Yeni: `packages/lokma-web/web/src/components/loops/loop-console.tsx` (görünüm anahtarı + filtreler)
- `packages/lokma-core/src/auth/store.ts` (proje–cwd eşleşmesi kontrolü)
- `packages/lokma-web/web/src/stores/layout.ts` (snapshot)

## Bitirme (done)

1. Kontroller PASS + prob (+ ekran görüntüsü).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı.
- Kapsam disiplini: bu dalga **görünürlük + yönetim** katmanı; executor ayrı REQ (aşağıda). Kullanıcının "looplar arka planda çalışcak zaten" cümlesi = UI'ın onlara **dokunmaması**, panelin **izleme + kontrol** olması.
