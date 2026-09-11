# REQ-117 — Default model Duffel/blues, session model memory

- **Status:** done (canlıda — 2026-09-11)
- **Asked:** "spark'i default yapıp save ediyorum değişiyor; default her
  sessionda gelsin; sessionda değiştirdiğim modeli o session hatırlasın."
- **Kök neden (2 bug):**
  1. `PATCH /api/config` "ok" dönüp yazmıyordu: okunan değer proje
     ayarından (`.lokma/settings.json` içindeki bayat `anthropic/
     claude-4-sonnet` tohumu — şema varsayılanıyla aynı, gerçek seçim
     değil) geliyordu; global dosya güncelleniyor ama merge'de proje
     kazanıyordu. Üstelik `saveGlobal` merge edilmiş görünümü global
     dosyaya geri yazıp proje/env değerlerini kalıcı kirletiyordu.
  2. Taze session'lar global `localStorage[lokma-model]`'daki SON seçimi
     alıyordu — bir sessiondaki pick tüm yeni sessionlara sızıyordu.
- **Did:** `saveGlobal` ham global dosyayı okur/yazar (merge sızıntısı
  bitti); bayat proje `defaultModel` anahtarı silindi (dosya git-ignore'lı,
  canlı-config); session yükleme `detail.model || ''` yapar — boşsa global
  default zinciri çözer, global son-seçim asla kullanılmaz.
- **Proof:** PATCH→GET round-trip iki yönde tutuyor; dosya = okunan değer;
  E2E canlı: A-INIT spark / A-PICKED mimo / B-INIT spark (sızıntı yok) /
  A-BACK mimo → SESSION-MEMORY PASS. tsc 0, build green, served chunk yeni.
- **Files:** `lokma-core/config/loader.ts` (`saveGlobal`), `chat/index.tsx`
  (session model yükleme). `.lokma/settings.json` canlıda temizlendi.
