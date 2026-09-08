# REQ-062 — Auth zorunluluğu + superadmin/admin/çalışan rolleri + todo claim mimarisi

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "config'den auth açıksa hesapla login olmadan web harness'e ulaşılamasın. rol tanımları olacak, onun için detaylı araştırma yap: superadmin, admin, çalışan — çalışan sadece adminlerin izin verdiği projelerde kendi özel session'larını açacak; ayrıca birden fazla çalışanın aynı yerde çalışması için uygulamanın kendi içinde todo sistemi ve todo'yu AI yapmaya başlayınca oto-assign etmesi, başka bir ajanın o görevi kapmaması lazım — bunlara dikkat eden bir mimari kur".
- **Research (yapıldı):**
  - Roller BUGÜN: global `admin|member|viewer` + proje üyeliği `member|viewer` (`lokma-shared/schemas/auth.ts`, `lokma-core/auth/store.ts` `can()`). `superadmin` YOK, `çalışan` kavramı YOK (en yakın: member).
  - Gate BUGÜN: `AuthSettings`'te `enabled` anahtarı YOK — kural "ilk admin kaydolana kadar instance açık" (bootstrap). Web `App.tsx`'te login guard YOK — Auth sadece bir pane; API route'ları token istiyor, arayüz istemiyor. (Canlıda nginx basic-auth var ama o uygulama-dışı.)
  - Lock deseni MEVCUT: `lokma-core/agents/locks.ts` — `.agentlocks/locks/<sha1>.json` + `acquire(owner, leaseMs)` + `heartbeat` + süresi dolmuşu devralma. Todo claim bunun ÜSTÜNE kurulur, sıfırdan icat edilmez.
  - Todo sistemi YOK ( ne core'da ne web'de).
- **Parça A — config auth gate:** `AuthSettings`'e `requireLogin: boolean` (default false — mevcut davranışı bozmaz). `true` iken: web boot'ta `/api/auth/me` 401 ise TAM EKRAN login (App düzeyinde guard, pane değil); WS handshake token'sız reddedilir. Config'den (`settings.json`) + AuthPane'den değiştirilir.
- **Parça B — roller:** `superadmin` (instance sahibi: kullanıcı/rol yönetimi + tüm projeler + auth ayarları; tekil sayılmaz, devredilebilir) > `admin` (proje açma/kapatma, üye davet, proje içi her şey) > `calisan` (SADECE üye olduğu projeleri görür, SADECE kendi session'larını açar/görür — чужой session listede bile görünmez; proje oluşturamaz). Mevcut `member`→`calisan`, `viewer`→salt-okunur misafir olarak korunur (migration: veri kaybı yok). `can()` matrisine `session:view-own` / `session:view-all` ayrımı eklenir.
- **Parça C — todo + oto-assign mimarisi (claim deseni):**
  - `todos.json` (proje başına): `{id, title, status: open|claimed|done, claimedBy(sessionId+userId), leaseUntil, heartbeat}`.
  - AI bir todo'ya başlarken TEK atomik yazmada `open→claimed` + `claimedBy` + `leaseUntil=now+5dk` yazar; dosya zaten `claimed` ve lease canlıysa ikinci ajan RED alır ("X session'ında yapılıyor").
  - Agent loop her ~60sn `heartbeat` atar; loop ölürse lease düşer → todo otomatik `open`'a döner (yetim kalmaz).
  - UI: proje içinde Todo pane (açık/benim/devam eden/bitmiş), manuel assign + AI'ya "şunu yap" butonu.
  - Çakışma kuralı: aynı session'dan tekrar claim = idempotent OK; farklı session + canlı lease = RED; claim'siz dosya yazımı bleibt serbest (todo'suz hızlı işler ölmez) ama todo'lu dosyalarda lock dosyasıyla çakışma uyarısı.
- **Touched (plan):** shared auth schema (superadmin/calisan + requireLogin), core store (`can()` + session scoping + todos store + claim), server routes (guard + `/api/todos/*`), web (App login guard + Todo pane + rol rozetleri), Docs/36 güncellemesi.
- **Verify (plan):** root+web+srv tsc 0, build'ler green, restart'lar, headless E2E: loginsiz 401/login ekranı + calisan izolasyonu (чужой session görünmez) + çift-claim RED kanıtı, bundle match.
