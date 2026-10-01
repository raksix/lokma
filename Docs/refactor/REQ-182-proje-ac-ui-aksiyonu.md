# REQ-182 — "Proje aç" UI'da da tek tıkla olsun: modal ajandan da açılabilsin

**Status:** pending
**Tarih:** 2026-10-01
**Kaynak:** Kullanıcı mesajı (1 Ekim 2026):
> "kanka amına koyayım proje aç diyince skill gibi proje açıcak dişrekt dosya oalrak açıo sikicem amk."

**İlişkiler:** [REQ-180](REQ-180-proje-ac-araci.md) (sunucu tarafı araç) · [REQ-181](REQ-181-ui-yuzeyleri-harness-araci-katalogu.md) (katalog). Bu REQ **UI yüzünü** açar; 180 olmadan bu REQ'in `ui_action` dalı boş kalır, 182 olmadan 180'ın kullanıcıya görünür izi yoktur. Uygulama sırası 180 → 182 → 181.

## Bugünkü durum (kanıt)

1. **Proje modalı istemci tarafında tam, elle dolduruluyor:** `packages/lokma-web/web/src/components/sessions/project-modal.tsx` — `POST /api/projects` çağırır, `name`/`cwd` alanları arasında çift yönlü öneri yapar (`suggestProjectName`/`suggestProjectCwd`, `auth.ts:181`), ayrıca bir yol seçici ile sunucudan `cwd` önerir (`:246`). Bu, **UI'da proje açma deneyiminin referansı** — aracın ve UI'nin aynı işi yapması gereken yer burası.
2. **Ajanın `ui_action` çerçeveleri tek bir yerde işleniyor:** `packages/lokma-web/web/src/components/app-shell.tsx:425-445` — `open_browser` / `open_terminal` / `open_session` / `send_to_session` dalları; her biri ilgili pane/modalı açar ve toast atar, sonra tek seferlik olarak düşürülür (`dismissUiAction`).
3. **`ui_action` tipi şu an dört eylemi tanıyor:** `UiActionPayload.action` = `'open_browser' | 'open_terminal' | 'open_session' | 'send_to_session'` (`packages/lokma-core/src/tools/ui-control.ts:40`). `open_project` yok; `web/src/lib/ws.ts:305` yalnız `uiActions` dizisine push ediyor, dallanma `app-shell.tsx`'de.
4. **Explorer'da "New Project" yolu zaten var:** sessions sidebar'da `showProjectModal` state'i + `ProjectModal` bağlanmış (`sessions-sidebar.tsx:725-737`), ve `REFRESH` sonrası otomatik oturum açılıyor. Yani **UI yolu sağlam**; eksik olan ajan yolu ve onun görünür geri bildirimi.
5. **Yarım kalmış bir geri bildirim riski:** REQ-088 (server-side yol önerisi) "oluşturma formu eksik dizin yüzünden 400 vermemeli" diye sözleşmişti. Ajan yolu bu sözleşmeyi **atlamamalı**: `open_project` kendi `cwd`'sini normalize edip oluşturur, UI modalı da aynı normalize fonksiyonu çağırır — iki uygulama yok.

## Kapsam

1. **Modal "proje açılıyor" modunda açılabilsin:** `ProjectModal` yeni bir açılış amacı alır (`mode: 'create' | 'agent-open'`). `agent-open` modunda:
   - `name`/`cwd` alanları **ajanın gönderdiği değerlerle doldurulur ve kilitli** (kullanıcı yanlışlığı düzeltebilir ama varsayılanı ezmez),
   - modal arkada bir **"Agent is opening this project"** satırı gösterir (kimin açtığı belli),
   - `Create` onayı projeyi zaten oluşturmuş bir çağrı için düğmeyi tekrarlamaz; kayıt `POST /api/projects` ile **değil**, doğrudan store üzerinden (tek yazma yolu) tamamlanır, yoksa ikinci kayıt doğar (bkz. REQ-180 idempotency).
2. **Toast + transcript:** `ui_action: open_project` işlendiğinde (a) toast `Agent opened project "fermag"` (yol ile), (b) **otomatik ilerleme**: modal açılır, kayıt tamamlanınca modal kapanır ve o cwd'de ilk oturum seçilir; kullanıcının 3 tıkla oraya ulaşması gerekmez. Bu, REQ-145'in (browser açınca yanda pane) "immediyeti" kuralının proje karşılığıdır.
3. **Sidebar'da görünür iz:** proje kaydı oluşunca sessions sidebar'da ilgili grup **otomatik açılır ve seçilir** (REQ-078 grupları); arama/kısıtlama state'i bozulmaz.
4. **Mobil:** tek-kolon düzende modal tam ekran (mevcut modal davranışı korunur), `ui_action` yine çalışır (tek şey değişmez).
5. **İptal/hata:** kullanıcı modalı kapatırsa ajanın çağrısı `cancelled` sonucuyla döner ve transcript'te görünür (sessiz yutma yok) — `open_project` çıktısında `status: 'done' | 'cancelled'`.
6. **Yoksa dürüstlük:** proje görünür ama cwd silinmişse listede "missing path" rozeti; ajan `open_project` çağrısında `cwd_missing` hatasını dürüstçe döner.

## Kontrol (kabul kriterleri)

- Ajan `open_project` çağrısı → canlıda modal açılır (tek hamlede, kullanıcı tıklaması gerekmeden), kayıt oluşur, modal kapanır, sidebar o projeye seçilir, toast görünür, transcript satırı `Open project "fermag" at /root/fermag` yazar.
- Kullanıcı modalı kapatırsa: transcript'te `status: cancelled`, **yarım kayıt yok** (kayıt ya tam ya hiç).
- Aynı cwd+ad için ikinci çağrı: 1 kayıt, `created:false`.
- Silinmiş cwd'li proje: rozet var, `open_project` dürüst hata veriyor.
- 390px mobilde ve 1500px masaüstünde taşma yok (kendi prob'unda ölç).
- Kapılar: birim testleri (modal iki mod + iptal yolu), tsc 0, sterilize build, `pm2 restart lokma-web`, canlı bundle == disk hash, **canlı prob** `scripts/probe-open-project-ui.cjs` (mint'li token: ajan çağrısı → modal gözlemi → kayıt → temizlik: kayıt + geçici dizin silindi, tekrar silme kontrolü ile).

## Dokunulacak yerler (öngörü)

- `packages/lokma-core/src/tools/ui-control.ts` — `UiActionPayload.action` + `'open_project'`, `status` alanı
- `packages/lokma-web/web/src/lib/ws.ts` — `ui_action` reducer'ında `open_project` için ek alanlar (veya generic taşıma)
- `packages/lokma-web/web/src/components/app-shell.tsx:425-445` — `open_project` dalı (tek şekil yeri)
- `packages/lokma-web/web/src/components/sessions/project-modal.tsx` — `mode` prop'u + kilitli alanlar + tek yazma yolu
- `packages/lokma-web/web/src/components/sessions/sessions-sidebar.tsx` — grup seçimi/otomatik açma
- `packages/lokma-web/web/src/stores/session.ts` — `refreshProjects` tek yazma yolu (mevcut)

## Bitirme (done)

1. Kontroller PASS + kanıt (prob çıktısı + ekran görüntüsü `assets/REQ-182-ss1-*.png`).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00` kronoloji.

## Notlar

- **Write-only:** kod yazılmadı. İki tık yerine tek akış prensibi (REQ-145 dersi) bu REQ'in omurgası: "modal açıldı" diye bırakmak, kullanıcıya bir adım daha atmak demektir.
- Aynı modal iki modda çalışacağı için **ikinci bir modal yazılmaz** (DRY, proje kuralları #8/#9).
- Risk notu: `ui_action` reducer'ı `web/src/lib/ws.ts`'te generic; yeni eylem eklerken `dismissUiAction` tek-seferlik davranışı bozulursa modal her karede yeniden açılır (sonsuz döngü görünümü) — prob bunu ayrıca assert eder.