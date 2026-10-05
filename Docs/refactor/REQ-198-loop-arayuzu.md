# REQ-198 — Looplar arayüzden görülsün ve yönetilsin (durum, ne kaldı, pause/stop)

**Status:** pending
**Tarih:** 2026-10-03
**Kaynak:** Kullanıcı mesajı (3 Ekim 2026):
> "abi var olan loopları lokmaya ekleme sadece biz ya da agent loop oluşturunca lokma harnessinde çalışan loopları arayüzden görebileceğiz.

istersek tüm looplar istersek proje bazlı"

> Ayrım **vurgulu**: Hermes'in `~/.hermes/loops/` altındaki mevcut loop'lar (redwind-w1/w2/w3, grammar-sprint vb.) Lokma'ya **eklenmez** — yalnız **Lokma harness'i içinde** (kullanıcı ya da ajan) oluşturulan loop'lar katalogda görünür.

**İlişkiler:** REQ-196 (veri modeli) → REQ-197 (yürütücü) → REQ-198 (arayüz) · REQ-199 (proje bazlı görünüm) · REQ-181 (yüzey→araç kataloğu: loop aracı da katalogdan gelir) · REQ-062 (proje kapsamı) · mevcut `cron/` (zamanlanmış iş) ile **aynı yüzey değil**.

## Bugünkü durum (ölçülmüş, `file:line`)

1. **Lokma'da loop kavramı **yok**. `grep -rn "loop" packages/lokma-core/src packages/lokma-web/server/src packages/lokma-web/web/src` → yalnız `agent-loop` / `runAgentLoop` / `loopback` / TUI'nin "turn-loop" yorumları. Yani **bütçeli, durumlu, tekrar eden** bir iş birimi hiç yok.
2. **Zamanlanmış iş var ama farklı:** `packages/lokma-core/src/cron/` (`cron.ts` store + `runner.ts` + `approvals.ts`) — `CronJob` alanları: agentId, schedule, task; `matchesMinute`/`selectDueJobs`/`appendRunRecord`. Yani "bir ajana saatlik tek iş ver" var. **Loop** ise "bir işi, durumunu ve bütçesini tutarak **tekrar ederek** yap, kendi ilerlemesini ölç, bitince dur" — bu eksik. Loop, cron'un `repeat` + state taşıyan hali olarak **aynı altyapıyı paylaşabilir** ama ayrı bir kavramdır (kullanıcı da ayrımı vurguladı).
3. **Çalıştırma yolu hazır:** `agent-loop.ts` `runAgentLoop({ cwd, prompt, sessionId, maxTurns, reasoningEffort, send, deliverSessionPrompt })` + `session-runs.ts` `enqueuePrompt`/`getRunState`/`runStatus` → bir oturuma prompt enqueue etmek **koşuyu başlatıyor**. Loop bu ikisini kullanır, **kendi kuyruğunu yazmaz**.
4. **Proje kapsamı hazır:** `auth/store.ts` `createProject/listProjects/getProject` + `Project.cwd`; tasarım/design zaten proje bazlı çalışıyor (REQ-178). Loop'un `projectId` alanı buraya bağlanır.
5. **Ajan olayları hazır:** `agents/events.ts` `emitAgentEvent/onAgentEvent` (`AgentLifecycleAction` = create/start/stop/…) — panel bununla canlı güncellenir (WS push, yoksa 4 sn poll).

## Kapsam

1. **Giriş noktası:** Settings modalına **"Loops"** bölümü (bölümleşme deseni REQ-163…167: rail ikonu modalı bölümle açar, ikon **kalır**) **+** rail'de kendi girişi olan bir **Loops** pane'i (ağır kullanım için). İki giriş de aynı veriyı gösterir, tek uygulama.
2. **Liste satırı (her loop için tek satır, okunur):** ad · durum rozeti (`running` canlı nabız noktası + "3 dk önce") · `iter 24/400` · bütçe çubuğu (`hours 19.6/1440 · $0.00/100`) · **"Sırada"** satırı (`next_hint`, kısaltılmış 1 satır) · son skor (`best`) · proje rozeti.
3. **Detay paneli (tıklayınca):** `state.json`'ın **ham** içeriği (kullanıcı dosyayı görmek ister), `ledger.md` **son 20 turu** kaydırılabilir, tam prompt metni, model/bütçe formu, **ve "Neler kaldı?"** bölümü:
   - loop'un `scope.md`'si varsa **işaretlenmemiş maddeler** `[ ]` sayılır ve listelenir (Claude tarzı kontrol listesi);
   - yoksa `nextHint` gösterilir ve alan boş bırılır — **uydurma "kalan iş" listesi yok**.
4. **Kontroller:** `Pause` · `Resume` · `Stop` · `Run now` · `Open ledger (md)` · `Delete` (onay + geçmiş **korunur**, yalnız kaldırılır). Eylemler `aria-label`'lı ve ikonlu (emoji yasak).
5. **Canlı güncelleme:** `agents/events.ts` `onAgentEvent` + WS `loop` frame → satır **anında** güncellenir; soket yoksa 5 sn poll (session feed deseninin aynısı). Yeni tur `ledger`'e düştüğünde satırda "yeni" işareti belirir.
6. **Dürüst durumlar:** `error` durumunda **son hata satırı** görünür; `done` loop'ta "bitti — neden" (`stopReason`) rozeti; `paused` loop'ta "durduruldu" + ne zaman. Hiçbir durum **uydurma** ilerleme göstermez.
7. **Boş durum:** tek cümle + "New loop" butonu (boş katalogda "hiç loop yok, ajana da sorabilirsin").

## Kontrol (kabul kriterleri)

- Bir loop çalışırken satır **anında** güncellenir (WS frame yoksa poll'a düşer, ölçülebilir); `Pause` → `paused`, `Resume` → `running`, `Stop` → `stopped`. Detayda `ledger.md` son 20 tur + `state.json` ham içeriği + prompt görünür. "Neler kaldı?" `scope.md` varsa `[ ]` maddeleri, yoksa `nextHint` (uydurma liste yok).
- `error` loop son hata satırını gösterir; `done` loop `stopReason` rozetiyle kapanır; boş durum tek cümle + New loop.
- Kapılar: birim + `bun x tsc --noEmit` 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk hash + prob `scripts/probe-loop-console.cjs`.

## Dokunulacak yerler

- `packages/lokma-web/web/src/components/settings/settings.ts` (`Loops` bölümü) + `settings-modal.tsx`
- Yeni: `packages/lokma-web/web/src/components/loops/{loop-console,loop-row,loop-detail}.tsx`
- `packages/lokma-web/web/src/lib/ws.ts` (`loop` frame reducer'ı)
- `packages/lokma-shared/src/protocol/ws.ts` (frame şeması)

## Bitirme (done)

1. Kontroller PASS + prob (+ ekran görüntüsü).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı.
- Kapsam disiplini: bu dalga **görünürlük + yönetim** katmanı; executor ayrı REQ (aşağıda). Kullanıcının "looplar arka planda çalışcak zaten" cümlesi = UI'ın onlara **dokunmaması**, panelin **izleme + kontrol** olması.
