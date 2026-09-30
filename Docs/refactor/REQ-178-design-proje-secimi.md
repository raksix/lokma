# REQ-178 — Design'de proje (workspace/cwd) seçimi olsun

**Status:** in-progress
**Tarih:** 2026-09-30
**Kaynak:** Kullanıcı mesajı (30 Eyl 2026):
> "design de proje seçme falan da yok"

## Bugünkü durum

- Design artifact'ları **global** yazılıyor: `~/.lokma/design/artifacts/<id>/` (`packages/lokma-core/src/design/types.ts:5` — "files under `~/.lokma/design/artifacts/<id>/`").
- Liste (`GET /api/design/list`), üretim (`POST /api/design/generate`) ve detay uçları **cwd/proje parametresi almaz**; yalnız `GET /api/design/guard?cwd=` bir cwd kabul ediyor (`routes/design.ts:63`) ve o da yalnız DESIGN.md okuması için.
- UI'da proje/klasör seçici yok → tüm tasarımlar tek havuzda; hangi projeye ait olduğu belli değil.

## Kapsam

1. **Proje seçici (UI):** Design sayfasına proje/workspace seçici eklenir (oturum oluşturmadaki cwd/`recent projects` deseniyle aynı kaynak; seçenekler: kayıtlı projeler + `Global (~)` varsayılanı). Seçim kalıcıdır (localStorage) ve sayfa yenilenince korunur.
2. **Uçlara cwd:** `list`, `generate`, `guard` (ve gerekiyorsa `get`/`delete`) `cwd` alır; liste yalnız seçili projenin artifact'larını döner.
3. **Depolama:** artifact'lar `<cwd>/.lokma/design/artifacts/<id>/` altına yazılır; proje seçilmediyse bugünkü global dizin kullanılır. Mevcut global artifact'lar okunur kalır (geriye dönük kayıp yok — projesiz görünür).
4. **Guard tutarlılığı:** DESIGN.md guard'ı **seçili projenin** `.lokma/DESIGN.md` dosyasından okunur ve üretimde kullanılan sistem/tokenlarla aynı cwd'den gelir (bugünkü `guard?cwd=` ile aynı semantik).
5. **Güvenlik:** cwd yolu mevcut WorkspaceFiles jail/whitelist deseniyle doğrulanır (path traversal yok); bilinmeyen/erişilemez proje → net 400/404.
6. **Chat narration:** üretim mesajında hangi projeye yazıldığı görünür (ör. chip: "→ proje: lokma").

## Kabul (kabul kriterleri)

- Proje seçilince: liste o projenin artifact'larını gösterir; yeni üretim o projenin `.lokma/design/artifacts/` altına düşer (dosya sistemi kanıtı); guard o projenin DESIGN.md'sini okur.
- `Global (~)` seçilince bugünkü davranış (global dizin) aynen sürer; eski global artifact'lar görünür kalır.
- Proje değiştirince liste anında değişir; seçim yenileme sonrası korunur.
- Kapılar: tsc 0; yeni birim testleri (cwd çözümleme + jail); design testleri güncel; sterilize build; pm2 tek-proc; canlı bundle == disk hash; canlı prob `scripts/probe-design-project-scope.cjs` (iki farklı projede üret → dosyaların doğru dizine düştüğü + listelerin ayrıştığı kanıtı).

## Dokunulacak yerler (öngörü)

- `packages/lokma-core/src/design/store.ts` (+ `types.ts`) — cwd alan yolları
- `packages/lokma-web/server/src/routes/design.ts` — uçlara `cwd`
- `packages/lokma-web/web/src/lib/api.ts` + `components/design/` (seçici, `use-design-studio.ts`)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (dosya sistemi + prob çıktısı + ekran görüntüsü).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index; 00-KONTEKST kronoloji.

## Notlar

- Write-only: kod yazılmadı; worker uygular. İlişkili: REQ-177 (gerçek model), REQ-172 (sayfa düzeni).
- 2026-09-30 tur 1: core store + server rotaları cwd ile donatıldı (commit `db611a0`): `normalizeDesignCwd`/`resolveDesignCwd`/`designRootOf` + tüm uçlarda `cwd` (list/generate/guard/get/put/delete/critique/export/view, png+webm dahil); manifest'te `project` alanı. Kanıt: `store.test.ts` 27/27, generate 24, raster 15, webm 23; kök tsc 0; core+server build yeşil. Sırada: UI proje seçici (localStorage) + canlı prob + kapanış.
