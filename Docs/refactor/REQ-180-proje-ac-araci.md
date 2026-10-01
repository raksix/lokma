# REQ-180 — "Proje aç" bir araç olsun: ajan workspace projesi açabilsin

**Status:** pending
**Tarih:** 2026-10-01
**Kaynak:** Kullanıcı mesajı (1 Ekim 2026), ekran görüntüsü ile:
> "kanka amına koyayım proje aç diyince skill gibi proje açıcak dişrekt dosya oalrak açıo sikicem amk.

Lokmada uida ben ne yapabiliyorsam onları direkt lokmanın harnessi de mcp ya da skill olarak kullanbilecek.

direkt açabilcek yani.

bunun için detaylı refacktlrer oluştur"
>
> Ekran görüntüsünde ajanın yaptığı: `glob {"pattern":"**/*json","max":40}` → `grep {"query":"projectId","path":"packages/lo...` → `glob {"max":40,"pattern":"**/*project*"}` → `Read .lokma/settings.json` — yani istek, **projeyi açmak** yerine repo içinde kod araştırmasına ve muhtemelen dosya yazmaya çevrildi.

**İlişki:** Bu REQ, [REQ-181](REQ-181-ui-yuzeyleri-harness-araci-katalogu.md) (katalog) ve [REQ-182](REQ-182-proje-ac-ui-aksiyonu.md) (UI aksiyonu) ile birlikte bir dalga; üçü birlikte "UI'da yapılan her şey ajanın aracı olsun" ilkesini kapatır. Uygulama sırası: 180 → 182 → 181 (önce çalışan yol, sonra yüzey, sonra katalog genişletmesi).

## Bugünkü durum (kanıt)

1. **"Proje aç" hiçbir araç değil.** UI'da proje oluşturma `POST /api/projects` (sunucu) + `packages/lokma-web/web/src/components/sessions/project-modal.tsx` (istemci modal). Ajan tarafındaki dört UI aracı yalnızca `open_browser`, `open_terminal`, `open_session`, `send_to_session` (`packages/lokma-core/src/tools/ui-control.ts:156` — `UI_CONTROL_TOOL_NAMES`). Proje oluşturma listede **yok**.
2. **Yazılı sebep kodda:** `packages/lokma-core/src/tools/ui-control.ts:17-19` — "Server sessions have no project object distinct from the cwd-scoped transcript store, so 'create a project' is `open_session` (fresh transcript) plus workspace file tools." Bu cümle bugünün davranışını belgeliyor: ajan "proje aç" dendiğinde ya oturum açar ya da dosya yazar; proje kaydı açmaz.
3. **Kayıt zaten var, sadece araç değil:** `POST /api/projects` (`packages/lokma-web/server/src/routes/auth.ts:296`) `can(user,'project:create')` kontrolüyle çalışır, ve `POST /api/sessions` belgeli davranışı gereği cwd'yi sunucu tarafında normalize edip oluşturur (proje cwd'si yeniden doğrulanır, jail uygulanır).
4. **Ajanın elinde proje listesi de yok.** `list_todos` gibi araçlar `projectId` **desteğini** taşır (`packages/lokma-core/src/tools/todos.ts:17` — `projectId` her çağrıda zorunlu), ama proje kaydını okuyan bir araç hiç yok — model `projectId`'yi nereden bulacağını bilmiyor; ekranda gördüğün `grep projectId` + `glob **/*project*` bunun kanıtı.
5. **Ajanın yazdığı yazma araçları `WRITE_TOOLS`'ta** (`packages/lokma-core/src/tools/gate.ts:24-31`), yani `auto` modda **onay sorar** — kullanıcı "proje aç" dediğinde dosya yazmaya kalkması ek olarak yanlış bir izin kararı.

## Kapsam

1. **Yeni araç `open_project`** (ad kilitli değil, ama `open_browser`/`open_terminal`/`open_session` ailesine konmalı):
   - Girdi: `{ name?, cwd, visibility?, sessionId? }` — `cwd` zorunlu, `name` verilmezse `suggestProjectName(cwd)` ile türetilir (istemcide zaten var: `packages/lokma-web/web/src/components/auth/auth.ts:181`), `~` genişletilir ve dizin sunucu tarafında oluşturulur (`mkdir -p`).
   - Etki (server-side FIRST, sonra `emit`): proje kaydını oluşturur (`createProject` — `packages/lokma-core/src/auth/store.ts`), ardından o projede **bir oturum açar** (`cwd` = proje cwd) ve `ui_action: { action: 'open_project', projectId, cwd, sessionId }` çerçevesi yayar.
   - Dönüş: `{ ok, projectId, name, cwd, sessionId, created: true }` — model cevabında proje adı + yol görünür.
   - **Eşzamanlılık:** aynı ad + aynı cwd için iki paralel çağrı → tek kayıt (idempotent), 409 değil; "zaten var" cevabı döner.
   - **Yetki:** `can(user,'project:create')` ve `visibility` kuralları REST ile **birebir aynı** olmalı (tool kendi yetki mantığını yeniden yazmaz, mevcut `createProject`'u çağırır).
2. **`list_projects` aracı** — ajan "hangi projeler var?" diye sorduğunda `GET /api/projects` yetki filtresiyle listeler: `[{ id, name, cwd, visibility, sessionCount? }]`. `visibleProjects(user)` aynı filtreyi uygular; tool kendi listeleyicisini yeniden yazmaz.
3. **Çakışma kuralı:** "proje aç" ile "oturum aç" farkı prompt'ta **açıkça** anlatılır: `open_project` = kalıcı kayıt + cwd'de oturum, `open_session` = yalnızca oturum. Modelin "proje aç" kelimesini `write_file`'a çevirmesi bu satırla engellenir.
4. **Kilit disiplini (REQ-062 deseni):** "bu projede çalış" dendiğinde tool `cwd`'yi oturumun cwd'sine bağlar; dosya araçları zaten cwd-jail'li (jail tek uygulama: `WorkspaceFiles`), yani proje açmak jail'i genişletmez.
5. **UI tarafı aynı işi yapan tek yol olsun:** `ui_action` çerçevesi istemcide mevcut `ProjectModal`'a bağlanır (yeni modal yazılmaz) — modal açılıp proje oluşturulduğunda ajanın yaptığı kayıtla **tek kayıt** (DRY) kalır. Modal "yol/ada alındı" modunda açılıp başarıyla kapanır.

## Kontrol (kabul kriterleri)

- `open_project` çağrısı: `GET /api/projects` listesinde **yeni kayıt** (cwd gerçekten diskte oluşmuş), dönüşte `projectId` + `cwd`, ve `ui_action` çerçevesi yayınlandı (WS kabulü).
- Aynı istek ikinci kez çağrılırsa: **tek kayıt**, `created: false`, 409/500 yok.
- `cwd` yazılamaz/oluşturulamazsa: dürüst hata (`outside_root` / `not_a_directory` / `permission`), **sessiz başarı yok**.
- `list_projects` yalnızca kullanıcının görebildiği projeleri döner (bir başkasının private projesi görünmez).
- Yetki yoksa `open_project` `deny`/`ask` kararı verir — `plan` modunda proje açma reddedilir.
- Chat transcript'inde `open_project` satırı görünür ve insan cümlesiyle yazılır (`Open project "fermag" at /root/fermag` — `describeToolCall` genişletmesi).
- Kapılar: yeni birim testleri (idempotency + jail + yetki), kök `bun x tsc --noEmit` 0, sterilize build (`env -u NODE_CHANNEL_FD -u NODE_ENV bun run build`), `pm2 restart lokma-web`, canlı bundle == disk hash, **canlı prob** `scripts/probe-open-project-tool.cjs` (mint'li token ile: araç çağrısı → kayıt diskte + listede + transcript satırı + temizlik: kayıt ve geçici dizin silindi).

## Dokunulacak yerler (öngörü)

- `packages/lokma-core/src/tools/ui-control.ts` — `open_project` + `list_projects` tanımları, `UiActionPayload.action`'a `'open_project'`, `UI_CONTROL_TOOL_NAMES`
- `packages/lokma-core/src/tools/gate.ts` — `open_project` sınıflandırması (`WRITE_TOOLS`? proje kaydı kalıcı → ask; `plan` modunda `deny`)
- `packages/lokma-web/server/src/routes/auth.ts` + `packages/lokma-web/server/src/agent-loop.ts` — tool'ları registry'ye kaydet, `deliverSessionPrompt` benzeri bağlama (`userId` + `can()` erişimi)
- `packages/lokma-web/web/src/lib/ws.ts` — `ui_action` işleyicisine `open_project` dalı (mevcut `open_browser`/`open_session` dalı yanına)
- `packages/lokma-web/web/src/components/sessions/project-modal.tsx` — mevcut modalın "sunucu tarafından zaten oluşturuldu" modu

## Bitirme (done)

1. Kontroller PASS + kanıt (prob çıktısı + transcript satırı + diskteki kayıt).
2. Atomik İngilizce commit(ler) + push (her adım ayrı commit; örn. önce core tool + test, sonra server wiring, sonra UI dalı).
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; `Docs/refactor/README.md` index satırı; `Docs/00-LOKMA-KONTEKST.md` kronoloji.

## Notlar

- **Write-only:** bu turda kod yazılmadı; worker uygular. Kullanıcı açık fiil (`yap`/`düzelt`) söylemeden uygulanmaz.
- **Ekrandaki hata tek kök nedendi:** "proje aç" için araç yok → model en yakın bildiği kalıba (dosya araçları) düştü. `grep projectId` + `glob **/*project*` = modelin proje kaydının **nerede** olduğunu aradığı, `Read .lokma/settings.json` = kodu okumaya çevirdiği.
- `docs/27` (skill discovery) ve `docs/30` (agent system) bu aracın prompt katmanını zaten tarif ediyor; REQ-181 katalogu bu ikisine bağlanır.