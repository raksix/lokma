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
yani kod yazan AI ajanını çalıştıran motor. Kısaca: modeli düşünür, işi Lokma yapar.

Modeli sen seçersin: Anthropic, OpenAI, DeepSeek, Google, Ollama ya da OpenAI uyumlu
herhangi bir endpoint. Harness aynı kalır — döngü, araçlar, bağlam yönetimi ve arayüz
değişmez, sadece arkasındaki model değişir.

**Ne yapıyor?**

- Kod tabanını okur, dosya açar ve düzenler, komut çalıştırır, test koşar, git commit/push atar.
- Gerçek bir tarayıcıyı sürer: sayfayı okur, kaydırır, tıklar, yazar, ekran görüntüsü alıp sohbete atar.
- Aynı oturumu (session) terminalde başlatıp tarayıcıdan devam edebilirsin; döngü, bağlam ve
  hafıza ortak (`~/.lokma`). Geçmiş, token/maliyet defteri ve çalışma kayıtları yerinde kalır.
- Web tarafında 23 Inspector paneli var: Providers, Models, Usage, Agents, Orchestration,
  Vault, Skills, Archify, Design Studio, Testing Lab, Bots, Memory, Cron, Terminal, Git, Browser…
- Ajanların kendi karakteri (SOUL.md), kendi hafızası, kendi modeli ve bütçesi olabilir;
  kilit + worktree ile aynı dosyaya çakışmadan paralel çalışırlar.
- Temalar CLI ve Web'de ortak: `claude` (krem + terracotta), `omp`, `midnight`, `paper`.
- Skill, plugin, bot ve MCP tarafı açık; kendi iş akışını eklentiye çevirebilirsin.

**Ne değildir?**

- **Yeni bir model değil.** Kendi LLM'i yok; senin API anahtarını kullanır (BYOK).
- **Claude Code klonu değil.** Oradan ilham aldı ama çok sağlayıcılı yapısı, tema sistemi ve
  "CLI + Web tek harness" mimarisiyle kendi yolunda yürüyor.
- **IDE ya da VS Code eklentisi değil.** Editörünün yerini almaz; terminalde ve tarayıcıda
  çalışan bir ajan katmanı.
- **Sadece sohbet ya da otomatik tamamlama değil.** Konuşmakla kalmaz: dosya yazar, komut
  çalıştırır, commit atar, tarayıcıyı sürer.
- **Bulut zorunlu değil.** Local-first çalışır, kod senin makinende kalır (hosted servis
  kısmı henüz kapalı).
- **Kapalı kutu değil.** Core MIT lisanslı, repo ve tüm mimari kararlar açık:
  github.com/raksix/lokma — kararlar `Docs/` altında.
- **Bitmiş "1.0" değil.** Aktif geliştiriliyor; masaüstü sürümü (Tauri) ve hosted cloud henüz
  yok. Olan her şey gerçekten çalışıyor, canlı ve test edilmiş.

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
