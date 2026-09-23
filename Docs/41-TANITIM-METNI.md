# 41 — Share Text (Turkish)

Purpose: copy-paste ready Turkish copy for sharing Lokma (social post, forum, DM).
Deliverable text is Turkish by design; this wrapper is English per repo convention.

Sources checked while writing (2026-09-23): `README.md`, `LICENSE`, `Docs/01-PROJE-TANIMI.md`,
`https://lokma.fermag.com.tr/health` (=200), `https://lokma.fermag.com.tr/api/auth/settings`
(`requireLogin: true`, `bootstrapped: true`), `gh repo view raksix/lokma` (PUBLIC).

---

## 1) Uzun metin — "Nedir / Ne değildir"

**Lokma nedir?**

Lokma, terminalde ve tarayıcıda çalışan **açık kaynak bir agentic coding harness** —
yani kod yazan AI ajanını çalıştıran motor. Modeli sen seçersin (Anthropic, OpenAI, DeepSeek,
Google, Ollama ya da OpenAI uyumlu herhangi bir endpoint), harness aynı kalır. Kısacası:
model düşünür, harness iş yapar.

**Ne yapıyor?**

- Kod tabanını okur, dosya düzenler, komut çalıştırır, test koşar, git commit/push atar.
- Gerçek bir tarayıcıyı sürer: sayfayı okur, kaydırır, tıklar, yazar, ekran görüntüsünü sohbete atar.
- Aynı oturumu terminalde başlat, tarayıcıdan devam et — döngü, bağlam ve hafıza ortak (`~/.lokma`).
- Web'de 23 Inspector paneli: Providers, Models, Usage, Agents, Orchestration, Vault, Skills,
  Design Studio, Testing Lab, Bots, Memory, Terminal, Git, Browser…
- Ajanların kendi karakteri, hafızası, modeli ve bütçesi olabilir; kilit + worktree ile
  çakışmadan paralel çalışırlar.
- Temalar CLI ve Web'de ortak (`claude`, `omp`, `midnight`, `paper`); skill, plugin, bot ve
  MCP tarafı açık — kendi iş akışını eklentiye çevirebilirsin.

**Ne değildir?**

- **Model değil** — kendi LLM'i yok, senin API anahtarını kullanır (BYOK).
- **Claude Code klonu değil** — ilham aldı, ama çok sağlayıcılı ve "CLI + Web tek harness"
  olarak kendi yolunda yürüyor.
- **IDE ya da VS Code eklentisi değil** — terminalde ve tarayıcıda çalışan bir ajan katmanı.
- **Sadece sohbet/otomatik tamamlama değil** — dosya yazar, komut çalıştırır, commit atar.
- **Bulut zorunlu değil** — local-first; kod senin makinende kalır.
- **Kapalı kutu değil** — core MIT lisanslı, repo ve mimari kararlar açık: github.com/raksix/lokma
- **Bitmiş "1.0" değil** — masaüstü sürümü (Tauri) ve hosted cloud henüz yok; olan her şey
  canlı ve test edilmiş.

**Canlı:** lokma.fermag.com.tr (giriş korumalı)

*Bir lokma kod, bir lokma zeka — gerisini harness halleder.*

---

## 2) Kısa metin — X / sosyal medya

Lokma — açık kaynak agentic coding harness (CLI + Web).

Model düşünür, harness iş yapar: dosya yazar, komut çalıştırır, commit atar, tarayıcıyı sürer. Modeli sen seç, harness aynı kalır.

Terminalde başlat, tarayıcıdan devam et → github.com/raksix/lokma

---

## 3) Tek satır (bio / DM / imza)

Lokma — model düşünür, harness iş yapar. Açık kaynak agentic coding harness (CLI + Web), çok sağlayıcılı, temalı.
