# REQ-170 — Aynı araç çağrısı iki kez görünüyor: canlı katman, transcript'e düşen satırı tekrar çizmesin

**Status:** done (2026-09-29) — commits `20d484a` (fix) + `7e4c944` (live probe)
**Tarih:** 2026-09-29
**Kaynak:** Kullanıcı mesajı (29 Eyl 2026, ekran görüntülü):
> "abi tool çağrıları bi altta gözüküo toplam bir de üstte gözüküyor altta tekrar gözükmesine gerek yok 2 kere gözüküyor"

## Belirti (kanıt)

Tek kaydırma alanında AYNI 4 araç çağrısı iki kez çiziliyor:

- **ÜST grup — zaman çizelgesi satırları (sonuçlu):** `Read Docs/00-LOKMA-KONTEKST.md`, `Listed .` → `33 entries`, `Ran git log --oneline -8` → çıktı, `Ran git status --short` → çıktı (wrench ikonu + yeşil tik + sonuç satırı).
- **ALT grup — `Lokma` bloğuna girintili (başlık-only):** aynı 4 satır, sonuç satırları yok.
- Aralarında kalıcı `Thinking` satırı (`?` avatar, "naber" gerekçesi).

## Kök neden (kod izleri — worker doğrular)

- Sunucu, araç çağrısı TAMAMLANINCA kanıtı transcript'e `role: 'tool'` satırı olarak yazıyor: `packages/lokma-web/server/src/agent-loop.ts` `toolRecord(...)` → `store.append` (280/319/348/879) ve bu satırlar **REQ-149** gereği koşu SÜRERKEN canlı `transcript_append` ile istemciye itiliyor → zaman çizelgesinde görünüyor (`single-chat-view.tsx:452-466`, `transcriptToolEntry` + `ToolCallRow`, sonuç satırıyla).
- Aynı anda **canlı katman** da aynı çağrıları çiziyor: `liveBlocks = interleaveLiveBlocks(stream, toolMarks, toolCalls)` (REQ-111) → `Lokma` bloğunda `ToolCallRow` (`single-chat-view.tsx:426, 511-542`).
- `done` sonrası REQ-132 canlı katmanı temizliyor; ama **koşu sürerken** (ve temizlik gecikirse) iki kaynak birden boyanıyor → çift gösterim.

## Kapsam (beklenen fix yönü)

1. **Tek kanonik kaynak = transcript (zaman çizelgesi).** Kural: transcript'te satırı olan bir araç çağrısı canlı katmanda TEKRAR çizilmez (eşleşme: canlı `callId` ↔ transcript satırının `toolCallId`'si). Canlı katman yalnız HENÜZ kalıcılaşmamış kısımları gösterir: süren (transcript'e düşmemiş) çağrı + henüz assistant satırı olmayan stream metni.
2. **Thinking için de aynı kural:** kalıcı `Thinking` satırı geldiyse canlı thinking bloğu çizilmez (çift Thinking olmaz).
3. `done` temizliği (REQ-132) korunur; ek olarak **koşu içi dedupe** şart (kullanıcı koşu sürerken görüyor).
4. **Tutarlılık:** biten koşuda zaten tek kopya (transcript); koşu sırasında da hedef görünüm aynı — üstte tek satır (sonuçlu), süren çağrı için tek canlı satır (spinner).

## Kabul (kabul kriterleri)

- Canlı prob `scripts/probe-tool-row-dedupe.cjs`: N çağrılı bir koşu tetikle; **koşu SÜRERKEN** ve **bittiğinde** her çağrı satırının DOM'da kaç kez göründüğünü say → **aynı çağrı kimliği için aynı anda ≤ 1 satır** (bitişte tam 1). Ölçüm `describeToolCall` metni (`Read …`/`Ran …`) + yerleşim (zaman çizelgesi ↔ canlı blok) ayrımıyla.
- Koşu sürerken süren çağrı canlı blokta TEK satır görünür; tamamlanınca aynı çağrı zaman çizelgesinde tek satır olur (anlık 2'ye çıkmaz).
- Kapılar: `bun x tsc --noEmit` 0; ilgili testler (`single-chat-view.test.ts` + ws testleri) güncel; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; canlı prob yeşil.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/chat/single-chat-view.tsx` (liveBlocks hesabı/render + transcript callId seti)
- gerekirse `packages/lokma-web/web/src/lib/ws.ts` (canlı haritadan düşürme yardımcısı) / `components/chat/index.tsx`

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Kullanıcı: "altta tekrar gözükmesine gerek yok" → **alttaki canlı blok tekrarı kaldırılır**; üstteki (kalıcı, sonuçlu) satırlar kanonik kalır. Tersi (canlı bloğu tutup zaman çizelgesi satırlarını gizlemek) yenileme sonrası görünümle tutarsız olurdu — kanonik kaynak transcript'tir.
- Bu bir HATA düzeltmesidir; kullanıcı talebiyle yalnız REQ olarak eklendi (write-only).
- `concept/` prototipi kapsam dışı — yalnız `packages/lokma-web`.

## Kapanış kanıtı (2026-09-29)

**Uygulama:** `liveAfterPersisted()` (single-chat-view.tsx) — transcript kanonik; canlı katman yalnız kalıcılaşmamış artığı çizer (callId ile dışlama + metin/thinking önek tüketimi, uyuşmazlıkta fail-open; mark'lar kırpılan buffer'a yeniden tabanlanır). Chat'te kalıcı `thinking` satırları zaten filtrelendiği için canlı thinking görünür kalır (tüketim yalnız gerçekten çizilen satırlardan).

**Birim:** `single-chat-view.test.ts` +12 REQ-170 kontrolü (persisted call düşer / süren kalır, metin öneki tüketilir, önceki koşu tüketmez, trim toleransı, fail-open, mark rebase, thinking kuralı, parse edilemeyen satır çağrıyı yutmaz, boş transcript regresyonu) — hepsi PASS; komşu testler (chat, lokma-message, ws, submit-guard) PASS; root `bun x tsc --noEmit` 0.

**Canlı prob:** `scripts/probe-tool-row-dedupe.cjs` (MutationObserver ile HER DOM durumu; 3 `read_file` çağrılı gerçek koşu, 3 tool_start frame):
- Düzeltilmiş build: `max-seen 1x` + `live-seen yes` (üçü), bitişte her satır tam 1, canlı blok 0 — **9/9 PASS**.
- Eski build (`2be8e34`, aynı ölçüm aracı): `max-seen 2x` → FAIL — kullanıcının gördüğü çift birebir yakalandı.

**Kapılar:** steril web build yeşil; `pm2 restart lokma-web` sonrası servis edilen bundle == disk `index-CEadL_8F.js`; prob oturumu silindi + GET→404 re-check.
