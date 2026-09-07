# REQ-020 — Inspector'daki 23'lü menü listesini kaldır (rail'e taşındı)

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "inceptor kısmında bunlara gerek yok kaldıralım" (+ ekran görüntüsü: 23 Inspector menüsü) → netleştirme: "bunların hepsi zaten en soldaki sabit menüye taşındı, ondan gerek yok".
- **Interpretation:** REQ-010 ile 23 menü sabit sol ikon şeridine taşındığı için (canlıda doğrulandı), Inspector paneli içindeki 23 satırlık liste (Info…Memory) kaldırılır — panel sadece seçili içeriği gösterir, navigasyon rail'den olur. Liste bileşeni silinir, `InspectorPanel` doğrudan aktif sekmeyi render eder.
- **Touched (plan):** Inspector nav listesi bileşeni (`inspector-host.tsx` veya liste kısmı — uygulamada netleşir).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile rail ikonlarının tüm içerikleri açtığı + listede artık menü satırı olmadığı kanıtlanır, bundle match.
