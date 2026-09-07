# Refactor inbox

> Kullanıcı tek tek söyler ("burası böyle olsun"), her istek buraya ayrı `REQ-XXX` dosyası olarak eklenir.
> Bu klasör tek doğruluk kaynağıdır: ne istendi, ne yapıldı, hangi commit ile canlıya çıktı.

## Süreç

1. Kullanıcı chat'te bir istek yazar.
2. Agent buraya yeni `REQ-XXX-<kısa-ad>.md` dosyası ekler (`pending`).
3. **KURAL: kullanıcı "yap" demeden kod değişikliği YOK.** Agent sadece yazar, commit'ler, push'lar. Barizse bile sormadan implemente etmez; muğlaksa dosyaya not düşer, kullanıcı karar verir.
4. Kullanıcı "yap" deyince istek `in-progress` olur, ayrı atomic İngilizce commit + anında `git push origin main` + canlı doğrulama ile kapanır (`done`).

## Durumlar

- `pending` — kaydedildi, başlanmadı.
- `in-progress` — yapılıyor.
- `done` — canlıda, commit hash'li.
- `rejected` — yapılmayacak, gerekçeli.

## İstekler

- [REQ-001](REQ-001-explorer-sag-menu.md) — Explorer sağ menüde olacak — done
- [REQ-002](REQ-002-dosya-sekme-olarak-acilsin.md) — Explorer'dan açılan dosya son aktif pane'de sekme açılsın — done
- [REQ-003](REQ-003-new-session-renk.md) — New Session butonuna renk ekle — done
- [REQ-004](REQ-004-acik-tema-siyah-border.md) — Açık temadaki siyah borderlar yumuşatılacak — done
- [REQ-005](REQ-005-session-surukle-pane.md) — Session listeden pane'e session ekleme çalışmıyor — pending
- [REQ-006](REQ-006-side-rozet-kaldir.md) — Sidebar left/right rozetleri kaldır — pending
- [REQ-007](REQ-007-menu-swap-ikonu.md) — Sol/sağ menü swap ikonu (en sol üst) — pending
- [REQ-008](REQ-008-activity-bar.md) — En sağa VS Code tarzı activity bar — pending
- [REQ-009](REQ-009-ayar-sistemi.md) — Docs'a uygun detaylı ayar sistemi — pending
- [REQ-010](REQ-010-sol-ikon-rail.md) — En sola Inspector ikon şeridi — pending
- [REQ-011](REQ-011-file-explorer-sola.md) — File explorer sola taşınacak — pending
- [REQ-012](REQ-012-ust-bar-compact.md) — Üst model seçimi kalkar, bar compact + ayarlar ikonu — pending
