# REQ-025 — Agent Hub tasarımı iyileştirilecek

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "agent hub tasarımı falan daha iyi olabilir".
- **Interpretation:** Agents/Orchestration (Agent Hub) yüzeyinin görsel tasarımı elden geçirilir: kart dizilimi, durum rozetleri (running/idle/error), bütçe/kota göstergeleri, hover aksiyonları (pause/resume/kill/fork) daha okunur ve modern olur. İşlevsellik aynen korunur, sadece sunum iyileşir; terracotta vurgu + light/dark uyumu korunur.
- **Touched (plan):** agents + orchestration pane bileşenleri (uygulamada netleşir).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless SS (light+dark) ile yeni görünüm kanıtlanır, bundle match.
