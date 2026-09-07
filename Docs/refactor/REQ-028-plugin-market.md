# REQ-028 — Skill market + plugin market + plugin sistemi (+ örnek plugin)

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "abi açık kaynak zaten, kendi için skill market, plugin market, plugin sistemi vardı, example plugin de yaz. uygulamanın her şeyine plugin yapılabilir olacak, o tür özellikler de eklersin".
- **Interpretation:** (1) Uygulama içi **skill market** (skill keşfet/kur/kaldır), (2) **plugin market** (plugin keşfet/kur/kaldır), (3) genelleştirilmiş **plugin sistemi**: uygulamanın HER şeyine (paneller, rail ikonları, komutlar, temalar, bot yetenekleri...) plugin yazılabilir — extension point + manifest + lifecycle (enable/disable) + sandbox/izolasyon notları. (4) En az bir **example plugin** (kurulum + hello-world pane + dokümantasyonuyla). Referanslar: `Docs/23-PLUGIN-SYSTEM-deepseek-cordis.md`, `Docs/27-SKILLS-auto-discovery-hermes-inspired.md`, mevcut 6 bundled `@lokma/plugin-*`.
- **Touched (plan):** market UI'ları + plugin runtime/manifest kontratı + example plugin + Docs güncellemesi.
- **Verify (plan):** root+web `tsc` 0, web build green, example plugin'in marketten kurulup pane olarak açıldığı headless kanıtı, bundle match.
