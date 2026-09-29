# REQ-174 — "Thinking seviyesi değişmiyor gibi": zinciri kanıtla, uygulanan seviyeyi görünür yap

**Status:** pending
**Tarih:** 2026-09-29
**Kaynak:** Kullanıcı mesajı + ekran görüntüleri (29 Eyl 2026):
> "thinking seviyesi değişmio gibi siktritme aq"
**Ekler:** `assets/REQ-174-ss1-composer-thinking-off.png` (composer'da `Thinking Off`), `assets/REQ-174-ss2-sohbet-thinking-sorusu.png` (sohbette "thinking off değil mi" testi)

## Belirti

Kullanıcı composer'daki **Thinking / Effort** seçicisini değiştirdiğinde **hiçbir şeyin değişmediğini** düşünüyor: çip `Thinking Off` gösteriyor, seviye değişse bile **görünür bir etkisi yok** ve koşu/mesaj sonrası **uygulanan seviyeyi gösteren hiçbir iz yok** (meta satırı yalnız `4.8k · $0.00 · model` yazıyor).

## Bugünkü durum (zincir mevcut — teşhis şart)

- **Composer:** `components/chat/composer.tsx` — `THINKING_LEVELS` (Off/Low/Medium/High...), `readThinking()` (localStorage `lokma-composer-thinking`), menü seçimi `setThinking` + `localStorage.setItem` (satır ~755), gönderimde `onSend({ ..., reasoningEffort: thinking })` (satır 331).
- **İstemci:** `components/chat/index.tsx:368` — `reasoningEffort: s.reasoningEffort === 'off' ? undefined : s.reasoningEffort` → `sendText` → WS `prompt` frame (`lib/ws.ts:152-160`), şema `packages/lokma-shared/src/protocol/ws.ts:96` (zod enum, optional).
- **Adaptörler (lokma-ai):** Chat-Completions `reasoning_effort`, Responses `reasoning: { effort }`, Anthropic `thinking: { budget_tokens }`; `clampEffort()` + **process-lifetime "rejected" memo** (`packages/lokma-ai/src/provider/reasoning.ts:79` — *"Process-lifetime memory of upstreams that rejected a reasoning field"*): 400 + capability sinyali görülürse o `base|model` için alan **sessizce bir daha gönderilmez**.
- **Ölçülmüş model davranışı:** seçili model `deepseek/deepseek-v4.1-flash` alanı **kabul ediyor** ama stream'de `reasoning_content` **göndermiyor** ve effort farkı ~görünmez (off↔high ölçümü: anlamsız fark) — yani "değişmiyor gibi" hissi **kısmen gerçek bir model davranışı** olabilir; kök neden teşhisle ayrılmalı (gerçek bug mı, model mi).

## Kapsam

1. **Uçtan uca teşhis + kanıt:** seçilen seviyenin **giden istek gövdesine** gerçekten girdiği gösterilir (alan var mı, değeri ne; `memo`/clamp yüzünden düşüyor mu; hangi koşulda düşüyor). Bulunan her gerçek boşluk düzeltilir (örn. memo yanlış-pozitifi: destekleyen upstream'e yeniden şans verilmesi / memo'nun en azından log+probe ile görünür olması; hero/starter kart yolunun da seçimi taşıması).
2. **Görünürlük (asıl UX düzeltmesi):** uygulanan seviye **koşu/mesaj meta satırına** yazılır (örn. `thinking: high`) ve koşu başına saklanır; böylece "değişti mi?" gözle doğrulanabilir. Composer çipindeki bekleyen seçim de net kalır (mevcut).
3. **Dürüstlük:** seçili model akıl yürütmeyi yayınlamıyorsa (v4.1-flash `reasoning_content` göndermiyor) UI bunu **belirtir** (çip ipucu/not: *"seviye iletilir; bu model akıl yürütmeyi yayınlamaz"*) — kullanıcı "değişmiyor" sanmak yerine durumu bilir. Uydurma davranış vaadi yok; ölçüm neyse o yazılır.
4. **Kalıcılık:** seviye seçimi sayfa yenilemesi/session değişimi sonrası korunur (localStorage) — unit + canlı prob ile teyit.
5. **Regresyon:** `off` seçiliyken alan HİÇ gönderilmez (eski istek şekli korunur) — mevcut davranış korunmalı.

## Kabul (kabul kriterleri)

- Yeni canlı prob `scripts/probe-thinking-effectiveness.cjs`:
  - (a) **Off** koşusunda giden gövdede reasoning alanı YOK; **High** koşusunda `reasoning_effort: "high"` (veya Responses/Anthropic karşılığı) VAR — ham istek kanıtı (proxy/log/echo).
  - (b) İki koşunun mesaj meta satırında `thinking: off` / `thinking: high` görünür.
  - (c) Composer'da seçim → reload → seçim korunur.
  - (d) Model reasoning yayınlamıyorsa UI notu görünür (v4.1-flash senaryosu).
- Birim testler: seçim → frame alanı; off→alan yok; kalıcılık; meta satırı eşlemesi.
- Kapılar: `bun x tsc --noEmit` 0; ilgili testler güncel; sterilize build; pm2 tek-proc restart; canlı bundle == disk hash.
- REQ dosyasına before/after kanıt ekleri (ekran görüntüsü + prob çıktısı).

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/chat/composer.tsx` (+ chip tooltip/notu)
- `packages/lokma-web/web/src/components/chat/index.tsx` (meta satırı: uygulanan effort)
- `packages/lokma-ai/src/provider/reasoning.ts` (memo davranışı teşhisi/düzeltmesi) + adaptör gövdeleri
- gerekirse `packages/lokma-web/server/src` (koşu kaydına effort alanı) ve shared protokol

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Kullanıcı kuralı: SADECE `deepseek/deepseek-v4.1-flash` kullanılıyor — bu modelin effort'u "kabul edip görünür fark üretmemesi" bilinen bir ölçüm; REQ'in hedefi sistemi **kanıtlanabilir** kılmak ve hissi bilgiye çevirmek (görünmezse dürüstçe söylemek).
- Write-only: kod yazılmadı; worker uygular.
- İlişkili: REQ-133 (thinking picker), REQ-139 (merdiven + clamp), REQ-143 (kompakt menü).
