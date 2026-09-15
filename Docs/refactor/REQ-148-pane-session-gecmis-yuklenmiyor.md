# REQ-148 — Pane'de session değiştirince mesaj geçmişi otomatik yüklenmiyor

**Status:** in-progress (2026-09-15) — tur 1: store fix committed (`0bb1f8c`)
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
