# REQ-137 — HTML preview stalls on its loading screen

- **Durum:** done
- **Tarih:** 2026-09-14
- **İstek (kullanıcı):** "bu lunapark_muse.html ... lokma projesinde ... ordan açınca html'i lokma da ... yükleniyorda takılıyor onu hallet bi ya" (ekran görüntüsü: preview "yükleniyor" ekranında donmuş).
- **Dosya:** `packages/lokma-web/web/src/components/panes/pane.tsx`, `.../panes.ts`

## Belirti

Kendi kendine yeten bir HTML sayfası (WebGL lunapark sahnesi, loader'lı UI) Lokma'nın preview pane'inde açıldığında sonsuz yükleme ekranında kalıyordu. Sayfa çalışmıyor değildi — hiç çalıştırılmıyordu.

## İki katmanlı kök neden

1. **Scriptler kapalıydı.** HTML preview `sandbox=""` ile render ediliyordu; tarayıcı "Blocked script execution … the 'allow-scripts' permission is not set" diyor ve sayfa kendi loading ekranında donuyordu. Script'siz bir demo, bozuk bir sayfa gibi okunuyor.
2. **Pane kendini habire sıfırlıyordu (asıl "takılma").** `load()` useCallback'i `known` **oturum özeti objesine** bağlıydı. Çalışan bir run sırasında oturum listesi yeniden poll ediliyor ve her poll taze özet objeleri döndürüyor → `known` referansı değişiyor → `load()` yeniden koşuyor → `setStatus('loading')` + dosyanın yeniden okunması + `setRunScripts(false)`. Yani kullanıcı Run'a basıp sahne açılsa bile **~4 saniye sonra** preview baştan yükleniyor, scriptler kapanıyor ve ekran yeniden "yükleniyor" oluyordu. Zaman serisi ölçümü: `0s sb=allow-scripts` → `4s sb=` (reset), 40 sn boyunca tekrar tekrar.

## Fix

- **Kararlı bağımlılıklar:** loader artık objeye değil, gerçekten önemli olan primitiflere bağlı — `knownCwd` (workspace yolu) + `listReady` (liste geldi mi). Poll'lar taze obje döndürse de `load` yeniden koşmaz; preview kullanıcının önünde sıfırlanmaz. `setRunScripts(false)` reset'i kaldırıldı (dosya değişse bile kullanıcı tercihi korunur).
- **Scriptler varsayılan açık:** `runScripts` başlangıcı `true`, `scriptsOn = htmlPreview && runScripts`. Sayfa açılır açılmaz çalışır. İzolasyon korunur: frame `allow-scripts` alır ama **asla `allow-same-origin` almaz** → opaque origin, uygulamanın DOM'una / storage'ına / cookie'lerine erişemez.
- **Opt-out bir tık uzakta:** toolbar'daki Stop/Run toggle'ı ve "Scripts are paused…" banner'ı (yalnızca kullanıcı scriptleri durdurduğunda ve sayfa `<script>` içeriyorsa) duruyor; `htmlNeedsScripts()` bu kararı verir.

## Kanıt (canlı, gerçek DOM)

- `probe-html-preview.cjs` (scripts/ altında kalıcı): iframe `sandbox="allow-scripts"` + `title="Preview of lunapark_muse.html"` (69.847 char srcdoc) ve frame içinde `canvas=1 THREE=object`, sayfa başlığı "Küçük Lunapark — Gece Işıkları". Toolbar "Stop" gösteriyor, yani scriptler açık. **Kullanıcı hiçbir şeye basmadan sahne yüklendi.**
- Stabilite: 45 saniyelik örnekleme boyunca `sb=allow-scripts` hiç değişmedi (önce: 4 saniyede reset).
- Regresyon testi: `bun packages/lokma-web/web/src/components/panes/panes.test.ts` → `panes-137: 117 passed, 0 failed` (`htmlNeedsScripts` 6 vaka dahil).
- Kapılar: `bun x tsc --noEmit` 0 hata · `bun run build` green (1685+ modül).

## Ölçüm notu (tuzağı)

Sandbox'lı bir frame'de `iframe.contentDocument` **null** döner — bu "script çalışmadı" demek DEĞİLDİR, sadece opaque origin'e erişilemediğini gösterir. İlk turlarda `contentDocument`'e bakıp "allow-scripts çalışmıyor" sanıldı; doğru ölçüm Playwright `page.frames()` üzerinden frame'in kendi `evaluate`'si ile yapılır (probe-html-preview.cjs bunu yapar).

## Dürüst kapsam

- Sandbox `allow-scripts` verir ama `allow-same-origin` vermez: sayfa ağ istekleri yapabilir, fakat uygulamanın oturum verisine erişemez (opaque origin).
- `allow-top-navigation` verilmediği için sayfa üst pencereyi yönlendiremez.
