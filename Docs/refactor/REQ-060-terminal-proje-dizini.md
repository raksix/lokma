# REQ-060 — Terminal varsayılan olarak seçili projenin dizininde açılsın

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "bir de terminal açınca default olarak seçili projenin dizininde açılacak".
- **Interpretation:** Yeni terminal pane'i açılınca cwd'si o an seçili projenin/session'ın dizini olur (elle `cd` gerekmez). Session/proje değişince yeni terminaller güncel dizini alır; açık terminaller etkilenmez.
- **Touched (plan):** terminal açma akışı (cwd = aktif session cwd).
- **Verify (plan):** root+web `tsc` 0, build'ler green, restart'lar, headless ile `pwd` çıktısının proje dizini olduğu kanıtlanır, bundle match.
