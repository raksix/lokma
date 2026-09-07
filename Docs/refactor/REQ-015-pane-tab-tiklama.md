# REQ-015 — Pane üstündeki tablar seçilemiyor, tab sistemi düzgün çalışmıyor

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "bu panein üstündeki şeyler seçilmiyor, düzgün çalışmıyor amk, pane içinde tab sistemi işte düzgün çalışmıyor" (+ ekran görüntüsü: pane tab strip — Browser / session / file tabları + X butonları).
- **Note:** Görselde şerit düzgün görünüyor (hizalı, taşma yok) — sorun davranışsal: tıklayınca aktif tab değişmiyor. Şüpheliler (uygulamada doğrulanacak): tab tıklamasının drag/split handler'ları tarafından yutulması, `onSelect` kablosu, `data-pane-tab` closest kontrolü (`onDoubleClick` maximize ile çakışma).
- **Touched (plan):** `components/panes/pane.tsx` (`PaneTabBar` tıklama/drag kabloları).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile her taba tıklanıp aktif içeriğin değiştiği + X ile kapandığı kanıtlanır, bundle match.
