# REQ-039 — muse-spark-contributor 500'ünü düzelt (veri paylaşımı onayı?)

- **Status:** done (yol bulundu + yapılabilir kod yapıldı, commit aşağıda)
- **Asked:** 2026-09-07 — "muse spark contributor modelleri 500'e düşüyor, veri paylaşımı için falan onay vermemiz cart curt diye, onu düzeltmenin yolunu bul. gerekli dokümanlardan olmadı, hermes agent bunu nasıl çözmüş bak, sen de öyle yap".
- **Interpretation:** `muse-spark-*-contributor` upstream'de HTTP 500 dönüyor (4 key'de doğrulandı: 2×500 + 2×401). Hipotez: yeni hesaplar/model için veri-paylaşımı veya şart onayı gerekiyor; Hermes'in opencode isteklerinde bunu nasıl geçtiğine bakılıp aynısı yapılır (header/param/endpoint farkı).
- **Diagnosis (doküman + canlı kanıtlı):**
  1. AYNI key'de `mimo-v2.5` + `deepseek-v4-flash` → 200, iki spark sürümü → 500. Model-spesifik, hesap/header sorunu DEĞİL.
  2. Resmi Go dokümanı (`opencode.ai/docs/go`, curl ile çekildi): **"Muse Spark 1.3/1.2 Contributor (limited regions)"** — spark bölge-kısıtlı. TR çıkışından 500 normal.
  3. Hermes çözümü doğrulandı (dokümanda yazıyor: "Hermes builds containing PR #101864 send the header") — header kısmını REQ-038'de zaten yaptık (`x-opencode-session` + session-stable id).
  4. Senin `opencode-muse-relay` zaten spark'ı ABD proxy'den geçiriyordu (region bypass) — ama havuzdaki proxy'ler ÖLÜ (3/3 test: HTTP 000), relay de 500 dönüyor. Yani bypass yolu da şu an kapalı.
  5. Custom User-Agent denendi (doküman istiyor) — 500 değişmedi.
- **Verdict:** Kodla düzeltilemez — upstream bölge kilidi + ölü proxy havuzu. Yollar: (a) taze ABD proxy havuzu alınıp relay'e eklenir (ücretli iş, ayrı karar); (b) opencode.ai dashboard'dan hesap bölge/veri-paylaşım ayarları kullanıcı tarafından kontrol edilir; (c) o zamana kadar spark yerine `mimo-v2.5` kullanılır (200, canlı kanıtlı). REQ-038'deki graceful-failure (toast, takılma yok) devrede.
- **Touched (bu turda yapılabilir olan):** `lokma-ai/src/provider/openai.ts` (Go base'de `User-Agent: lokma-harness/1.0` — doküman zorunluluğu) + `adapters.test.ts` (UA assert'i).
- **Proof:** adapters 26/26; ai+server+root `tsc` 0; server rebuild + restart; E2E regresyon takılma 0 + toast 1; `/health` 200.
