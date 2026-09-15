# REQ-154 — Agent tarayıcıyı kullanabilsin: sayfayı oku / kaydır / tıkla / yaz

**Status:** pending
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-core/src/tools/` (yeni browser araçları),
`packages/lokma-web/server/src/routes/browser.ts` + yeni bir motor modülü,
`packages/lokma-web/web/src/components/browser/browser-pane.tsx` (görünüm eşleme)
**İlişkili:** REQ-146 (sekme yeniden kullanımı), REQ-150/153 (iframe kısıtları)

## İstek (verbatim)

> browserdan aşağı scroll etmiyor amk

Ekran görüntüsü: kullanıcı sohbette "aşağı scroll et" diyor, Lokma şu cevabı
veriyor:

> "Bunu yapamıyorum — bana verilen araçlar arasında sayfayı scroll etme/
> tıklama/yazma yetkisi yok. Elimdeki browser aracı sadece bir URL'yi sekmede
> açıyor (open_browser) … 'Scroll ettim' desem yalan olurdu."

## Teşhis (koddan, doğrulandı)

- Ajan araçları: `read_file, list_files, search_files, glob, grep, edit_file,
  write_file, run_command, ask_user, todos, ui-control`.
- Tarayıcı tarafı yalnızca **UI kontrolü**: `open_browser` (sekme aç/yeniden
  kullan, REQ-146) — sayfa içeriğine dokunan hiçbir araç yok.
- Sunucudaki "browser", gerçek bir tarayıcı değil: `/api/browser/*` uçları
  sekme + URL geçmişi kaydı tutuyor; çalışan bir motor yok.
- Panel tarafında sayfa bir **iframe** (`sandbox="allow-scripts
  allow-same-origin allow-forms"`) — sayfalar çapraz kaynaklı olduğu için
  istemci, iframe'in içine script enjekte edip **kaydıramaz/tıklayamaz**.
  Yani "istemciden halledelim" kısayolu mimari olarak kapalı.

## Önerilen çözüm (iki aşamalı)

**Aşama 1 — okuma (küçük, hemen yapılabilir):**
`browser_read_page` aracı: sekmenin URL'ini sunucuda `fetch` eder, HTML'i
metne çevirir (script/style atılır, başlıklar korunur, ilk ~8K karakter) ve
modele verir. Kullanıcı "aşağıda ne var / sayfada ne yazıyor" diye sorduğunda
cevap üretilebilir. İnteraktif sayfalarda (SPA) eksik kalır — bunu araç
açıklamasında dürüstçe yazar.

**Aşama 2 — gerçek etkileşim (asıl istek):**
Sunucuya gerçek bir tarayıcı motoru (playwright-core + mevcut
`/root/.cache/ms-playwright/chromium-1234`) eklenir; her sekme bir motor
oturumuna bağlanır:

| Araç | İş |
| --- | --- |
| `browser_read_page` | sayfa metni/markdown (Aşama 1'in motorlu hâli) |
| `browser_scroll` | `{ direction: up/down/top/bottom, amount? }` |
| `browser_click` | `{ selector }` veya `{ text }` (görünür metne göre) |
| `browser_type` | `{ selector, text, submit? }` |
| `browser_screenshot` | PNG üretir, `.lokma/browser-shots/` altına yazar, yolu döner |

Kurallar:
1. Araçlar `run_command` gibi **gate'li** (varsayılan izin akışı), hepsi
   `readOnly` değil; screenshot hariç hepsi geri besleme metni döner.
2. Motor oturumu sekme ömrüne bağlı; sekme kapanınca motor kapanır (sızıntı yok).
3. Panel görünümü: motor modunda pane ya (a) motorun periyodik
   screenshot'ını gösterir ("canlı ekran") ya da (b) iframe'de kalır ve
   panelde "ajan bu sekmeyi motor üzerinden kullanıyor" rozeti çıkar. İki
   görünümün **ayrıştığını** dokümanda açıkça yaz — sessiz fark yaratma.
4. Ağ: motor, kullanıcının ajanı neyi açıyorsa onu açar; iç ağ adresleri
   (127.0.0.1, link-local, metadata IP'leri) için SSRF guard'ı şart.
5. Kimlik bilgisi yazma yasağı: `browser_type` parola/token alanlarına
   yazarken maskeler (log ve transkriptte değer görünmez).

## Kabul kriterleri (öngörü)

1. "aşağı scroll et" → `browser_scroll` çağrısı sayfayı kaydırır ve araç
   sonucu yeni konumu (scrollY / toplam yükseklik) bildirir; kullanıcı panelde
   kaydığıNı görür.
2. "sayfada ne var / fiyatı kaç" → `browser_read_page` gerçek içeriği döner.
3. "şu butona tıkla / şunu yaz" → `browser_click` / `browser_type` çalışır ve
   sonuç metni geri beslenir.
4. Motor erişilemezse araç **açık hata** verir; ajan "yaptım" diyemez
   (mevcut davranış: dürüst red — bu korunur).
5. Panel ile motor aynı sekmeyi gösterir; fark varsa kullanıcıya rozetle belli olur.

## Verify planı (öngörü)

- Prob (sunucu): bilinen bir sayfada `browser_scroll` sonrası
  `scrollY` artışı + `browser_read_page` çıktısında sayfaya özgü bir metin.
- Uçtan uca: canlı oturumda ajan "youtube ana sayfada aşağı kaydır ve ilk 5
  video başlığını yaz" görevini araç çağrılarıyla tamamlar; transcript'te
  `browser_scroll` + `browser_read_page` satırları görünür.

## Notlar

- Bu istek, "ajan tarayıcıyı kullansın" sınıfının ilk parçası; ileride
  `browser_hover`, `browser_select`, `browser_wait_for` eklenebilir.
- Aşama 1 tek başına da kullanıcıya değer üretir (okuma), ama asıl şikâyet
  etkileşim — kapanış Aşama 2 ile yapılmalı.
- Alternatif (reddedildi): sayfayı sunucu proxy'sinden geçirip iframe'de
  göstermek — çoğu sitede script/CSP kırılır, oturum çerezleri sızar.
