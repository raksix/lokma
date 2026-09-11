# REQ-127 — Session satırları sidebar'la aynı zeminde

- **Status:** done (canlıda — 2026-09-11)
- **Asked:** "şu sidebarda sessionlar var, sessionlar arka planı [kutu]
  girmesiz biraz daha açık renk; tüm temalarda onu arka plan rengi
  sidebarla aynı olsun."
- **Kök neden:** iki katmanlı, ikisi de `index.css`'teki koyu-tema
  override bloğunda:
  1. `.dark [class*="bg-muted"]` seçicisi **özellik (variant) önekli**
     sınıfları da yakalıyordu. Tailwind `hover:bg-muted/40` üretirken
     class attribute'una `hover:bg-muted/40` yazıyor; `class*=` substring
     eşleşmesi bunu da gördüğü için satır hover'ı **her zaman** opak
     `#1E1E21` olarak boyanıyordu (satırın kendi `bg-transparent` sınıfı
     eziliyordu) → koyu temada satır sidebar'dan 15 ton açık bir kutu.
  2. `@theme` paleti statik: `--color-muted` koyu temada da açık hex'e
     (`#F2F0EB`) çözülüyordu. Yani seçici daraltılsa bile `hover:bg-muted`
     koyu temada **beyaza yakın** parlama yapacaktı (34 kullanım yeri).
- **Did:**
  - Seçici token-sınırına çekildi: `.dark .bg-muted,
    .dark [class^="bg-muted"], .dark [class*=" bg-muted"]` — böylece
    yalnız gerçek `bg-muted*` yardımcı sınıfı boyanıyor, `hover:`/`focus:`/
    `dark:` önekli olanlar kendi hallerine bırakılıyor.
  - Koyu temada palet token'ları gerçek koyu rampa'ya bağlandı
    (`--color-muted/-2`, `--color-line/-strong`, `--color-paper`,
    `--color-ink`) → hem taban yardımcılar hem hover varyantları doğru
    renge düşüyor; `bg-line` çizgileri de artık koyu temada bej değil.
  - Session satırının hover tonu tema başına açıkça yazıldı:
    `hover:bg-[rgba(38,38,36,0.05)] dark:hover:bg-[rgba(237,233,226,0.06)]`
    (eski `hover:bg-muted/40` koyu temada %40 beyaz parlıyordu).
    Çalışan satırın terracotta yıkaması (`bg-terracotta/10`) aynen duruyor.
- **Proof:** canlı (lokma.fermag.com.tr) ölçüm, satır + en yakın boyalı ata
  + composite: açık tema panel `rgb(250,249,245)` / satır `rgba(0,0,0,0)`
  → fark **0**; koyu tema panel `rgb(15,15,17)` / satır `rgba(0,0,0,0)`
  → fark **0**. Hover: açık Δ11, koyu Δ13 (hafif ton). Fix öncesi koyu tema
  satırı `#1E1E21` (Δ15) idi. WEB tsc 0, vite build green, pm2 `lokma-web`
  restart, `:3457` 200.
- **Files:** web `src/index.css` (seçici + koyu token bloğu),
  `src/components/sessions/sessions-sidebar.tsx` (satır hover tonu).
