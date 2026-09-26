# REQ-161 — Bots ayrı bir mod olsun: üstte lokma/Bots geçişi + Grok tarzı bot listesi ve sohbet UX'i

**Status:** in-progress (tick 1, 2026-09-26 — mode switch + bot list + bot chat landed; rail/panes/composer removals + gallery action re-homing still pending)
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026, 3 ekran görüntüsüyle) — birebir:

> "lokma bots ui böle olacak bu bok gibi. ayrıca lokma bots şuntaki sistemn ayır kısımda olcak tamamen. bots modu sçelince sessionlar kısmında sesisonlar değil botlar gözükcek. üstünde de new bot falan yazcak. onuın için en sdieberdalar dadeğil üste lokma yazna yerin yanına bots ekle sol sağ sküçük dikey menülerinden de lokamb botksu kaldır. bots sçeilince deidğimö gib bots arayüzü açılcak sana attığımmssler gibi ux olsun. lokma yazan kısma basınca normal şuanki mod çılcak."

**İstenen (özet):**
- Bots arayüzü ss'lerdeki gibi olacak (mevcut galeri "bok gibi" bulunuyor) — solda bot listesi, sağda seçili botun sohbeti.
- Bots, mevcut sistemden TAMAMEN ayrı bir kısımda/moda olacak.
- Bots modu seçilince oturumlar panelinde oturumlar değil BOTLAR görünecek; üstünde "New Bot" olacak.
- Üstte "lokma" yazısının yanına "Bots" geçişi eklenecek; "lokma"ya basınca normal (mevcut) mod açılacak.
- Sol/sağ küçük dikey menülerden (rail'lerden) "Lokma Bots" girişleri kaldırılacak.

**Görseller (referans):**
- `Docs/refactor/assets/REQ-161-ss1-grok-referans.png` — hedef UX (Grok Bot tarzı): sol panelde arama + bot satırları (avatar, ad, zaman, son mesaj önizlemesi), ana alanda seçili botun sohbeti.
- `Docs/refactor/assets/REQ-161-ss2-grok-referans.png` — aynı UX'in sohbet detayı (başlık + avatar, balonlar, kontrol listesi, alt composer).
- `Docs/refactor/assets/REQ-161-ss3-header-crop.png` — canlı Lokma header kesiti: `[L] lokma | sess_… Active` → "Bots" geçişinin gideceği yer.

## Bugünkü durum

- Bots bugün bir **pane/galeri**: `components/bots/bots-pane.tsx` (Featured/Mine/Shared sekmeleri + kart ızgarası + detayda Run/Fork/Publish/bot.json + lifecycle şeridi) ve İKİ dikey ikon şeridinden açılıyor: `components/shell/activity-bar.tsx` (`{ key: 'bots', label: 'Bots', Icon: Bot }`) ve `components/shell/inspector-rail.tsx` (`{ tab: 'bots', label: 'Bots', Icon: Bot }`); ayrıca `components/panes/panes.ts` sekme tanımı ve composer'daki bot seçici (`components/chat/index.tsx`).
- Oturumlar paneli (`components/sessions`, app-shell'de `SessionsSidebar`) yalnızca oturumları listeliyor; botlar için ayrı bir mod yok.
- Bot altyapısı canlı ve hazır: `GET /api/bots` (`packages/lokma-web/server/src/routes/bots.ts`), bot-bağlı oturumlar (REQ-027), `bot-dialog.tsx` ile gerçek oluşturma akışı, `Bot` şeması (`lokma-shared/src/schemas/bot.ts`), `lokma-core/src/bots`.

## Kapsam

1. **Üst geçiş (mod switch).** `components/header.tsx` marka bloğuna (`[L]` + `lokma` yazısı) komşu bir **Bots** kontrolü ekle (ss3'teki yer; "lokma"nın hemen sağı). Davranış: `Bots` tıkla → Bots modu; `lokma` tıkla → normal mod. Aktif mod görünür şekilde vurgulanır (mevcut header diline uygun hafif pill/alt çizgi). Mod durumu uygulama düzeyinde tutulur; kalıcılık tercihi: son mod hatırlanır.
2. **Bots modu = ayrı bölüm.**
   - Oturum panelinin yerini **bot listesi** alır: üstte arama + **"+ New Bot"** (ss'teki gibi); satırlar: yuvarlak avatar + bot adı + son etkinlik zamanı + son mesaj önizlemesi (varsa okunmadı noktası — basit tut). Veri: `GET /api/bots` + botun son oturumu (preview = son mesaj, zaman = son etkinlik).
   - Bir bot seçilince ana alan **bot sohbeti** olur (ss1/ss2 dili): başlıkta avatar + bot adı; mesaj balonları; sistem/etkinlik satırları; botun ajan çalıştırması için durum kartı (ss'teki "Computer · Done · …" kartının Lokma karşılığı). Alt composer: "+" + `Message <bot adı>` + gönder — mevcut bot-bağlı oturum akışını kullanır (mesaj gerçekten iletilir).
   - **+ New Bot** mevcut gerçek oluşturma dialog'unu açar (`bot-dialog.tsx`) — ölü buton yok.
   - Galerinin yetenekleri KAYBOLMAZ: fork / publish / delete / bot.json / run-agent yeni düzende erişilebilir kalır (yer implementasyona bağlı; örn. bot başlığındaki menü veya detay paneli).
3. **Dağınık girişleri kaldır.** `activity-bar.tsx` ve `inspector-rail.tsx`'teki 'Bots' girişleri kaldırılır; bots normal modda pane/sekme olarak açılmaz (`panes.ts` bots sekmesi ve ilgili yollar temizlenir). Composer'daki bot seçici de normal moddan çıkarılır ("tamamen ayrı" gereği).
4. **Mod izolasyonu.** Normal moddan Bots'a geçip dönünce normal modun açık sekmeleri/pane düzeni AYNEN korunur; Bots modunda seçili bot ve sohbeti korunur. Bots modu ss'lerdeki gibi sade görünür (rail/krom yok).
5. **Kapsam dışı:** `concept/` (ayrı prototip) — bu REQ yalnızca `packages/lokma-web` (web; gerekiyorsa server).

## Kontrol (kabul kriterleri)

- Header'da `lokma` + `Bots` yan yana; `Bots` → bot listesi + sohbet düzeni; `lokma` → normal mod ve önceki düzen bozulmamış.
- Bots modunda panel botları listeler (avatar/ad/zaman/önizleme) ve üstte `+ New Bot` durur; normal modda yine oturumlar listelenir.
- Bir bot seç → sohbet açılır; gönderilen mesaj gerçekten iletilir (bot-bağlı oturum); yeni bot oluşturma gerçek çalışır.
- İki rail'de Bots girişi YOK; normal modda bots pane açılamıyor; composer'da bot seçici yok.
- Kapılar: `bun x tsc --noEmit` 0; sterilize build yeşil; pm2 tek-proc restart; canlı bundle = disk hash; yeni canlı prob `scripts/probe-bots-mode.cjs` (geçiş + liste + sohbet + rail temizliği) yeşil; oturum/pane/composer regresyonları bozulmamış.
- UI dili mevcut üslup: İngilizce ("New Bot", "Message <name>", "Search").

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/header.tsx` (mod geçişi; marka bloğu)
- `packages/lokma-web/web/src/components/app-shell.tsx` (mod durumu + panel içeriğinin değişmesi)
- `packages/lokma-web/web/src/components/sessions/*` (bot listesi varyantı) ve `components/bots/*` (yeni liste + sohbet UX'i)
- `packages/lokma-web/web/src/components/shell/activity-bar.tsx`, `inspector-rail.tsx`, `components/panes/panes.ts` (girişlerin kaldırılması)
- `packages/lokma-web/web/src/components/chat/index.tsx` (composer bot seçicisinin kaldırılması)
- Gerekirse `packages/lokma-web/server/src/routes/bots.ts` (liste için son mesaj/zaman alanı)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Referans: Grok Bot (x.ai/bot) — "AI teammates" düzeni: sol = botların listesi (avatar/ad/zaman/önizleme), ana alan = seçili botla sohbet; koyu tema; yuvarlak avatarlar; sıcak tonlu sistem metinleri; altta composer.
- Görseller: vision MCP'leri 26 Eyl'de kotalı ("insufficient credits"); gerekirse doğrudan CommandCode `chat/completions`'a `image_url` (data URL; model `deepseek/deepseek-v4.1-flash`) ile sorulabilir.
- Belirsizlikler: composer bot seçicisinin akıbeti (tercih: kaldır — "tamamen ayrı"); okunmadı noktası basit tutulur; klavye kısayolu istenmedi.

## İlerleme (tick log)

- **tick 1 (2026-09-26)** — landed:
  - `components/bots/mode.ts` — `AppMode` (`chat` | `bots`) + `lokma-app-mode:v1` / `lokma-bots-selected:v1` storage helpers.
  - `header.tsx` — `lokma | Bots` segmented switch beside the brand (`data-mode-switch` hooks); active chip ink-filled; `lokma` always returns to the normal mode.
  - `app-shell.tsx` — app-level mode state + a dedicated Bots branch (no rails/sidebars/tiling; header + footer keep status); the normal mode's stores stay untouched.
  - `components/bots/bots-mode.tsx` — Grok-style surface: left `+ New Bot` + search + rows (avatar / name / relative time / last-message preview, live run dot), right = the selected bot's chat with a `Message <bot name>` composer; the real create dialog is re-used and the first open mints the bot-bound session (`POST /api/sessions { botId, model }`).
  - `server/src/bot-sessions.ts` + `GET /api/bots?sessions=1` — joins each bot's newest session (`lastSession: { id, title, updatedAt, preview, running, queued }`).
  - `scripts/probe-bots-mode.cjs` — live gate 20/20 PASS (switch both ways, list, row → chat, reload persistence, chrome-free Bots surface).
  - Deployed: served bundle `index-DpkKeraQ.js` == disk; tokenless `/api/auth/me` still 401 (gate ON).
- **pending (next ticks)** — remove the rail/panes entries (activity-bar, inspector-rail, panes.ts, inspector-host, inspector-panel, extras), remove the composer bot picker, re-home the gallery actions (fork / publish / delete / bot.json / run-agent) into the new layout, then the close-out.
