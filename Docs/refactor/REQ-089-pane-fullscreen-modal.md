# REQ-089 — Pane fullscreen: header butonu + modal + split

- **Status:** pending
- **Asked:** 2026-09-09 — "bu panenin buraya bir tuş ekle, ona basınca tam ekran yapsın modal olarak o paneyi; yukarda x ile kapatsın büyük ekranı. fullscreen browser değil, sadece o pane tam ekran olsun. tam ekran panellerde de split bölme falan olsun." (Ekran görüntüsü ekti; vision servisi 500 döndüğü için görüntü okunamadı — hedef pane kullanıcının tarifine göre Projects paneleri.)
- **Interpretation:** Her pane header'ına (önce Projects) fullscreen butonu: basınca SADECE o pane uygulama-içi modal olarak tam ekran açılır (browser fullscreen API DEĞİL), modalın üstünde X ile kapanır. Fullscreen modal içindeki pane'de split/bölme aksiyonları çalışmaya devam eder (yeni split'ler modal içinde açılır). Kapanınca pane eski yerine aynen döner (state kaybı yok). REQ-046 popout'tan farklı: ayrı pencere değil, uygulama-içi modal. 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda Projects header'daki tuş → modal tam ekran + X kapatır; modal içinde split açılır; kapatınca layout/state aynen geri gelir.
