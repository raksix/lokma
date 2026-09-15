# REQ-148 — Pane'de session değiştirince mesaj geçmişi otomatik yüklenmiyor

**Status:** done (2026-09-15) — store fix `0bb1f8c` + prune fix `efa12da` + live before/after probe
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-web/web/src/components/chat/index.tsx` (`ChatWithSocket`/`Chat`),
`components/panes/pane.tsx` (session tab), `stores/session.ts` (`loadTranscript`)

## İstek (verbatim)

> bu arada bi sessiona pane açınca ben session değiştirince mesaj geçmişleri oto
> yüklenmiyor.

## Teşhis notları (canlı, bu oturum)

- Oturum pane olarak açıldığında sohbet `ChatWithSocket` ile kendi WS'ini kurar
  (`/ws/<sessionId>`) ve transcript'i `loadTranscript(sessionId)` ile çeker.
- `loadTranscript` iki durumda **ağa çıkmadan** boş döner:
  1. `transcripts[id]` zaten var ve `stale[id]` değilse (önbellek taze),
  2. `listLoaded && !sessions.some(s => s.id === id)` ise → **boş transcript
     yazılır** ("sunucunun bilmediği yerel id" varsayımı).
- `GET /api/sessions` cwd-scoped olduğu için, başka bir projeye ait (ya da liste
  yenilenmeden önce açılmış) bir oturum bu koşula takılırsa ekranda **kalıcı boş
  geçmiş** görünür ve hiç istek atılmaz — kullanıcının tarif ettiği tablo.
- Ek kanıt (canlı koşu): istemci `/api/sessions/sess_mu2i98sq_y03j` için **404**
  alıyor (sunucu bu id'yi tanımıyor) ve aynı anda o id için bir WS açıyor; yani
  yeni/yerel bir oturum kimliği listeye hiç girmeden görünür olabiliyor.
- **Yanlış iz olmasın (ölçüldü):** oturum değiştirince "1 balon göründü" diye bir
  koşu var; o oturumun (`sess_mu2hs3ft_8y67`) dosyası **o an 1 satırdı** (107 B),
  sonradan probun kendi promptuyla 32 satıra çıktı. Yani o gözlem bug değil —
  hedef oturum gerçekten boştu. Gerçek arıza için "listede olmayan id" koşulu
  (yukarıdaki 404 vakası) üzerinden üretilmeli.

## Kabul kriterleri (öngörü)

1. Pane'de session değiştirildiğinde yeni oturumun geçmişi **otomatik** yüklenir;
   kullanıcı sayfayı yenilemek zorunda kalmaz.
2. Liste önbelleği oturumu tanımasa bile görünür pane için tek bir doğrulama
   isteği atılır (`loadTranscript(id, force)` benzeri) — gerçekten yoksa boş
   durum gösterilir, "sessiz boş" değil.
3. Önbellekte taze transcript varsa gereksiz istek atılmaz (mevcut davranış korunur).
4. Oturum değişiminde canlı trace/stream kalıntısı yeni oturuma taşınmaz.

## Verify planı (öngörü)

- Prob: A pane'de açık → B'ye geç (farklı proje dahil) → pane B'nin satırlarını
  gösteriyor mu; istek sayısı ve `transcripts` doluluğu ölçülür.
- Ağ ölçümü: görünür pane için en az 1 `GET /api/sessions/<id>` çıkmalı (şu an 0).

## Notlar

- REQ-144'te aynı sınıf hata (4 sn'lik listede kimlik çalkantısı) düzeltildi; bu
  istek **önbellek-boş-dönüş** yolunu hedefliyor, farklı bir kök neden.

## İlerleme (tur 1, 2026-09-15 — commit `0bb1f8c`)

**Store düzeltmesi commit'li.** `stores/session.ts → loadTranscript` içindeki
"liste bu id'yi bilmiyorsa boş önbellekle, hiç istek atma" kısayolu kaldırıldı:
`sessions` 4 sn'lik poll'un anlık görüntüsü — WS'in yeni yarattığı oturumu
geciktirir ve göremediği satırları düşürür — yani "listede yok" yokluk kanıtı
değil. Eski davranışta görünür pane o durumda `[]` yazıp hiç istek atmıyordu
(kullanıcının "geçmiş oto yüklenmiyor" tablosu: 0 istek, sessiz boş). Artık her
görünür yükleme TEK doğrulama GET'i atar; gerçek oturum geçmişini döndürür,
gerçekten yoksa mevcut `session_not_found` dalına düşer (boş durum, hata yok).
Kriter 3 korunuyor (taze önbellek istek atmaz), `force` (post-stream) akışı
aynen duruyor. Kriter 4 zaten yapısal: pane session sekmesi
`<ChatWithSocket key={tab.sessionId}>` ile remount ediyor (canlı trace taşınmaz).

Kanıt:
- `bun src/stores/stores.test.ts` PASS — yeni sözleşme: "an off-list session
  still fires the verification GET", "off-list session loads its real history
  instead of a cached empty", "unknown id fires one verification GET", "a true
  miss caches an empty transcript", "the cached empty result does not refetch".
- Tüm web test dosyaları koşuldu: yalnız main'de önceden kırık olan
  a11y (3) + narrow-layout (5) + ws (1) FAIL — REQ-145'te stash ile doğrulanan
  baseline, bu değişiklikle ilgisiz.
- Root `bun x tsc --noEmit` 0 · web `bun x tsc --noEmit` 0 · vite build yeşil
  (temp outDir `/tmp/lokma-web-gate-148`; canlı `dist` bilinçli olarak
  dokunulmadı — ağaçta kardeş oturumun REQ-150/151/152 WIP'i var).
- **Kalan (tur 2+):** canlı deploy (`dist` build + `pm2 restart lokma-web`) +
  canlı prob `scripts/probe-pane-history.cjs` (A pane → B'ye geç, satırlar +
  `GET /api/sessions/<id>` ≥1 ölçümü). Deploy, ağaç temizlenene kadar
  (kardeş commit'i ya da devralma) ertelendi: aksi halde commit edilmemiş
  kardeş değişiklikleri canlıya basılırdı.

## İlerleme (tur 2, 2026-09-15 — commit `efa12da`, probs `9bec76d`, deploy `index-WaKqpL9U.js`)

**İkinci katman bulundu ve kapatıldı: 4 sn'lik liste poll'u taze transcript'i
siliyordu.** Tur 1 store düzeltmesiyle pane artık geçmişi YÜKLÜYORDU ama canlı
ölçümde 1 saniye sonra kayboluyordu (satırlar 6 → 0, ekranda boş hero —
`/tmp/req148-debug.log`). Kök neden: `refreshSessions` + `refreshSessionsQuiet`
önbelleği liste üyeliğiyle buduyordu (`ids.has(id)` filtresi) — liste bir
ANLIK GÖRÜNTÜ, yokluk kanıtı değil; görünür bir pane'in okuduğu taze kaydı
sildiği için pane okuma ortasında boşalıyordu.

Fix: `keepSessionCacheEntry(id, listIds, stale)` — liste görmese bile TAZE
kayıt budanmaz (taze kayıt sunucudan geldi, sunucu o oturumu biliyor); yalnız
STALE kayıtlar (refetch bekleyen / silinmiş oturum) liste üyeliğine göre
budanır. `stores/session.ts` iki refresh yolu da bu politikayı kullanır.

**Gates:** `bun src/stores/stores.test.ts` ALL PASS (yeni: taze off-list kayıt
4 sn poll'una dayanır, stale kayıt budanır, policy birim assertleri) · web
`tsc --noEmit` 0 · steril `bun run build` yeşil (`index-WaKqpL9U.js`).

**Deploy:** `pm2 restart lokma-web` → servis edilen entry == disk
(`assets/index-WaKqpL9U.js`), sourcemap'te `keepSessionCacheEntry` var.

**Canlı prob (aynı sunucu, aynı URL — tek fark bundle):**

| Koşu | Sonuç |
|------|-------|
| `--expect before` (eski bundle `index-BntVOS51.js`, `--html-entry` client-side rewrite) | BUG: geçişte **0 doğrulama isteği**, pane **boş** (rows=0); kontrol oturumu yeşil (rows=5) |
| `--expect after` (canlı bundle) | **2× GET 200**, pane geçmişi render (rows=6, sunucu count 18), **içerik eşleşti** (son user mesajı birebir), sekme turlaması iki geçmişi de koruyor, 12/12 PASS |

Prob, "liste snapshot'ı bu id'yi bilmiyor" koşulunu deterministik üretir:
`/api/sessions` yanıtlarından gerçek bir oturum (18 mesajlık) her snaphot'ta
çıkarılır; tab localStorage'a seed edilir, reload sonrası sekmeye tıklanır.

**Notlar / takip adayları (bu REQ kapsamı dışında):**
- Ham GET sayımı assert EDİLMEDİ: her chat mount'u ayrıca oturum meta'sı +
  run durumu çeker ve done-sonrası yol bilerek refetch eder; URL sayımı
  `loadTranscript` cache isabetini izole edemiyor. Kriter 3 sözleşmesi store
  testlerinde kanıtlı ('fresh transcript skips refetch').
- Mount başına `loadTranscript` iki kez çağrılıyor (effect1 + effect2, dedupe
  yok) ve bir model-meta `getSession` + run poll ekleniyor → sekme başına
  2-4 detay isteği. Ayrı bir iyileştirme adayı.
