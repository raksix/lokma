# REQ-049 — Plugin enable/disable switch olsun, disabllar da görünsün

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "burda plugin enable disable switch olarak olsun, disabled pluginler de gözüksün" (SS'e bakılamadı — görüntü servisi 500).
- **Interpretation:** Plugin listesinde her satırda açma/kapama **switch** (toggle) olur; kapalı pluginler listeden kaybolmaz, soluk/disabled görünür. Models panelindeki switch deseni referans alınır.
- **Touched (plan):** plugins pane satırları (switch component + disabled stili + persist).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile switch aç/kapa + reload sonrası durum + disabl'ların görünürlüğü kanıtlanır, bundle match.
