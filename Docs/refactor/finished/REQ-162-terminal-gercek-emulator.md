# REQ-162 — Terminal gerçek terminal olsun: yanıp sönen imleç, silme ve SSH hissi (xterm emülatörü)

**Status:** done (2026-09-26)
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026):
> "termianlde buglar var. bulunduğuım yerde bashda yanıp sönem imlecin yerini gösteren bişi olması lazım o yok. silince silinmiyor. temrinal gibi olmlaı güzel bir şekilde halet işte. terminal olmalı direkt amk sanki direkt o sunucu içinde termianle bağlanmışım gib olmalı aq"

## Belirti

1. **İmleç yok** — yazarken nerede olduğunu gösteren yanıp sönen imleç hiç yok. (REQ-158'de sahte `$` işareti kaldırılmıştı; yerine gerçek bir imleç konmadı.)
2. **Backspace silmiyor** — karakter silinmiş olsa da ekranda kalıyor ("silince silinmiyor").
3. **Terminal hissi yok** — renk yok, `\r` ile satır redraw yok; vim/htop gibi tam ekran uygulamalar bozuk; "SSH ile bağlanmışım" hissi yok.

## Kök neden (kod okundu — 26 Eyl)

`packages/lokma-web/web/src/components/terminal/terminal-pane.tsx` terminali **düz-metin kaydırma** olarak çiziyor:

- `terminal/data` çerçeveleri `stripAnsi()` (`terminal.ts`) ile kontrol dizilerinden arındırılıp tek bir string'e ekleniyor (`appendCapped`), sonra `split('\n')` ile `<div>` satırlar basılıyor.
- Gerçek PTY çıktısı terminal semantiği taşır: `\b \b` ile silme, `\r` ile satır başı, CSI ile imleç konumlama, SGR ile renk, alternatif ekran. `stripAnsi` bunları atar → **imleç konumu bilinemez** (hiçbir imleç çizilmiyor), **silme ekrana yansımaz** (düz metinde `\b` görünmez; eski karakter DOM'da kalır), renkler ve vim/htop hiç çalışmaz.
- Input tarafı doğru: tuşlar `keyToBytes` ile ham bayt olarak WS `terminal/input`'a gidiyor; shell kendi echo'sunu basıyor — ama **renderer bunu yorumlayamıyor**.
- Boyut: `terminal/resize` göndericisi mevcut (`lib/ws.ts: terminalResize`, `use-ws.ts: resizeTerminal`) ama **pane onu hiç çağırmıyor**; spawn'da `cols`/`rows` da geçilmiyor.
- Sunucu tarafı SAĞLAM: gerçek PTY (`terminalManager`: spawn/write/resize/tail; `routes/terminal.ts`), ham baytlar `terminal/data` ile akıyor, `terminal/resize` frame'i `routes/ws.ts`'te destekli.

## Çözüm (gerçek emülatör)

**`@xterm/xterm` + `@xterm/addon-fit`** ekle (`packages/lokma-web/web` bağımlılığı).

1. `terminal-pane.tsx`: düz-metin kaydırma yerine xterm instance'ı (koyu tema #0F0F11 ile uyumlu; `cursorBlink: true`; `xterm.css` import edilir). `terminal/data` ham baytı **stripAnsi OLMADAN** `term.write()`'e bas — REQ-158 dedupe'u korunur (`isRecentDuplicate` önce çalışır). Kaydırma artık xterm'in kendi scrollback'i; tıklama → `term.focus()`.
2. Input: `term.onData` → mevcut `sendRaw` (WS `terminal/input`). `keyToBytes` ve elle yapılan paste yolu kullanımdan kalkar (xterm kendi dizilerini/kopyalamasını üretir); `terminal.test.ts` buna göre güncellenir.
3. Boyut: `FitAddon.fit()` + pane için `ResizeObserver` → `ws.resizeTerminal(...)` (mevcut gönderici); spawn'a `cols`/`rows` da geçilir.
4. Late-join `tail` aynı şekilde `term.write` ile beslenir; bağlantı notu (REQ-107) ve bitiş notu korunur (xterm içine satır olarak ya da ince overlay).
5. Mevcut davranışlar korunur: oto-başlatma (REQ-079), oturum cwd'si (REQ-060/159), dedupe (REQ-158), canlı terminal limiti (REQ-159).

## Kontrol (kabul kriterleri)

- **Yanıp sönen imleç** görünür ve yazılan yerde durur.
- `abc` yaz → Backspace → ekranda `ab` görünür (silinen karakter gider); `\r` redraw bozulmaz.
- `printf '\033[31mKIRMIZI\033[0m'` kırmızı render edilir.
- `vim`/`htop` açılır, çizilir, `q` ile temiz çıkar (alternatif ekran).
- Pane boyutu değişince `terminal/resize` gider; içerik sarmaz/bozulmaz.
- Kapılar: `bun x tsc --noEmit` 0; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; yeni canlı prob `scripts/probe-terminal-xterm.cjs` (imleç elementi + backspace + renk + resize) yeşil; `terminal.test.ts` güncel ve geçiyor.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/package.json` (`@xterm/xterm`, `@xterm/addon-fit`)
- `packages/lokma-web/web/src/components/terminal/terminal-pane.tsx` (xterm entegrasyonu + resize wiring)
- `packages/lokma-web/web/src/components/terminal/terminal.ts` + `terminal.test.ts` (kullanılmayan yardımcıların temizliği)
- `packages/lokma-web/web/src/hooks/use-ws.ts` (mevcut `resizeTerminal` kullanılacak)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Kullanıcı bu bug'ı canlıda, sinirli tonda bildirdi — sıradaki uygun turda kapatılmalı.
- Gerçek PTY zaten sunucuda koşuyor (oturum klasöründe); eksik olan yalnız **renderer** katmanı — çözüm veri akışını değiştirmez, ham baytı emülatöre verir.
- xterm paketleri scoped: `@xterm/xterm`, `@xterm/addon-fit` (eski `xterm`/`xterm-addon-fit` değil).

## Kapanış (2026-09-26)

**Status: done.** Commitler: `b0bc214` (deps: `@xterm/xterm` 6 + `@xterm/addon-fit`) · `9279b06` (emülatör + host kutuları) · `0a31009` (ws soket hijyeni) · `ce44733` (prob) · bu kapanış docs commit'i.

**Yapılanlar**
- `terminal-pane.tsx` artık gerçek bir `@xterm/xterm` görüntüleyicisi: ham PTY baytları `stripAnsi` OLMADAN `term.write()`'e gidiyor; imleç kabuğun söylediği yerde yanıp sönüyor, Backspace ekranda siliyor, `\r` satırı yeniden çiziyor, SGR renkleri render ediliyor, `vi`/`htop` alternatif ekranı alıp geri veriyor. Girdi xterm'in kendi `onData`'sından (REQ-059'un elle `keyToBytes`'ı ve paste yolu kaldırıldı).
- Boyut: `FitAddon` + `ResizeObserver` → yalnız CANLI kabuklar için `terminal/resize`; spawn artık takılan `cols`/`rows` ile gidiyor (varsayılan 80×24 değil).
- Yan panel/tiling host'ları pane'e gerçek bir kutu veriyor (Inspector sınırsız kaydırmalı bir kolon; aynı kabuk REQ-037'de browser'a verilmişti) — yoksa emülatörün görüntüleyicisi 0 yüksekliğe çöküyordu.
- `terminal.ts` ölü yardımcılardan temizlendi (`stripAnsi`, `keyToBytes`, `filterLines`, `copyText`, etiketler) + `shouldSendResize` eklendi.

**Prob sırasında bulunan iki GERÇEK bug (ürüne ait)**
1. **Çift soket (use-ws):** `connect()` eski soketi kapatıp yenisini açıyor; eski soketin `onclose`'u `manualRef=false` ile koşup gereksiz bir reconnect planlıyordu → aynı state'e İKİ canlı soket bağlanıyordu ve her çerçeve iki kez geliyordu (yazılan karakterler ekranda `aabbcc`, transcript satırları çift). Fix: `onopen/onmessage/onclose` artık `wsRef.current === ws` guard'ıyla yalnız GÜNCEL soketi işler (eski soketin kapanışı poll gate'ini de erken bırakamaz).
2. **Prob aracının kendi hatası (kayıt için):** `WebSocket` sarmalayıcısı yalnız `.prototype`'ı geri koyuyordu, native static'ler (`WebSocket.OPEN`) düşüyordu; uygulamanın `socketSend` guard'ı `readyState !== WebSocket.OPEN` karşılaştırdığı için TÜM uygulama gönderimleri sessizce düşüyordu (prob kendi hatasını ölçüyordu). Fix: `Object.setPrototypeOf(Wrapped, Native)` (hem yeni probda hem REQ-158 probunda).

**Kanıt**
- `scripts/probe-terminal-xterm.cjs` canlı **19/19 PASS** (iki koşu üst üste): emülatör kutuyu dolduruyor, tıklama textarea'yı odaklıyor, yanıp sönen imleç (`xterm-cursor-blink`), `abc`→`ab` Backspace, ANSI kırmızı = `rgb(229,72,77)`, `vi` alternatif ekran + çıkış, spawn `31×33` + resize frame'leri (`31×33`→`31×25`), REQ-158 dedupe regresyonu (marker 2×), 0 JS hatası.
- `scripts/probe-terminal-dedupe.cjs` (REQ-158) regresyonu **tamamı PASS**.
- `bun x tsc --noEmit` 0 · steril web build yeşil · servis edilen bundle == disk (`index-*`).
- Prob temizliği: oturumun eski kabukları ve probun açtığı kabuk silinir (`DELETE /api/terminal/:id`) — canlı host'ta kalıntı yok; tokenless `GET /api/auth/me` 401 (gate ON).

**Not:** İmleç yanıp sönmesi kabuğun DEC moduna bağlı — bir kabukta `vim` çalıştırıldıysa kabuk `ESC[?12l` (blink off) bırakabiliyor; bu gerçek terminal davranışı, emülatör hatası değil. Prob bu yüzden TAZE kabukla ölçer.
