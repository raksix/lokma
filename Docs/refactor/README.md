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

- [REQ-001](finished/REQ-001-explorer-sag-menu.md) — Explorer sağ menüde olacak — done
- [REQ-002](finished/REQ-002-dosya-sekme-olarak-acilsin.md) — Explorer'dan açılan dosya son aktif pane'de sekme açılsın — done
- [REQ-003](finished/REQ-003-new-session-renk.md) — New Session butonuna renk ekle — done
- [REQ-004](finished/REQ-004-acik-tema-siyah-border.md) — Açık temadaki siyah borderlar yumuşatılacak — done
- [REQ-005](finished/REQ-005-session-surukle-pane.md) — Session listeden pane'e session ekleme çalışmıyor — done
- [REQ-006](finished/REQ-006-side-rozet-kaldir.md) — Sidebar left/right rozetleri kaldır — done
- [REQ-007](finished/REQ-007-menu-swap-ikonu.md) — Sol/sağ menü swap ikonu (en sol üst) — done
- [REQ-008](finished/REQ-008-activity-bar.md) — En sağa VS Code tarzı activity bar — done
- [REQ-009](finished/REQ-009-ayar-sistemi.md) — Docs'a uygun detaylı ayar sistemi — done
- [REQ-010](finished/REQ-010-sol-ikon-rail.md) — En sola Inspector ikon şeridi — done
- [REQ-011](finished/REQ-011-file-explorer-sola.md) — File explorer sola taşınacak — done
- [REQ-012](finished/REQ-012-ust-bar-compact.md) — Üst model seçimi kalkar, bar compact + ayarlar ikonu — done
- [REQ-013](finished/REQ-013-browser-sadelestir.md) — Browser sade: sekme yok, URL-only, tam alan — done
- [REQ-014](REQ-014-windowed-arka-plan.md) — Windowed panellere solid arka plan — pending
- [REQ-015](REQ-015-pane-tab-tiklama.md) — Pane tabları seçilemiyor — pending
- [REQ-016](REQ-016-alt-hint-kaldir.md) — Alttaki gereksiz ibareler kaldırılacak — pending
- [REQ-017](REQ-017-sekmede-duzenle.md) — Dosya sekmeleri IDE gibi düzenlenebilir — pending
- [REQ-018](REQ-018-status-bar-metrik.md) — Status bar: gateway/proje/cpu/ram/token-s/sürüm — pending
- [REQ-019](REQ-019-sidebar-resize.md) — Sol/sağ menüler resize edilebilir — pending
- [REQ-020](REQ-020-inspector-liste-kaldir.md) — Inspector 23'lü liste kalkar (rail'e taşındı) — pending
- [REQ-021](REQ-021-swap-rail-takip.md) — Swap'te mini menüler panelle birlikte taşınır — pending
- [REQ-022](REQ-022-ayarlar-modal.md) — Ayarlar modal olarak açılır — pending
- [REQ-023](REQ-023-ikon-kucult.md) — Sol/sağ menü ikonları küçültülür — pending
- [REQ-024](REQ-024-mobil-single.md) — Mobilde pane yok, single görünüm — pending
- [REQ-025](REQ-025-agent-hub-tasarim.md) — Agent Hub tasarımı iyileşir — pending
