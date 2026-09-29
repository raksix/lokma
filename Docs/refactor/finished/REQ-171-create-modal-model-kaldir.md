# REQ-171 — Create bot/agent modalından "Model" alanı kaldırılsın (composer'dan seçiliyor)

**Status:** done (2026-09-29) — kod `e468ff4` (web) + prob `03e760b` (probe); canlıda doğrulandı
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

## Kapanış kanıtı (2026-09-29)

**Uygulama:** Model alanı iki create diyaloğundan da kaldırıldı — `bot-dialog.tsx` / `agent-dialog.tsx` artık Model label/input çizmiyor (Visibility ve Persona tam genişlik kaldı, görünür label kuralı korundu); `CreateBotForm` / `AgentForm`, `emptyCreateForm` / `emptyAgentForm` ve `validateCreateForm` / `validateAgentForm`'dan model düştü; `bots-mode.tsx` ve `bots-pane.tsx` create gövdeleri `model` göndermiyor. Mevcut kayıtlar korunur: sunucu `body.model === undefined` durumunda alanı yazmaz (create'te varsayılan `anthropic/claude-4-sonnet` uygulanır), patch yolları yalnız değer verilince modele dokunur — güncelleme akışları model'i boşaltmaz.

**Birim:** `bots.test.ts` 49/49 + `agents.test.ts` 53/53 PASS (yeni "create form carries no model field" kontrolleri dahil).

**Canlı prob:** `scripts/probe-create-modal-no-model.cjs` (minted Bearer; login gate AÇIK) — **39/39 PASS**:
- Agent: rail Agents → Settings modal → Agent Hub → Create — `#agent-model` YOK, 'Model' kelimesi diyalog gövdesinde hiç geçmiyor; Persona/Name/cwd/bütçe alanları duruyor; oluşturma gerçek kayıt açtı (model = sunucu varsayılanı); mevcut ajanların model'i değişmedi.
- Bot: Bots modu → New Bot — `#bot-model` YOK, Visibility duruyor; oluşturma gerçek kayıt açtı; bot sohbeti açıldı ve composer model seçicisi (`#lokma-composer-model`) render oldu; bot'a bağlı oturum mint edildi; mevcut botların model'i değişmedi.
- Cleanup: session → bot → agent silindi (HTTP 200 ×3) + "stays gone" API re-check; 0 sayfa JS hatası.
- Ekran görüntüleri: `assets/REQ-171-ss1-agent-dialog.png`, `assets/REQ-171-ss2-bot-dialog.png`.

**Kapılar:** root + web `bun x tsc --noEmit` 0; steril web build yeşil; `pm2 restart lokma-web` sonrası servis edilen entry == disk `index-Czl2eOZG.js`; canlı entry'de `bot-model` 0 / `bot-visibility` 1, taze `agents-pane-NydMaCrm.js`'te `agent-model` 0 / `agent-persona` 1; tokenless `/api/auth/me` 401 (gate ON); prob artığı sıfır (agents/bots/session dosyaları temiz).

**Kapsam notu:** Botu gerçek bir model koşusuyla çalıştırma bu probda yapılmadı (metreli upstream) — composer'dan model seçme zinciri mevcut REQ-130 kanıtlarına dayanıyor; burada sohbet açılışı + seçicinin render'ı doğrulandı.
