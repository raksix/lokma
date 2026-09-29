# REQ-171 — Create bot/agent modalından "Model" alanı kaldırılsın (composer'dan seçiliyor)

**Status:** pending
**Tarih:** 2026-09-29
**Kaynak:** Kullanıcı mesajı + ekran görüntüsü (29 Eyl 2026, "Create bot" modalı):
> "create new modda model seçimi vs ypamammzıda gerek yok textareadan zaten seçebiliyoz ya"

## Bugünkü durum

- **Create bot** modalı — `components/bots/bot-dialog.tsx` (kullanım: `bots-mode.tsx` + `bots-pane.tsx`): alanlar → Name, Description, **Model** (`#bot-model` dropdown; ekran görüntüsünde `anthropic/claude-4-sonnet`), Visibility (Model ile aynı satırda), System prompt.
- **Create agent** modalı — `components/agents/agent-dialog.tsx` (kullanım: `agents-pane.tsx`): alanlar → Name, Persona, **Model** (`#agent-model`), Working directory.
- Composer (textarea) **zaten** model seçicisine sahip; zincir (REQ-130): per-prompt override → bot → session meta → config default → built-in.
- Bot oturumu açılırken `api.createSession({ botId, model: bot.model })` ile bot modeli tohumlanıyor (`bots-mode.tsx:145`); güncelleme yolu form.model'i yazıyor (`bots-mode.tsx:199`, `bots-pane.tsx:134`).

## Kapsam

1. **Create bot** modalından **Model** alanı KALDIRILIR (label + select + form state + submit gövdesi).
2. **Create agent** modalından da Model alanı KALDIRILIR (aynı gerekçe — "create new modal" geneli).
3. **Kayıt mekaniği:** model alanı gönderilmediğinde mevcut varsayılan zinciri işler (sunucu tarafı `body.model === undefined` → alan yazılmaz/varsayılan kalır); oluşturulan bot/agent'ın oturumunda **composer'dan seçilen model** geçerli olur.
4. **Uyumluluk (şart):** mevcut bot/agent kayıtlarındaki `model` alanı KORUNUR — güncelleme yolları (`bots-mode.tsx:199` benzeri form update'leri) model'i boşaltmamalı; kayıt verisi geriye dönük bozulmaz.
5. Form UX kuralı korunur: kalan tüm alanlarda görünür label'lar aynen (Name / Description / Visibility / System prompt; Name / Persona / Working directory). Visibility alanı KALIR (composer'dan seçilemez).

## Kabul (kabul kriterleri)

- Create bot ve Create agent modallarında **Model alanı YOK**; iki akış da başarıyla kayıt oluşturuyor.
- Oluşturulan botun sohbeti açılıp **composer'dan model seçilerek** çalıştırılabiliyor.
- Mevcut kayıtlı bot/agent'ların `model` alanı değişmemiş (API GET ile before/after karşılaştırması).
- Kapılar: `bun x tsc --noEmit` 0; ilgili testler (bots/agents) güncel; sterilize build; pm2 tek-proc restart; canlı bundle == disk hash; yeni canlı prob `scripts/probe-create-modal-no-model.cjs` (modalda Model yok + oluşturma akışı PASS).

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/bots/bot-dialog.tsx` + `bots-mode.tsx` + `bots-pane.tsx` (form state ve update yolları)
- `packages/lokma-web/web/src/components/agents/agent-dialog.tsx` + `agents-pane.tsx`
- gerekirse server: `routes/bots.ts` / `routes/agents.ts` (model yoksa varsayılan davranışı — mevcut görünüyor, doğrula)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Kullanıcı gerekçesi: *"textareadan zaten seçebiliyoruz"* — composer model seçicisi varken create anında model sormak gereksiz yük.
- Model alanı **silinen veridir değil**: yalnız formdan kalkar; mevcut kayıtlar ve (varsa) başka yüzeylerdeki gösterim korunur.
- Bu istek kullanıcı talebiyle yalnız REQ olarak eklendi (write-only); worker uygular.
