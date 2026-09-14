# REQ-140 — Sohbet nokta rayı: sadece kendi promptların + tıklayınca oraya git

- **Durum:** done
- **Tarih:** 2026-09-14
- **İstek (kullanıcı):** "kanka sohbetin sağındaki noktalar var ya, onlar sadece benim yazdığım promptlar olsun, bir de tıklayınca oraya gitsin"
- **Dosyalar:** `packages/lokma-web/web/src/components/chat/single-chat-view.tsx`, `.../single-chat-view.test.ts`, `scripts/probe-prompt-rail.cjs`

## Belirti

Sağdaki dikey nokta rayı her render edilen satır için bir nokta çiziyordu. Ama `chat-msg-<index>` id'sini yalnızca **user** ve **assistant** satırları taşır; tool/thinking satırlarında id yoktur. Sonuç:

- bir session'da onlarca nokta birikiyordu (asistan cevapları + tool satırları da sayılıyordu),
- tool/thinking satırlarına denk gelen noktaların çoğu **hiçbir yere kaydırmıyordu** (ölü nokta),
- "şu prompta dön" niyeti kayboluyordu: noktalar kullanıcı promptlarını değil, transcript satırlarını temsil ediyordu.

Ek olarak ray yalnızca **render edilen pencereyi** tarıyordu; uzun bir session'da pencerenin dışında kalan (yani "Show earlier messages" ile açılacak) promptların noktası hiç yoktu.

## Fix

- **`promptAnchors(messages)` (saf + unit testli):** transcript'i tarar, yalnızca `role === 'user'` satırlarını çıkarır ve `{ index, label }` döner. `index` **mutlak transcript index'idir** — aynı zamanda `chat-msg-<index>` scroll hedefidir, dolayısıyla pencere kaysa da hedef şaşmaz. Asistan/tool/thinking satırları atlanır (yorum satırları, araya giren her araç turu).
- **`promptLabel(content, max = 48)`:** promptu tek satıra indirir (`\s+` → boşluk), 48 karakterde `…` ile keser, boş prompta `Empty prompt` der. Nokta tooltip'i (`title="Your prompt N: …"`) ve `aria-label` bu etiketi kullanır.
- **Tüm transcript üzerinden ray:** `anchors` artık `transcript.slice(window.start)` değil, **komple `transcript`** üzerinden hesaplanır — pencerenin dışındaki promptlar da nokta alır.
- **Tıklayınca gerçekten gitme (`jumpToPrompt`):** hedef satır mount edilmişse doğrudan `scrollIntoView({ block: 'center' })`; mount edilmemişse (pencere dışında) önce render penceresi genişletilir (`setShownCount`), sonra iki `requestAnimationFrame` sonrası kaydırma yapılır — yani satır DOM'a girdikten sonra.
- **Aktif nokta takibi:** scroll dinleyicisi görüntü alanının üstünde/üstüne en yakın promptu işaretler; hiçbiri görünmüyorsa mount edilmiş ilk promptu yakar (ray asla "konum yok" göstermez).
- **Çok promptlu session:** ray `max-h-[70vh]` + `overflow-y-auto` ile kayar; en altta eski "Back to top" noktası korunur.
- **Erişilebilirlik:** her nokta `aria-label="Go to your prompt N of M: <etiket>"` taşır (canlı prob bu kalıbı doğrular).

## Kanıt

- `bun packages/lokma-web/web/src/components/chat/single-chat-view.test.ts` → REQ-140 için **9/9 PASS**: sadece user satırları anchor oluyor, mutlak index korunuyor, pencere dışı promptlar kapsanıyor, prompt yoksa ray yok, satır sonu tek satıra iniyor, 48 karakter + `…`, boş prompt etiketi. (Dosyadaki REQ-111 interleave testleri de aynı koşuda 11/11 geçiyor.)
- **Canlı prob** `scripts/probe-prompt-rail.cjs` → `https://lokma.fermag.com.tr` üzerinde **13 passed, 0 failed** (2026-09-14 14:06; ilk koşu 13:52'de 11/11 idi, nokta hedefi + aktif nokta doğrulamaları sonradan eklendi):
  - Yeni session'da 3 prompt gönderildi: `PROMPT RAIL PROBE ONE`, `PROMPT RAIL PROBE TWO`, `PROMPT RAIL PROBE TWO` — **sonuncu bilerek tekrar**: aynı metin bile kendi noktasını almalı, çünkü nokta hedefleri prompt metni değil **transcript index'i** (`chat-msg-<index>`). Prob bu yüzden "nokta sayısı = gönderilen prompt sayısı" ve "hedefler artan sırada" kontrollerini yapar; o koşuda tekrar eden iki prompt ayrı satırlara (`chat-msg-24` / `chat-msg-25`) düştü.
  - Her noktanın etiketi `Go to your prompt N of M: <prompt metni>` kalıbında; tooltip'i prompt metnini taşıyor.
  - Transcript en alta kaydırılıp ilk noktaya tıklandı → hedef satır `chat-msg-1` çözüldü ve kaydırma gerçekten gitti (`scrollTop 2268 → 0`); varılan satır bir prompt satırı (`You` etiketiyle başlıyor) ve görünür.
  - **Tam olarak bir nokta** aktif prompt olarak işaretli (`1/3 highlighted`); beklenti sabit bir RGB değil, canlı `--color-terracotta` token'ından okunuyor (o koşuda `#c96442`) — palet yeniden temalansa da kontrol yanlış sebepten düşmez. Ray asla "konum yok" göstermiyor.
  - Başarısız istek yok (favicon + yeni session transcript 404'ü tasarım gereği ayıklanıyor).
  - Aksiyon yarışını önlemek için prob `reducedMotion: 'reduce'` emüle eder (`scrollBehavior()` `'auto'`ya düşer, tıklama animasyonla yarışmaz) ve tarayıcı/sunucu gerektirmeyen bir **`--self-test`** modu taşır: DOM'suz yardımcılar (`accentTriplet`, `benign`) 9/9 PASS.
  - Ekran görüntüsü: `/tmp/req140-prompt-rail.png`.
- Kapı: `bun x tsc --noEmit` 0 hata (commit `1368107` kapsamında).

## Commit'ler

- `1368107` feat(web): turn the chat dot rail into a prompt-only jump list
- `d7c09bc` test(web): cover the prompt-only rail anchors
- `00a6f5c` chore(scripts): live probe for the prompt rail
- `fd1ff29` feat(web): expose each rail dot's scroll target as `data-target`
- `ce374d5` test(scripts): assert the rail's dot count, targets and active dot

## Tuzaklar

- **`id` yalnızca user/assistant satırlarında:** raya yeni bir satır tipi eklenirse anchor hesabı ona göre güncellenmeli; aksi halde ölü nokta geri gelir.
- **Pencere + ray etkileşimi:** pencere dışındaki bir prompta atlarken önce pencere genişletilmezse `scrollIntoView` sessizce hiçbir şey yapmaz — bu yüzden genişletme + iki rAF şart.
- **`deepseek-v4.1-flash` gibi modeller** asistan satırı üretmese bile test 3 nokta bekler; prob bu yüzden satır sayısını değil, **kullanıcı satırı sayısını** referans alır (`rail.rows.filter(r => r.user)`).
