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
- [REQ-014](finished/REQ-014-windowed-arka-plan.md) — Windowed panellere solid arka plan — done
- [REQ-015](finished/REQ-015-pane-tab-tiklama.md) — Pane tabları seçilemiyor — done
- [REQ-016](finished/REQ-016-alt-hint-kaldir.md) — Alttaki gereksiz ibareler kaldırılacak — done
- [REQ-017](finished/REQ-017-sekmede-duzenle.md) — Dosya sekmeleri IDE gibi düzenlenebilir — done
- [REQ-018](finished/REQ-018-status-bar-metrik.md) — Status bar: gateway/proje/cpu/ram/token-s/sürüm — done
- [REQ-019](finished/REQ-019-sidebar-resize.md) — Sol/sağ menüler resize edilebilir — done
- [REQ-020](finished/REQ-020-inspector-liste-kaldir.md) — Inspector 23'lü liste kalkar (rail'e taşındı) — done
- [REQ-021](finished/REQ-021-swap-rail-takip.md) — Swap'te mini menüler panelle birlikte taşınır — done
- [REQ-022](finished/REQ-022-ayarlar-modal.md) — Ayarlar modal olarak açılır — done
- [REQ-023](finished/REQ-023-ikon-kucult.md) — Sol/sağ menü ikonları küçültülür — done
- [REQ-024](finished/REQ-024-mobil-single.md) — Mobilde pane yok, single görünüm — done
- [REQ-025](finished/REQ-025-agent-hub-tasarim.md) — Agent Hub tasarımı iyileşir — done
- [REQ-026](finished/REQ-026-hersey-pane-olur.md) — Her şey pane olarak kullanılabilir — done
- [REQ-027](finished/REQ-027-bot-sistemi.md) — Bot sistemi refaktörü (Grok + Hermes referanslı) — done
- [REQ-028](finished/REQ-028-plugin-market.md) — Skill/plugin market + örnek plugin — done
- [REQ-029](finished/REQ-029-drag-split-calismiyor.md) — Session drop'ta split yapmıyor — done
- [REQ-030](finished/REQ-030-provider-modelleri-gorunsun.md) — Eklenen provider'ın modelleri listede görünsün — done
- [REQ-031](finished/REQ-031-opencode-go-0-models.md) — Test 35 bulurken satır 0 models gösteriyor — done
- [REQ-032](finished/REQ-032-refresh-tum-modeller.md) — Refresh tüm provider /v1/models'leri çeker — done
- [REQ-033](finished/REQ-033-tiling-bozuk.md) — Pane tiling sistemi çalışmıyor (concept'te çalışıyordu) — done
- [REQ-034](finished/REQ-034-file-explorer-sadece-inspector.md) — File explorer sadece Inspector'da görünür — done
- [REQ-035](finished/REQ-035-drop-modal-uste.md) — Dropped session modali üste çıkar — done
- [REQ-036](finished/REQ-036-crosshair-imlec.md) — Butonlarda crosshair imleç — done
- [REQ-037](finished/REQ-037-browser-full-height.md) — Browser içeriği full height — done
- [REQ-038](finished/REQ-038-sending-takiliyor.md) — Gönderince sending'de takılma — done
- [REQ-039](finished/REQ-039-spark-500-cozumu.md) — spark 500: bölge kilidi + ölü proxy, yol haritası — done
- [REQ-040](finished/REQ-040-session-yeni-sekme.md) — Session açılınca yeni sekme eklensin (VS Code) — done
- [REQ-041](finished/REQ-041-cursor-pointer.md) — Tüm tıklanabilirlerde cursor:pointer (REQ-036 crosshair'ı geçersiz kılar) — done
- [REQ-042](finished/REQ-042-windowed-resize.md) — Windowed pencereler resize edilebilir — done
- [REQ-043](finished/REQ-043-dosya-sayfasi.md) — Dosyalar ayrı sayfa (rail'de dosya ikonu) — done
- [REQ-044](finished/REQ-044-session-sadece-baslik.md) — Session listede sadece başlık — done
- [REQ-045](finished/REQ-045-tiling-bar-kaldir.md) — Tiling üst menü çubuğu kalkar — done
- [REQ-046](finished/REQ-046-pane-popout.md) — Pane'de ayrı pencere butonu — done
- [REQ-047](finished/REQ-047-cift-tik-kaldir.md) — Bozuk çift-tık büyütme kaldırılır — done
- [REQ-048](finished/REQ-048-buton-arka-plan.md) — Ayar butonlarına tema arka planı — done
- [REQ-049](finished/REQ-049-plugin-switch.md) — Plugin switch + disabllar görünür — done
- [REQ-050](finished/REQ-050-stream-thinking-tools.md) — Stream + thinking + tool calling detaylı — done
- [REQ-051](finished/REQ-051-session-compact-zaman.md) — Compact satır + m/h/d + aktiflik sırası — done
- [REQ-052](finished/REQ-052-agent-hub-tam-sayfa.md) — Agent Hub tam sayfa + detaylı — done
- [REQ-053](finished/REQ-053-inspector-tam-genislik.md) — Öğeler Inspector tam genişliği — done
- [REQ-054](finished/REQ-054-thinking-tool-ayri-satir.md) — Thinking/tool ayrı satırlar + error card — done
- [REQ-055](finished/REQ-055-kebab-menu.md) — Süre yerine dikey ... context menü — done
- [REQ-056](finished/REQ-056-sag-tik-menu.md) — Her yerde sağ-tık context menü — done
- [REQ-057](finished/REQ-057-harness-kendini-kontrol.md) — Harness UI'ı kontrol etsin — done
- [REQ-058](finished/REQ-058-yeni-proje-butonu.md) — Yeni proje butonu — done
- [REQ-059](finished/REQ-059-gercek-pty-terminal.md) — Terminal gerçek PTY gibi — done
- [REQ-060](REQ-060-terminal-proje-dizini.md) — Terminal seçili proje dizininde açılsın — pending
- [REQ-061](finished/REQ-061-harness-cift-yazi-yazamiyor.md) — Çift cevap + yazamama fixi — done
- [REQ-062](REQ-062-auth-roller-todo-claim.md) — Auth gate + roller + todo claim — pending
- [REQ-063](REQ-063-auth-gate.md) — Loginsiz web erişimi yok — pending
- [REQ-064](REQ-064-roller-superadmin-calisan.md) — superadmin/admin/çalışan — pending
- [REQ-065](REQ-065-todo-oto-assign.md) — Todo + AI oto-assign claim — pending
