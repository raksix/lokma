# Claude Code — Tüm Özellikler Detaylı Araştırma (Raw)

> Araştırma Tarihi: 31 Ağustos 2026
> Kaynak sayısı: 15+ resmi dokümantasyon + topluluk kaynakları
> Hedef Proje: Lokma — Claude Code birebir klonu harness için referans döküman
> Dosya: `/tmp/claude-code-features-raw.md`

---

## İçindekiler
1. [Nedir ve Felsefesi](#1-nedir-ve-felsefesi)
2. [Tüm CLI Komutları](#2-tüm-cli-komutları)
3. [Agent Yetenekleri](#3-agent-yetenekleri)
4. [Permission Sistemi](#4-permission-sistemi)
5. [Memory CLAUDE.md Sistemi](#5-memory-claudemd-sistemi)
6. [Hooks](#6-hooks)
7. [Plugins](#7-plugins)
8. [MCP Entegrasyonu](#8-mcp-entegrasyonu)
9. [GitHub Entegrasyonu (@claude)](#9-github-entegrasyonu-claude)
10. [IDE Entegrasyonu](#10-ide-entegrasyonu)
11. [Config Dosyaları ve Ayarları](#11-config-dosyalari-ve-ayarlari)
12. [Model Seçenekleri](#12-model-seçenekleri)
13. [Kurulum Yöntemleri](#13-kurulum-yöntemleri)
14. [Kaynakça](#14-kaynakça)

---

## 1) Nedir ve Felsefesi

### Tanım
Claude Code, Anthropic tarafından geliştirilen **agentic** (ajan tabanlı) kodlama aracıdır. Şubat 2025'te research preview, Mayıs 2025'te GA (Claude 4 ile), Ekim 2025'te Web+iOS, Ocak 2026'da Cowork tüketici sürümü yayınlandı. Terminal, IDE, Desktop app ve Web üzerinden aynı engine ile çalışır. `code.claude.com` dokümantasyonu ve `github.com/anthropics/claude-code` açık kaynak deposu tek kaynaktır.

### Felsefe
- **Terminal-first & Unix philosophy**: Composable, pipe edilebilir (`cat log | claude -p "explain"`), script edilebilir.
- **Human-in-the-loop**: Varsayılan `default` permission modunda her riskli işlem öncesi onay ister; kullanıcı kontrolü merkezde.
- **Anthropic Safety**: Constitutional AI ilkeleri, güvenli kod üretimi, şeffaf limitler, kurumsal güven (SOC2, enterprise policy).
- **Codebase-aware**: Tüm repo'yu bağlama alır, çok dosyalı planlama → yazma → doğrulama döngüsü.
- **Haftalık ship**: Sub-agent'ların sub-agent spawn etmesi, safe mode, multi-fallback model desteği gibi haftalık feature drop'lar.
- **Claude everywhere**: Aynı CLAUDE.md, settings, MCP tek engine'de terminal/IDE/desktop/web arasında taşınır (Teleport, Remote Control).

### Neleri Yapar (Özet)
- Sıkıcı işleri otomatikleştirme: test yazma, lint düzeltme, merge conflict, dependency update, release notes.
- Özellik geliştirme / bug fix: plan → çok dosyalı kod → test/verify.
- Git: commit, branch, PR oluşturma.
- `MCP` ile harici araçlara bağlanma (Jira, GitHub, Postgres, Slack vb).
- `Skills / Hooks / Agents` ile özelleştirme.
- Paralel ajanlar, background agents, Agent SDK ile custom orchestration.
- Zamanlanmış görevler (Routines) — bulut üzerinde periyodik çalışma.

---

## 2) Tüm CLI Komutları

### A. Terminal CLI Komutları (`claude` binary)

Kaynak: `code.claude.com/docs/en/cli-reference` — CLI reference full.

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `claude` | Interaktif oturum başlat | `claude` |
| `claude "soru"` | İlk prompt ile başlat | `claude "projeyi açıkla"` |
| `claude -p "soru"` | Print mode: sorgu → çık (SDK) | `claude -p "bu fonksiyonu açıkla"` |
| `cat file \| claude -p` | Pipe ile içerik işleme | `cat app.log \| claude -p "anomali var mı?"` |
| `claude -c` | Son konuşmayı sürdür (cwd eşleşmesi) | `claude -c` |
| `claude -c -p "soru"` | Sürdür + SDK | `claude -c -p "type hatalarını kontrol et"` |
| `claude -r <id> "soru"` | Session id/name ile resume | `claude -r auth-refactor "PR'ı bitir"` |
| `claude update` | Güncelle | `claude update` |
| `claude install [ver]` | Native binary kur/yeniden kur (`stable`/`latest`/versiyon) | `claude install stable` |
| `claude auth login` | Giriş (`--email`, `--sso`, `--console`) | `claude auth login --console` |
| `claude auth logout` | Çıkış | `claude auth logout` |
| `claude auth status` | Auth JSON/text durum | `claude auth status --text` |
| `claude agents` | Agent view: paralel background oturumları | `claude agents --json --all` |
| `claude attach <id>` | Background oturuma bağlan | `claude attach 7c5dcf5d` |
| `claude logs <id>` | Background oturum logu | `claude logs 7c5dcf5d` |
| `claude stop <id>` / `kill` | Background oturumu durdur | `claude stop 7c5dcf5d` |
| `claude respawn <id>` | Background oturumu yeniden başlat | `claude respawn 7c5dcf5d` |
| `claude rm <id>` | Liste’den sil (transcript kalır) | `claude rm 7c5dcf5d` |
| `claude daemon status` | Supervisor durum | `claude daemon status` |
| `claude daemon stop --any` | Supervisor durdur | `claude daemon stop --any --keep-workers` |
| `claude doctor` | Kurulum/settings teşhisi (read-only) | `claude doctor` |
| `claude mcp` | MCP server yapılandır | `claude mcp add --transport http notion https://mcp.notion.com/mcp` |
| `claude mcp login <name>` | MCP OAuth flow | `claude mcp login sentry` |
| `claude mcp logout <name>` | MCP credential sil | `claude mcp logout sentry` |
| `claude plugin` | Plugin yönetimi | `claude plugin install code-review@claude-plugins-official` |
| `claude project purge [path]` | Proje local state temizle | `claude project purge --dry-run` |
| `claude remote-control` | Remote Control sunucu | `claude remote-control --name "Proj"` |
| `claude gateway --config` | Self-hosted gateway | `claude gateway --config gateway.yaml` |
| `claude self-hosted-runner` | Self-hosted cloud runner | `claude self-hosted-runner setup` |
| `claude setup-token` | CI için long-lived token | `claude setup-token` |
| `claude ultrareview [target]` | Non-interactive ultrareview | `claude ultrareview 1234 --json` |
| `claude import [codex\|gemini]` | Diğer ajan config import | `claude import codex --dry-run` |
| `claude auto-mode defaults/reset` | Auto mode classifier kuralları | `claude auto-mode defaults` |

#### CLI Bayrakları (Önemli alt küme)

`--add-dir <path...>` — ek çalışma dizinleri
`--model <alias|id>` — model seçimi (fable/opus/sonnet/haiku veya tam ID)
`--permission-mode <default|acceptEdits|plan|bypassPermissions|dontAsk|auto>` — izin modu
`--allowedTools / --disallowedTools` — tool allow/deny (pattern destekler)
`--tools` — Claude'un görebileceği builtin tool listesini kısıtla
`--agent <name>` — subagent seç
`--agents '<json>'` — dinamik custom subagent tanımla (v2.1.242+)
`--worktree -w <name|#PR>` — izole git worktree içinde başlat
`--tmux` — tmux içinde worktree (iTerm native pane destekler)
`--verbose` — detaylı log
`--dangerously-skip-permissions / --allow-dangerously-skip-permissions` — bypass modu
`--append-system-prompt / --system-prompt / --system-prompt-file` — system prompt özelleştirme
`--settings <path>` — alternatif settings dosyası
`--plugin-dir <path>` — lokal plugin yükle (dev)
`--mcp-config <path>` — ek MCP config
`--fallback-model` — fallback zinciri
`--effort <low|medium|high|max|auto>` — reasoning effort

### B. Slash Komutlar (İnteraktif Session İçinde `/...`)

Tam liste `code.claude.com/docs/en/commands` + `googlarz/claude-code-commands` binary extraction.

#### Oturum & Sohbet

| Komut | Alias | Açıklama |
|-------|-------|----------|
| `/clear` | `/reset`, `/new` | Sohbet geçmişini temizle, context boşalt |
| `/compact` | — | Geçmişi özetleyerek sıkıştır, context’te özet tut |
| `/branch [name]` | `/fork` (eski) | Konuşmayı dallandır, yeni yön dene |
| `/fork [prompt]` | — | Konuşmayı kopyalayıp background session olarak başlat (v2.1.212+) |
| `/subtask <task>` | — | Forked subagent: yan görevi subagent'a ver, sonuç bu sohbete döner |
| `/resume` | `/continue` | Önceki konuşmayı sürdür |
| `/rewind` | `/checkpoint` | Kod ve/veya sohbeti önceki checkpoint'e döndür |
| `/rename [name]` | — | Konuşmayı yeniden adlandır |
| `/export [file]` | — | Konuşmayı dosyaya/clipboard'a aktar |
| `/exit` | `/quit` | REPL'den çık |
| `/btw [soru]` | — | Ana sohbeti kirletmeden yan soru sor |
| `/background [prompt]` | `/bg` | Mevcut oturumu background agent'a ayır, terminali serbest bırak |
| `/teleport` | `/tp` | Web oturumunu bu terminale çek |
| `/tui [default|fullscreen]` | — | Terminal renderer değiştir |
| `/session` | `/remote` | Remote session URL + QR göster |
| `/desktop` | `/app` | Oturumu Claude Desktop'a taşı |
| `/remote-control` | `/rc` | Bu terminali remote-control için bağla |
| `/goal [cond|clear]` | — | Hedef koy: koşul sağlanana kadar çalışmaya devam |
| `/loop [interval] [prompt]` | `/proactive` | Prompt'u periyodik tekrarla (session açıkken) |
| `/tasks` | `/bashes` | Background görevleri listele/yönet |
| `/context` | — | Context kullanımını renkli grid ile göster |
| `/status` | — | Versiyon, model, hesap, bağlantı durumu |
| `/stats` | — | Kullanım istatistikleri |
| `/cost` | `/usage`, `/stats` | Maliyet / plan limitleri |
| `/doctor` | — | Kurulum/settings teşhisi + fix öner |
| `/help` | — | Yardım |
| `/copy [N]` | — | Son cevabı clipboard'a kopyala |
| `/recap` | — | Oturum özeti (v2.1.108+) |
| `/stop` | — | Background session'ı durdur (sadece attached iken) |
| `/think-back` | — | Yıl sonu özeti (sezonluk) |

#### Model & Performans

| Komut | Açıklama |
|-------|----------|
| `/model [model]` | Model seç (picker veya direkt alias) |
| `/effort [low|medium|high|max|auto]` | Effort seviyesi |
| `/fast [on|off]` | Hızlı mod toggle |
| `/advisor [model|off]` | Advisor model yapılandır |
| `/brief` | Kısa mod toggle |
| `/vim` | Vim mode (v2.1.92'de kaldırıldı) |
| `/statusline` | Status line konfigüre et |

#### Yapılandırma & Ayarlar

| Komut | Alias | Açıklama |
|-------|-------|----------|
| `/config` | `/settings` | Ayar paneli |
| `/theme` | — | Tema değiştir |
| `/color <c|default>` | — | Prompt bar rengi |
| `/keybindings` | — | Keybinding dosyası |
| `/terminal-setup` | — | Shift+Enter / Option+Enter newline bağları |
| `/statusline` | — | Status line |
| `/permissions` | `/allowed-tools` | Allow/deny kural yönetimi |
| `/sandbox` | — | Sandbox yapılandır |
| `/memory` | — | Memory dosyalarını düzenle / auto-memory toggle |
| `/hooks` | — | Hook yapılandırmalarını görüntüle |
| `/privacy-settings` | — | Gizlilik ayarları |

#### Kod & Git

| Komut | Açıklama |
|-------|----------|
| `/commit` | Git commit oluştur |
| `/commit-push-pr` | Commit + push + PR aç |
| `/diff` | Uncommitted değişiklikleri göster |
| `/pr-comments` | PR yorumlarını çek |
| `/security-review` | Bekleyen değişikliklerin güvenlik incelemesi |
| `/code-review` | Kod inceleme (bundled skill, auto-invoke edilebilir) |
| `/ultrareview [PR|branch]` | Çok ajanlı derin kod incelemesi (cloud sandbox) |
| `/review` | Alias: code-review |

#### Planlama & Görevler

| Komut | Açıklama |
|-------|----------|
| `/plan [open]` | Plan modunu aç / mevcut planı göster |
| `/ultraplan` | Web üzerinde ileri plan taslağı (10–30dk) |
| `/workflows` | Workflow ilerleme görünümü |
| `/schedule` | Zamanlanmış remote agent (cron) |

#### Tanılama & Bilgi

| Komut | Açıklama |
|-------|----------|
| `/help` | Yardım |
| `/status` | Durum |
| `/doctor` | Teşhis |
| `/context` | Context görselleştirme |
| `/cost`, `/usage` | Maliyet/kota |
| `/insights` | Oturum analiz raporu |
| `/version` | Versiyon yazdır |
| `/release-notes` | Sürüm notları |
| `/debug [açıklama]` | Debug log aç |
| `/powerup` | İnteraktif dersler |
| `/feedback` | `/bug` — geri bildirim |

#### Entegrasyon & Plugin

| Komut | Alias | Açıklama |
|-------|-------|----------|
| `/mcp` | — | MCP server yönetimi |
| `/plugin` | `/plugins`, `/marketplace` | Plugin yönetimi |
| `/reload-plugins` | — | Plugin değişikliklerini aktive et |
| `/skills` | — | Yetenekleri (skills) listele |
| `/ide` | — | IDE entegrasyon durumu |
| `/chrome` | — | Chrome eklentisi ayarları |
| `/install-github-app` | — | GitHub Actions kurulumu |
| `/install-slack-app` | — | Slack app kurulumu |
| `/init` | — | CLAUDE.md ile projeyi başlat |
| `/init-verifiers` | — | Doğrulayıcı skill oluştur |
| `/add-dir` | — | Yeni çalışma dizini ekle |
| `/import` | — | Başka ajan config'i import et |

#### Hesap & Platform

| Komut | Açıklama |
|-------|----------|
| `/login` / `/logout` | Giriş/çıkış |
| `/upgrade` | Plan yükseltme sayfası |
| `/extra-usage` | Limit aşımında ek kullanım |
| `/passes` | Arkadaşına 1 hafta ücretsiz paylaş |
| `/rate-limit-options` | Rate limit seçenekleri |

#### Remote & Cloud

| Komut | Alias | Açıklama |
|-------|-------|----------|
| `/remote-control` | `/rc` | Remote control bağla |
| `/remote-env` | — | Teleport için varsayılan remote env |
| `/session` | `/remote` | Remote URL/QR |
| `/desktop` | `/app` | Desktop'a devam et |
| `/mobile` | `/ios`, `/android` | Mobil QR |
| `/web-setup` | — | Web kurulumu (GitHub bağla) |
| `/voice` | — | Ses modu |
| `/install` | — | Native build kur |

#### Bundled Skills (Skill olarak çalışan `/` komutlar)

`/batch` — büyük ölçekli paralel değişiklik (5–30 worktree agent, her biri PR açar)
`/verify` — app'i çalıştırıp gözlemleyerek doğrulama (test'e güvenmeden)
`/run` — app'i sür / canlandır
`/run-skill-generator` — `/run` ve `/verify` için proje recipe'si kaydet
`/deep-research` — dinamik workflow ile derin araştırma (v2.1.218 öncesi otomatik tetiklenebiliyordu)
`/claude-api` — proje diline göre API referansı yükle
`/autofix-pr` — PR'ı izleyip CI hatalarını otomatik düzelt (web session)
`/team-onboarding` — takım ramp-up dokümantasyonu üret
`/workflow-authoring` — dynamic workflow yazma (feature flag)
`/init` flow (`CLAUDE_CODE_NEW_INIT=1`) — skills/hooks/memory ile interaktif init

> Not: `googlarz/claude-code-commands` deposu v2.1.92 itibarıyla 140+ slash komut + alias listeler. Tam interaktif liste için session içinde `/` yazıp filtreleyin; skill bazlı komutlar `/skills` ile yönetilir.

---

## 3) Agent Yetenekleri

### Built-in Tool Set (Permission kuralları ve hook matcher'larında bu isimlerle referans verilir)

Kaynak: `code.claude.com/docs/en/tools` — 40+ tool.

| Tool | İzin Gerekir? (Manual) | Açıklama |
|------|------------------------|----------|
| `Agent` | No | Subagent spawn; agent team açıkken teammate'e delege eder |
| `Artifact` | Yes | HTML/Markdown artifact yayınla (claude.ai, Pro+ gerekir) |
| `AskUserQuestion` | No | Çoktan seçmeli soru sor (clarify) |
| `Bash` | Yes | Shell komut yürüt (read-only alt küme hariç izinsiz çalışır) |
| `PowerShell` | Yes | Windows'ta PowerShell native yürütme |
| `Edit` | Yes | Dosyada hedefli düzenleme (read-before-edit zorunlu) |
| `Write` | Yes | Yeni dosya / tam overwrite (Opus 4.6/Haiku 4.5+ öncesi hep read gerekir, yeni modellerde koşullu) |
| `Read` | No | Dosya oku (workdir dışı + additionalDirectories dışı prompt ister) |
| `Glob` | No | Pattern ile dosya bul |
| `Grep` | No | Dosya içeriğinde pattern ara (ripgrep) |
| `LSP` | No | Go-to-def / references / diagnostics (dil sunucusu) |
| `NotebookEdit` | Yes | Jupyter notebook hücre düzenle |
| `Monitor` | Yes | Komutu arka planda çalıştır, her satırı Claude'a akıt; WebSocket kaynağı da olabilir |
| `CronCreate/List/Delete` | No | Session-scoped zamanlanmış prompt ( --resume'da restore) |
| `TaskCreate/Get/List/Output` | No | Task list yönetimi (model opt-in gerektiren modellerde) |
| `EnterPlanMode/ExitPlanMode` | No/Yes | Plan moduna gir/çık |
| `EnterWorktree/ExitWorktree` | Yes/No | İzole worktree'a gir/çık |
| `WebFetch` | Yes | URL çek (doc domain allowlist hariç) |
| `WebSearch` | Yes | Web araması (session başına 200 limit, v2.1.212+) |
| `Skill` | Yes | Skill yürüt (ana sohbet içinde) |
| `SendMessage` | No | Diğer agent / session'a mesaj (cross-session messaging v2.1.224+) |
| `ListAgents` | No | Mesaj atılabilecek agent/session listesi |
| `PushNotification` | No | Desktop + telefon push (Remote Control bağlıyken) |
| `SendUserFile` | No | Dosyayı kullanıcı cihazına gönder (render/attach) |
| `ShareOnboardingGuide` | Yes | ONBOARDING.md yükle, paylaşım linki üret |
| `ReportFindings` | No | Kod inceleme bulgularını yapılandırılmış raporla |
| `ScheduleWakeup` | No | `/loop` bir sonraki iterasyonu planla |
| `RemoteTrigger` | No | Routines (claude.ai) CRUD — `/schedule` arkası |
| `SendFeedback` | No | Geri bildirim taslağı kuyrukla (v2.1.238+) |
| `EndConversation` | No | Oturumu sonlandır (nadir, v2.1.213+) |
| `ReadMcpResourceTool/ListMcpResourcesTool` | No | MCP resource oku/listele |

**Bash detayları**: Komutlar arası `what persists` — aynı oturumda cwd, env, kısmen shell state korunur. Timeout + output limitleri var, background komutlar desteklenir. Linux/WSL'de memory limit uygulanır. Çıktı yönlendirmeleri (`>`, `>>`, `2>`) file-write check'ine girer. `timeout`, `time`, `nice`, `nohup`, `stdbuf` wrapper'ları soyulup gerçek komut eşleştirilir. Bileşik `&&` zincirlerinde her alt komut ayrı değerlendirilir (`safe && rm -rf` izin vermez).

**Edit/Write detayları**: `.claude/worktrees/` dışı worktree path'ler onay ister. `NotebookEdit` kapsam dışı; Edit deny onun yerine geçmez.

### Agent Sistemi

- **Subagent**: Kendi context window'u ile görev üstlenir. Lead agent koordine eder, sonucu birleştirir.
- **Nested spawn**: Sub-agent kendi sub-agent'ını spawn edebilir (Week 24+).
- **Agent Teams**: Birden fazla Claude Code ajanı aynı projede farklı rol/name ile çalışır; `Agent` tool'u name ile teammate'e delege eder; `SendMessage` ile aralarında mesajlaşır; `TeammateIdle` hook'u idle anını yakalar.
- **Agent View**: `claude agents` ile paralel background session'ları tek ekrandan izle / dispatch et; `--json` scripting için.
- **Worktree isolation**: `claude -w <name>` veya `isolation: worktree` ile her ajan izole git worktree'de; `.claude/worktrees/<name>` altında.
- **Cross-session messaging**: `ListAgents` + `SendMessage` ile diğer local session'lar, web session'lar, Remote Control session'lar arasında iletişim (v2.1.224+).
- **Autonomous loops**: `Goal` ile koşul sağlanana kadar çalıştır; `/loop` ile self-paced tekrar.
- **Context & Prompt Caching**: 200K (varsayılan) / 1M beta window; compact otomatik; cache hit ile maliyet düşer.

---

## 4) Permission Sistemi

Kaynak: `code.claude.com/docs/en/permissions` — en kritik bölüm; Lokma'nın güvenlik çekirdeği.

### 3 Liste, 1 Sıra: deny → ask → allow

Her tool çağrısı bu sırada değerlendirilir; **ilk eşleşen kazanır**. Spesifiklik sırayı değiştirmez.

- `allow` — otomatik çalış, sorma.
- `ask` — her seferinde onay iste (prompt). `bypassPermissions`'ta bile sorar (mode öncesi kontrol).
- `deny` — tamamen engelle. `bypassPermissions`'ta bile engeller; en güçlü kural. Bare `Bash` gibi toolsuz deny tool'u Claude'un context'inden siler.

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git status)", "Read"],
    "ask":   ["Bash(git push *)"],
    "deny":  ["Read(./.env)", "Read(./secrets/**)", "Bash(rm -rf *)", "WebFetch"]
  }
}
```

**Kural sözdizimi**:
- `Tool` — tüm tool (örn `WebFetch`)
- `Tool(pattern)` — kapsamlı, glob: `Bash(npm run test *)`, `Bash(* install)`, `Bash(git * main)`, boşluk öncesi `*` word-boundary sağlar (`ls *` ≠ `lsof`), `:*` = ` *`
- `mcp__server__tool` — MCP araçları çift alt çizgi, parantezsiz (örn `mcp__puppeteer__*`)
- `Agent(Explore)` — belirli subagent'ı engelle
- `Read` / `Edit` — gitignore-benzeri path: `//abs`, `~/home`, `/project-root`, `./cwd`, bare filename her derinlikte eşleşir (`**/.env`)
- `WebFetch(domain:github.com)` vs bare `WebFetch`: ilki sandbox allowlist'e de yazar, bare sadece tool prompt'unu kaldırır
- `Cd` — bare deny `/cd`'yi kapatır, `Cd(path)` hedefi engeller

### Permission Modları

| Mod | Davranış |
|-----|----------|
| `default` | Eşleşmeyen her şey prompt |
| `acceptEdits` | Dosya edit + yaygın fs komutlarını workdir içinde otomatik onayla |
| `plan` | Read-only keşif; write/edit tool'ları prompt'a düşer, otomatik onay yok |
| `bypassPermissions` | Tüm prompt'ları atla (`--dangerously-skip-permissions`/`--allow-dangerously-skip-permissions` ile cycle'a eklenir). Yine de `deny`/`ask` + kritik path `rm` koruması çalışır |
| `dontAsk` | Prompt yerine deny (SDK) |
| `auto` (research preview + Pro/Max/Team) | Classifier model prompt'ları otomatik değerlendirir (v2.1.208+ auto-mode config) |

`defaultMode` settings'te belirlenir; Shift+Tab ile cycle edilir. Yönetici `permissions.disableBypassPermissionsMode` ile YOLO'yu kapatabilir.

### Sandboxing (Permission'dan ayrı OS seviyesi)

- Sadece `Bash` tool'u ve child process'lerini kısıtlar; prompt injection ile model bypass edilse bile FS/network sınırını zorlar.
- FS sınırları: `sandbox.filesystem` + `Read`/`Edit` deny kuralları birleştirilir.
- Network sınırları: `WebFetch(domain:...)` + `sandbox.allowedDomains/deniedDomains`.
- `*` wildcard bare/network için v2.1.196+ desteklenir.

### Ek Davranışlar

- **"Yes, and don't ask again"** → `.claude/settings.local.json`'a kalıcı kural yazar (repo root, worktree main checkout'a çözülür; repo dışı/Windows/home-root istisnaları var). File-modification onayı sadece session sonuna kadar kalıcıdır.
- **Symlink**: allow → hem link hem target eşleşmeli; deny → biri eşleşse block.
- **Hooks ile etkileşim**: `PreToolUse` hook'u `allow` döndürse bile `deny`/`ask` yine çalışır; hook `deny` (exit 2) izin verir.
- **Settings hiyerarşisi**: managed > CLI bayrakları > project > local > user. Deny her seviyede allow'u ezer. `permissions.allow` ve `additionalDirectories` workspace trust dialog'u kabul edilmeden uygulanmaz (güvenlik).
- **Kritik path koruması**: `rm`/`rmdir` ile kritik path silme hiçbir allow/mode ile otomatik onaylanmaz; `auto` modda classifier'a gider (v2.1.218+), `dontAsk`'ta deny.

---

## 5) Memory (CLAUDE.md) Sistemi

Kaynak: `code.claude.com/docs/en/memory` + `code.claude.com/docs/en/claude-md` (aynı içerik, iki URL).

### İki Tamamlayıcı Sistem

|  | CLAUDE.md | Auto Memory |
|--|-----------|-------------|
| Yazan | İnsan | Claude (otomatik) |
| İçerik | Talimat/kural/mimari | Öğrenme, tercih, düzeltme |
| Kapsam | Project / user / org | Repo başına, worktree'ler arası paylaşılır |
| Yüklenme | Her oturum başında tam | Her oturum başında ilk 200 satır / 25KB |
| Kullanım | Kodlama standartları, workflow, mimari | Tercihler, düzeltmeler, Claude'un koddan çıkaramadığı bağlam |

Her ikisi de **context olarak** yüklenir, zorunlu config değil; engellemek için `PreToolUse` hook kullanın. Ne kadar kısa/spesifik o kadar sadakat.

### CLAUDE.md Yükleme Kuralları

- **Keşif**: Mevcut çalışma dizininden başlayıp filesystem root'a kadar her dizindeki `CLAUDE.md` + `CLAUDE.local.md`'yi arar; alt dizinlerdeki dosyalar lazy — Claude o dizinden dosya okuduğunda yüklenir.
- **Concatenation**: Override değil birleştirme. Root'tan cwd'ye doğru sıralanır; aynı dizinde `CLAUDE.local.md` → `CLAUDE.md`'den sonra gelir.
- **`.claude/rules/`**: Büyük projelerde modüler kurallar; `paths:` frontmatter ile sadece eşleşen dosyalarda yüklenir (context tasarrufu). `@path` import'u organizasyon için ama context'i azaltmaz.
- **Limit**: Dosya başına 4 MiB'e kadar full yüklenir, üstü atlanır. 200 satır üstü sadakat düşer.
- **Compaction**: Project-root CLAUDE.md `/compact` sonrası diskten yeniden okunup re-inject edilir; nested/rules ise ilgili dosya okunduğunda reload olur.
- **Konumlar** (genel): `./CLAUDE.md` veya `./.claude/CLAUDE.md` (proje), `~/.claude/CLAUDE.md` (global), `CLAUDE.local.md` (gitignore'lı kişisel), alt paketlerde `packages/foo/CLAUDE.md`.

### Auto Memory Detayı

- **Toggle**: `/memory` içinde aç/kapat → `autoMemoryEnabled` user settings (`~/.claude/settings.json`) veya proje settings'e yazar.
- **Depolama**: `~/.claude/projects/<hash>/memory/` — hash git repo'dan türetilir; repo dışındaysa project root. `autoMemoryDirectory` ile taşınabilir.
- **Dosyalar**: `MEMORY.md` (index, her oturumda yüklenen tek dosya) + topic dosyaları (`debugging.md`, `api-conventions.md`, `user_role.md`, `feedback_*.md`, `project_*.md`, `reference_*.md` gibi on-demand).
- **Tipler** (frontmatter `type`): `user` (rol/uzmanlık), `feedback` (düzeltmeler/onaylar), `project` (devam eden iş, deadline, karar), `reference` (issue tracker/dashboard pointer). Koddan çıkabilen mimari/dosya yolu/debug fix'i kaydetmez; CLAUDE.md'de olanı tekrar yazmaz.
- **Yönetim**: Her write sonrası 200 satır/25KB kontrolü; yaklaşınca Claude'a kısalt reminder'ı (tek satır entry, detay topic'a taşı, stale birleştir/sil); aşılırsa write başarılı ama hata döner (sonraki load'da fazlalık düşer).
- **Görünürlük**: "Saved 2 memories" / "Recalled 2 memories" mesajları. `/memory` ile index ve topic'leri gözat/düzenle; `/context` ile gerçekten ne yüklendiğini doğrula.
- **Kullanım**: "remember that ...", "always use pnpm" → auto memory; "add this to CLAUDE.md" → CLAUDE.md.

---

## 6) Hooks

Kaynak: `code.claude.com/docs/en/hooks` (reference 200K+ karakter) + `hooks-guide` + Anthropic blog.

### Nedir
Kullanıcı tanımlı shell komutları / HTTP endpoint'leri / MCP tool çağrıları / LLM prompt'ları / subagent'lar — Claude Code lifecycle'ında spesifik noktalarda otomatik tetiklenir. Terminal, IDE, Desktop, Web'de aynı event'ler ateşlenir.

### Konfigürasyon
JSON settings dosyalarında `hooks` anahtarı altında: `event → matcher → handler[]`. Üç yuva: event seç, matcher daralt, handler tipini seç.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "if": "Bash(rm *)", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "npx prettier --write ${CLAUDE_PROJECT_DIR}/$1", "timeout": 10000 }] }
    ],
    "Notification": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "osascript -e 'display notification \"Claude needs attention\"'" }] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "prompt", "prompt": "Did we meet the acceptance criteria? If not, keep going." }] }
    ]
  }
}
```

**Handler tipleri**:
- `command` — shell komutu (stdin'de JSON, stdout JSON decision döner; `shell: powershell` Windows)
- `http` — POST endpoint
- `mcp` — MCP tool çağrısı
- `prompt` — LLM prompt (Claude'un kendisi değerlendirir)
- `agent` — subagent hook

Ortak alanlar: `type`, `command`/`url`/`prompt`, `timeout`, `if` (permission-style pattern), `async`, `shell`.

### Tüm Hook Event'leri (30+)

| Event | Ne zaman ateşlenir |
|-------|--------------------|
| `SessionStart` | Oturum başlar/resume olur — bir kez |
| `Setup` | `--init-only` / `-p --init/--maintenance` ile hazırlık |
| `SessionEnd` | Oturum biter — bir kez |
| `InstructionsLoaded` | CLAUDE.md / `.claude/rules/*.md` context'e yüklendiğinde (start + lazy) |
| `UserPromptSubmit` | Prompt Claude'a gitmeden önce |
| `UserPromptExpansion` | `/command` expansion'ı Claude'a gitmeden önce (engellenebilir) |
| `PreToolUse` | Tool çalışmadan önce (engellenebilir) — EndConversation hariç her tool |
| `PermissionRequest` | Tool izin kararı gerektiğinde |
| `PermissionDenied` | Auto mode deny ettiğinde (retry hint verilebilir) |
| `PostToolUse` | Tool başarılı bittiğinde |
| `PostToolUseFailure` | Tool hata ile bittiğinde |
| `PostToolBatch` | Paralel tool batch'i tamamen çözüldüğünde |
| `Notification` | Claude notification gönderdiğinde |
| `MessageDisplay` | Asistan mesajı render edilirken |
| `SubagentStart/Stop` | Subagent spawn/bitiş |
| `TaskCreated/Completed` | TaskCreate/Complete çağrısı |
| `Stop` | Claude yanıtı bittiğinde (turn sonu) |
| `StopFailure` | Turn API hatasıyla bittiğinde |
| `TeammateIdle` | Agent team teammate idle'e geçecekken |
| `ConfigChange` | Config dosyası session sırasında değiştiğinde |
| `CwdChanged` | `cd` ile workdir değiştiğinde |
| `DirectoryAdded` | `/add-dir` / SDK ile workdir eklendiğinde |
| `FileChanged` | İzlenen dosya diskte değiştiğinde (`matcher` = filename) |
| `WorktreeCreate/Remove` | Worktree yarat/sil |
| `PreCompact/PostCompact` | Context compaction öncesi/sonrası |
| `PreModelSwitch/PostModelSwitch` | Model değişim öncesi/sonrası (Pre engellenebilir) |
| `Elicitation/ElicitationResult` | MCP elicitation isteği / cevabı |

### I/O & Karar Kontrol

- **Input**: Her event'e özel JSON (tool_input, cwd, session_id, vs) — command hook stdin, HTTP hook POST body.
- **Output / Exit code**:
  - `0` + JSON yok / boş → kararsız, normal permission akışına devam.
  - `0` + `{"hookSpecificOutput": {"permissionDecision":"deny"|"allow"|"ask", "permissionDecisionReason":"..."}}` → kararı ezme (ama deny/ask kuralı yine önde).
  - `2` → block (deny); `Stop` gibi event'lerde devamı engelle.
  - Diğer kod → hata loglanır, engelleme yok.
  - Bazı event'lerde `additionalContext`, `systemMessage`, `retry: true` gibi alanlar.
- **Persist env**: `SessionStart` hook'u env var inject edebilir (sonraki turn'lere taşınır).
- **Async hooks**: `async: true` — uzun test/lint arka planda; `PostToolBatch` gibi batch sonrası hook'lar beklemez.

### Güvenlik & Debug

- Hooks settings hiyerarşisine tabi, managed override edebilir.
- Workspace trust: project hook'ları trust dialog kabulünden sonra çalışır.
- Debug: `claude --debug-file <path>` veya `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` ile matcher/exit/stdout log'u.
- PowerShell: `shell: powershell` ile `pwsh.exe`→`powershell.exe` fallback; `${CLAUDE_PROJECT_DIR}` rewrite v2.1.198+ shell-form'da da çalışır.

---

## 7) Plugins

Kaynak: `code.claude.com/docs/en/discover-plugins`, `plugin-marketplaces`, `academy.claude.com`, `shipwithai.io` kılavuzu.

### Kavram
Plugin = tek kurulumla gelen paket: `skills + agents + hooks + MCP servers + LSP + theme + settings.json slice`. Versiyon tek.

### Marketplace'ler

- **Official**: `claude-plugins-official` — ilk interaktif start'ta otomatik eklenir. `claude.com/plugins` katalog.
- **Community**: `anthropics/claude-plugins-community` — manuel `marketplace add`, Anthropic otomasyon validasyonu, commit SHA pin.
- **Demo**: `claude-code-plugins` — örnekler.
- **Custom**: GitHub `owner/repo`, git URL (GitLab/Bitbucket/self-hosted), local path, remote `marketplace.json` URL. `marketplace.json` → `.claude-plugin/marketplace.json`.

### Kurulum Yöntemleri (5 yol)

1. **TUI** `/plugin` → Discover/Installed/Marketplaces/Errors tab → Enter ile scope seç (user/project/local).
2. **Quick install** `/plugin install formatter@claude-plugins-official [--scope project|user|local]`
3. **CLI non-interactive** `claude plugin install formatter@claude-plugins-official --scope project` (sonra `/reload-plugins` veya restart)
4. **GitHub marketplace ekle** `/plugin marketplace add anthropics/claude-code` → `install` ile.
5. **Local dev** `claude --plugin-dir ./my-plugin` veya TUI Add Marketplace → local path.

**Marketplace komutları**:
```
/plugin marketplace add <source> [--scope user|project|local] [--sparse <paths>]
/plugin marketplace list [--json]
/plugin marketplace update <name>
/plugin marketplace remove <name>
claude plugin marketplace add/list/update/remove   # shell eşdeğerleri
```

**Plugin komutları**:
```
/plugin install <name@marketplace> [--scope ...] [--yes]
/plugin uninstall/disable/enable <name>
/reload-plugins
claude plugin install/uninstall
```

**Kapsamlar**:
- `user` → `~/.claude/settings.json` → tüm projeler (kişisel)
- `project` → `.claude/settings.json` → repo'ya commit, tüm klonlara gider
- `local` → `.claude/settings.local.json` → tek proje, kişisel, gitignore
- Team marketplace: `extraKnownMarketplaces` → `.claude/settings.json` → trust sonrası otomatik eklenir (v2.1.195+ external source plugin'ler için manuel install gerekir)

**Güncellemeler**:
- Auto-update: marketplace bazlı; official default ON, diğerleri OFF. TUI Marketplaces tab'da toggle.
- Manuel: `/plugin marketplace update <name>`. Henüz `claude plugin update` CLI yok.
- Cache: `~/.claude/plugins/cache` — her plugin versiyonlu kopya; `command` source link mode hariç kopyalanmaz, npm deps install edilir.

**Güvenlik**: Pluginler kullanıcı yetkisiyle kod çalıştırır; hooks/agents/MCP'lerini kurmadan önce inceleyin. Automated review ≠ tam güven.

---

## 8) MCP Entegrasyonu

Kaynak: `code.claude.com/docs/en/mcp` (95K+ karakter referans).

### Nedir
Model Context Protocol — açık standart. Claude Code'u yüzlerce harici araç/veri kaynağına bağlar: Jira, GitHub, Postgres, Notion, Figma, Slack, Gmail, Sentry vb. Kodda gördüğü issue'yu implement edip PR açabilir, DB sorgulayabilir, monitoring verisini analiz edebilir.

### Server Tipleri & Kurulum

| Tip | Komut | Not |
|-----|-------|-----|
| HTTP (önerilen) | `claude mcp add --transport http <name> <url> [--header "..."]` | Cloud servisler; `type: streamable-http` alias |
| SSE (deprecated) | `claude mcp add --transport sse <name> <url>` | Eski endpoint'ler için |
| stdio (lokal) | `claude mcp add --transport stdio <name> -- <cmd> [args]` | Local process; `--` sonrası server komutu; `--env KEY=val` destekler; `CLAUDE_PROJECT_DIR` env set edilir |
| WebSocket | `claude mcp add --transport ws <name> <url>` | Nadir |

JSON ile: `.mcp.json` (project root), `~/.mcp.json` (global → `~/.claude.json`'a da taşınır), `--mcp-config <path>`, `claude mcp add-json`. `type` olmadan `url` vermek config hatası (v2.1.202+ skips + rapor).

**Env expansion**: `${VAR}` / `${VAR:-default}` desteklenir; plugin MCP'leri `${CLAUDE_PROJECT_DIR}` doğrudan.

### Yönetim

- `/mcp` — enable/disable, durum detay, warning'ler.
- `claude mcp login/logout` — OAuth (HTTP/SSE/claude.ai connector); `--no-browser` SSH, `--port` sabit callback.
- **MCP client runtimes**: v2 runtime — tool'lar background connect, 5s timeout, cache'li remote server tool'ları bloklamadan gelir. `MCP_CONNECTION_NONBLOCKING=0` ile blocking.
- **Dynamic tool updates**: Server tool listesini güncelleyebilir; `notifications/tools/list_changed`.
- **Mid-session drop**: Remote server düşerse graceful; `notifications/roots/list_changed` ile workdir değişiklikleri server'a bildirilir.
- **Push messages (Channels)**: MCP server channel olarak session'a mesaj push'layabilir (Telegram/Discord/webhook).
- **Long tool call auto-backgrounding**: Uzun MCP tool çağrıları otomatik background'a alınır.
- **Scopes**: `local`> `project`> `user` precedence; `alwaysLoad: true` → tool deferral dışı, startup'ta bekletir.
- **Tool search**: `ENABLE_TOOL_SEARCH` (`auto`, `auto:N`, `false`) — çok tool'lu server'larda context tasarrufu; `alwaysLoad` ile exemption.
- **Prompts as commands**: MCP prompt'ları `/servername:promptname` veya `/mcp__servername__promptname` olarak slash komut olur.
- **Resources**: `ListMcpResourcesTool` / `ReadMcpResourceTool` / referans.
- **Elicitation**: Server kullanıcı input'u ister → UI prompt → `ElicitationResult`.
- **Output limits**: Tool başına limit, uyarı; per-tool yükseltilebilir.
- **Managed MCP**: `managed-mcp.json` + `allowedMcpServers/deniedMcpServers` ile org kontrolü.
- **Claude Code as MCP server**: Claude Code'un kendisi MCP server olarak expose edilebilir.

### Örnekler

```bash
# GitHub review
claude mcp add --transport http github https://api.githubcopilot.com/mcp --header "Authorization: Bearer $GH_TOKEN"

# Postgres
claude mcp add --transport stdio postgres -- npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb

# Notion
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

---

## 9) GitHub Entegrasyonu (@claude)

Kaynak: `code.claude.com/docs/en/github-actions` + `github.com/anthropics/claude-code-action` + Marketplace.

### @claude Mention Mode

Herhangi bir issue/PR yorumunda `@claude` yaz → Claude Code GitHub Action tetiklenir, repo context'iyle yanıt verir, kod değişikliği gerekiyorsa branch/commit/PR oluşturur. `ANTHROPIC_API_KEY` veya `CLAUDE_CODE_OAUTH_TOKEN` secret ile auth.

### Kurulum (2 yol)

**Quick setup** (önerilen, app bazlı):
- `/install-github-app` ile veya marketplace'ten Claude GitHub App'i kur.
- `.github/workflows/claude.yml` workflow'u oluşturulur ( `anthropics/claude-code-action` kullanır).

**Manual setup**:
- Custom GitHub App (Contents/Issues/Pull requests) veya personal token.
- Bedrock/Vertex/Foundry federasyonu ile `id-token: write` + `anthropic_workspace_id` / `anthropic_api_key` mapping.
- Org seviyesi: App'ı org'a kur, secret'ı org-level Actions secret olarak sakla (tüm repo'lar yararlanır).

**Örnek workflow** (öze):
```yaml
name: Claude
on: [issue_comment, pull_request]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write, issues: write, id-token: write }
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # veya claude_code_oauth_token / Bedrock/Vertex config
```

### Modlar

- **Interactive**: `@claude` mention → full agent loop, yorum cevabı + commit/PR.
- **Automation**: label/trigger bazlı (`claude` label), schedule, custom prompt'lu otomasyonlar (`docs/custom-automations.md`).
- **Code Review**: Her PR'da otomatik review; findings structured (`ReportFindings` tool, `category` slug ile).
- **Auto-fix**: Web auto-fix — PR branch'ini izleyip CI/review yorumlarındaki fail'i düzeltir.

### Yetkiler & Güvenlik

- App permission'ları yüksek (Contents/Issues/PR); least-privilege için custom app kur, dokümanda listelenir.
- Claude'un yapabilecekleri `security.md` ile sınırlı; prompt injection koruması, sandbox, permission rules workflow içinde de geçerli.
- Data handling: `data-usage` / `security` dokümanları.

### Ek

- GitLab CI/CD alternatifi mevcut (aynı harness, farklı runner).
- GitHub Marketplace'te `Claude Code GitHub Integration` (third-party nicholaslee119 versiyonu da var ama resmi olan `anthropics/claude-code-action` kullanılmalı).
- Hızlı test: issue/PR'da `@claude` mention dene.

---

## 10) IDE Entegrasyonu

Kaynak: `code.claude.com/docs/en/vs-code`, `jetbrains`, `developertoolkit.ai` kılavuzu, `4geeks.io` entegrasyon makalesi.

### VS Code (Birincil, En Cilalı)

**Kurulum**:
- Extensions view (`Cmd+Shift+X`) → "Claude Code" → Install. Alternatif: `code --install-extension anthropic.claude-code`.
- Marketplace: `marketplace.visualstudio.com/items?itemName=anthropic.claude-code`
- CLI zaten kurulu olmalı; extension CLI'yi çağırır. Auth CLI ile paylaşılır (`claude` ile login).

**Özellikler**:
- Native chat panel, inline diff (terminal yerine IDE diff viewer — `/config` → Diff tool `auto`/`terminal`).
- `@` mention file reference, checkpoint-based undo.
- Paralel konuşmalar, selection/tab context otomatik paylaşım (`Read` deny blocklar).
- Diagnostics paylaşımı: lint/type error'ları `getDiagnostics` tool ile Claude'a akar (edit sonrası otomatik istenmez).
- Keyboard: `Cmd+Option+K` / `Alt+Ctrl+K` file ref insert, `Cmd+Esc` quick launch.

**Ayarlar**:
- Shared: `~/.claude/settings.json` aynı dosya.
- Extension-spesifik: VS Code settings (örn `initialPermissionMode`).

**CLI → IDE bağlama**:
- IDE terminalinde `claude` çalıştır → otomatik entegrasyon.
- External terminalde `/ide` → algılayıp bağlanır; bulamazsa plugin'i kurmayı teklif eder.

### JetBrains (IntelliJ, PyCharm, WebStorm, GoLand, PhpStorm, Android Studio...)

**Kurulum**:
- Settings → Plugins → Marketplace → "Claude Code" → Install → Restart.
- JetBrains Marketplace: `plugins.jetbrains.com/plugin/27310-claude-code-beta-`.
- CLI ayrıca kurulu olmalı; `claude` PATH'ta olmalı veya plugin setting'de full path verin. WSL ise `wsl --shutdown` + mirrored networking (`wslconfig`).

**Özellikler**:
- `Cmd+Esc` / `Ctrl+Esc` quick launch, sağ tool window'da Claude panel.
- Diff viewer entegrasyonu, selection context, file ref shortcuts, diagnostics.
- External terminalde `/ide` ile bağlanma.

**Güvenlik notu**: JetBrains'te `acceptEdits` mode IDE config dosyalarını değiştirip otomatik execute'a yol açabileceğinden Manual önerilir.

### Diğer Editörler

Neovim/Emacs/Sublime dahil **her editörün integrated terminali** `claude` çalıştırabilir. Deneyim standalone terminal ile aynı; sadece diff/diagnostics derin entegrasyon yok. VS Code algılaması otomatik (`/ide` ile force).

---

## 11) Config Dosyaları ve Ayarları

Kaynak: `code.claude.com/docs/en/settings` (32K+), `settings-reference`, `tools` page.

### Settings Dosyaları Hiyerarşisi

| Scope | Dosya | Kimi Etkiler | Ne için |
|-------|-------|--------------|---------|
| User | `~/.claude/settings.json` | Sen, tüm projeler (bu makine) | Tema, model default, kişisel permission |
| Shared Project | `.claude/settings.json` | Bu klasörde çalışan herkes (commit ile paylaş) | Team permission, hooks, plugin, env |
| Project Local | `.claude/settings.local.json` | Sen, sadece bu proje (gitignore) | Kişisel override, "don't ask again" allow'ları |
| Managed | `managed-settings.json` (+ MDM / console) | Org'un deploy ettiği herkes | Security policy, compliance (en üst) |
| Ek | `~/.claude.json` | Claude'un kendi state'i | Auth session, MCP config, per-project trust, history |
| Alt | `.mcp.json`, `~/.mcp.json` | MCP server'ları | MCP konfigürasyonu |
| Memory | `CLAUDE.md`, `.claude/rules/*.md`, `~/.claude/projects/<hash>/memory/` | Context | Instructions / auto memory |

**Global git excludes**: İlk `settings.local.json` yazımında `**/.claude/settings.local.json` global excludes'e eklenir (`core.excludesFile`).

**Worktree/local path**: Repo root'ta çözülür (worktree main checkout), bazı istisnalar (repo dışı, home root, Windows, ownership mismatch).

**Bulut session**: Sadece `.claude/settings.json` + server-managed settings okunur; user/local + file-based managed okunmaz.

### Değiştirme & Doğrulama

- `/config` menüsü (Status sekmesi dahil) veya dosyayı direkt edit.
- Tek oturum için bayrak/env override.
- `claude doctor` / `/doctor` ile validasyon; `claude --debug-file`.
- **Precedence**: managed > CLI bayrak/env > project > local > user. List'ler merge edilir (override değil). Permission `deny` her seviyede `allow`'u ezer. Managed'e karşı 8 istisna (örn `disableBypassPermissionsMode`, `enableArtifacts`, `isolatePeerMachines`, `crossSessionInbound` stricter wins, vs — settings sayfasında tablo).

### Önemli Settings Anahtarları (seçme)

- `model` — `opus`/`sonnet`/`haiku`/`fable`/`best`/`default` veya tam ID; `fallbackModel` zinciri.
- `permissions` — `allow`/`ask`/`deny` array'leri + `defaultMode` + `disableBypassPermissionsMode` + `additionalDirectories`.
- `hooks` — event→matcher→handlers (yukarıda).
- `enabledPlugins` — `{ "plugin@marketplace": true }`.
- `extraKnownMarketplaces` — team marketplace otomatik ekleme.
- `diffTool` — `auto`/`terminal`.
- `skillListingBudgetFraction`, `skillListingMaxDescChars`, `skillOverrides` — skill görünürlüğü.
- `disableBundledSkills`, `autoMemoryEnabled`, `autoMemoryDirectory`, `availableModels`, `enforceAvailableModels`, `modelOverrides`.
- `env` — env var inject bloğu (`ANTHROPIC_MODEL` dahil).
- `sandbox.filesystem`, `sandbox.allowedDomains/deniedDomains` — sandbox.
- `verbose`, `viewMode`, `theme`, `keybindings`, `statusLine`, `includeCoAuthoredBy`, `alwaysThinkingEnabled`.

**Örnek user settings**:
```json
{
  "model": "opus",
  "alwaysThinkingEnabled": true,
  "permissions": { "defaultMode": "bypassPermissions" },
  "enabledPlugins": { "pyright-lsp@claude-plugins-official": true }
}
```

**Örnek team settings**:
```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git status)"],
    "deny": ["Read(./.env)", "Read(./secrets/**)"]
  },
  "hooks": { "PostToolUse": [{ "matcher": "Write", "hooks": [{ "type": "command", "command": "npx prettier --write $1" }] }] },
  "enabledPlugins": { "code-review@claude-plugins-official": true }
}
```

---

## 12) Model Seçenekleri

Kaynak: `code.claude.com/docs/en/model-config` + `tygartmedia.com` + `claudify.tech` + `dextralabs.com` + `platform.claude.com` pricing.

### Model Ailesi (Yunan harf tier + versiyon)

| Model | API String | Context | Fiyat (MTok input/output) | En İyi |
|-------|------------|---------|---------------------------|--------|
| **Haiku 4.5** | `claude-haiku-4-5-20251001` | 200K | $1 / $5 | Sınıflandırma, tagging, yüksek hacim, düşük gecikme |
| **Sonnet 4.6** | `claude-sonnet-4-6` | 200K (1M beta) | $3 / $15 | Üretim kodlama, yazı, analiz — %80-90 iş yükü |
| **Sonnet 5** | `claude-sonnet-5` | 1M native | $2/$10 intro (31 Ağu 2026'ya kadar sonra $3/$15) | Sonnet'in son nesli, default |
| **Opus 4.6/4.7/4.8** | `claude-opus-4-6` vb | 200K / 1M | $5 / $25 | Derin akıl yürütme, mimari, uzun-horizon agent |
| **Opus 5** | `claude-opus-5` | 200K / 1M | $5 / $25 | En üst akıl yürütme (v2.1.219+ gerekir) |
| **Fable 5** | `claude-fable-5` / `fable` alias | 1M | Kredi bazlı (plan'a göre) | En büyük, otonom, çok oturumluk araştırma; siber/biyolojide fallback |

**Not**: Sonnet 5 (30 Haz 2026) Sonnet 4.6'nın yerini aldı (prod default). Opus 5, Claude Code v2.1.219+ gerektirir; Sonnet 5 v2.1.197+. Fable 5 v2.1.170+; zero data retention'da picker'da gizlenebilir.

### Alias'lar

`default` (override temizle), `best` (Fable varsa Fable yoksa Opus), `fable`, `opus`, `sonnet`, `haiku`, `sonnet[1m]`, `opus[1m]`, `opusplan` (plan'da opus, execution'da sonnet). Provider'a göre alias çözümü farklı: Anthropic API güncel, AWS/Foundry/GCP bir versiyon geriden gelebilir; tam ID ile pin'leyin.

### Model Seçimi & Effort

- **Session içinde**: `/model [alias|id]` (Enter=kalıcı default, `s`=sadece bu session).
- **Startup**: `claude --model opus`
- **Env**: `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` / `SONNET_MODEL` / `HAIKU_MODEL`.
- **Settings**: `model` alanı; `modelOverrides` ile ARN/deployment map; `availableModels` allowlist + `enforceAvailableModels`.
- **Effort**: `/effort` veya `--effort low|medium|high|max|auto`; `ultrathink` tek seferlik derin reasoning; adaptive reasoning + extended thinking + 1M context penceresi (`sonnet[1m]`).
- **Org kısıtları**: `organization default model`, `effort limits`, `fallback model chains` (auto fallback; `ask before switching` opsiyonu; Bedrock/Agent Platform/Foundry için enable flag).

### Fable Özel

- Outcome odaklı prompt'layın, goal koyun, doğrulama reminder'ı gerekmez, büyük görev verin.
- Güvenlik classifier'ı tetiklenirse otomatik fallback.
- Kredi faturalandırma: plan/seat'e bağlı; interactive'da consent prompt, background/Remote Control'de 5dk deadline sonra default'a döner; `-p` ve SDK'da prompt yok direkt faturalandırır.

### Prompt Caching

Otomatik aktif. `DISABLE_PROMPT_CACHING` (genel) ve `DISABLE_PROMPT_CACHING_{HAIKU,SONNET,OPUS,FABLE}` ile kapatılabilir. TTL ayrı: ana konuşma vs subagent.

---

## 13) Kurulum Yöntemleri

Kaynak: `code.claude.com/docs/en/setup`, `github.com/anthropics/claude-code README`, `morphllm.com npm kılavuzu`, `vibecodingwithfred` native guide.

### Önerilen: Native Binary (En Hızlı, Oto-güncel)

**macOS / Linux / WSL**:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```
Sonra `source ~/.bashrc` veya `~/.zshrc`, `claude --version`, `claude doctor`. Kurulum yeri `~/.claude/bin/claude` veya `~/.local/bin/claude`. Otomatik background update.

**Windows PowerShell**:
```powershell
irm https://claude.ai/install.ps1 | iex
```

**Windows CMD**:
```batch
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

**Doğrulama**: `manifest.json` + GPG imza ile SHA256 verification.

### Alternatifler

**Homebrew** (macOS/Linux):
```bash
brew install --cask claude-code        # stable channel (~1 hafta gecikmeli)
brew install --cask claude-code@latest # latest channel
# manuel: brew upgrade claude-code
```

**WinGet** (Windows):
```powershell
winget install Anthropic.ClaudeCode
# manuel: winget upgrade Anthropic.ClaudeCode
```

**apt/dnf/apk** (Debian/Fedora/RHEL/Alpine): dokümanda Linux talimatları mevcut.

**npm** (Deprecated ama hala çalışır — Node 18+):
```bash
npm install -g @anthropic-ai/claude-code
# veya local: npm install --save-dev @anthropic-ai/claude-code && npx claude
# update: npm install -g @anthropic-ai/claude-code@latest   # npm update -g kullanmayın (semver range takılır)
# bir seferlik: npx @anthropic-ai/claude-code
# bun: bunx @anthropic-ai/claude-code
```
Platform optional deps: `*-darwin-arm64`, `*-linux-x64/-musl`, `*-win32-x64` vb. Postinstall native binary'yi linkler. `sudo` kullanmayın; `which -a claude` ile çakışmayı kontrol edin.

**Binary yönetimi**:
```bash
claude install stable   # veya latest veya 2.1.118
claude update
claude migrate-installer # npm → native geçiş
```

### Gereksinimler

- Node 18+ sadece npm yolu için; native için gerekmez.
- Git for Windows (native Windows'ta Bash tool için önerilir, yoksa PowerShell kullanılır; WSL gerekmez).
- Ücretli Claude aboneliği (Pro/Max/Team/Enterprise) veya Console hesabı; third-party provider (Bedrock/Vertex/Foundry) de desteklenir.
- Disk: ~56MB, ripgrep bundled (search).

### Kurulum sonrası

```bash
cd your-project
claude   # ilk seferde login prompt
/ide     # external terminalden IDE bağla
/init    # CLAUDE.md oluştur
claude doctor  # sağlık kontrolü
```

### Troubleshooting

- `syntax error near '<'`, `403`, curl hatası → `troubleshoot-install` dokümanı.
- `command not found` → PATH'a `npm bin -g` ekleyin veya native path'i ekleyin.
- Karışık kurulum (`unknown (2.0.0)`, invocation ≠ execution) → `npm uninstall -g @anthropic-ai/claude-code`, cache temizle, native ile yeniden kur.
- EACCES → `npm config set prefix '~/.npm-global'` + PATH, nvm kullan.
- Windows'ta PowerShell vs CMD ayrımı (`PS C:\` vs `C:\`).

### Kaldırma

`claude project purge` (proje state), `brew uninstall` / `winget uninstall` / `npm uninstall -g` + `~/.claude` temizliği. Detay uninstall kılavuzları `vibecodingwithfred` ve `morphllm`'de.

---

## 14) Kaynakça

En az 10 kaynak — bu döküman 15+ kaynaktan sentezlendi:

1. https://code.claude.com/docs/en/overview — Genel bakış, kurulum yüzeyleri, yetenekler
2. https://code.claude.com/docs/en/cli-reference — CLI komut ve bayrak tam referansı
3. https://code.claude.com/docs/en/commands — Slash komut tam referansı (tablo dahil)
4. https://code.claude.com/docs/en/tools — Built-in tool set, permission gereksinimleri
5. https://code.claude.com/docs/en/permissions — Permission sistemi (allow/ask/deny, modlar, sandbox)
6. https://code.claude.com/docs/en/memory — CLAUDE.md + Auto Memory sistemi
7. https://code.claude.com/docs/en/hooks — Hooks lifecycle, 30+ event, handler tipleri
8. https://code.claude.com/docs/en/hooks-guide — Hooks quickstart + örnekler
9. https://code.claude.com/docs/en/mcp — MCP entegrasyon tam referansı (95K)
10. https://code.claude.com/docs/en/settings — Settings dosyaları, precedence, kapsamlar
11. https://code.claude.com/docs/en/model-config — Model alias, effort, Fable, caching
12. https://code.claude.com/docs/en/discover-plugins — Plugin keşif/kurulum, marketplace
13. https://code.claude.com/docs/en/github-actions — GitHub Actions @claude kurulumu
14. https://github.com/anthropics/claude-code — Resmi GitHub repo README (kurulum özeti)
15. https://github.com/googlarz/claude-code-commands — Binary extraction slash komut referansı (v2.1.92, 140+ komut)
16. https://code.claude.com/docs/en/vs-code — VS Code entegrasyonu
17. https://code.claude.com/docs/en/jetbrains — JetBrains entegrasyonu
18. https://code.claude.com/docs/en/setup — Advanced setup / native installer
19. https://code.claude.com/docs/en/slash-commands (skills) — Skill sistemi, frontmatter, lifecycle
20. Ek analiz: https://www.startuphub.ai/ai-news/technology/2026/claude-code-s-latest-features , https://simplified.com/blog/automation/claude-code , https://tygartmedia.com/claude-models-comparison/ , https://claude.com/blog/how-to-configure-hooks

> Notlar
> - Dokümantasyon `code.claude.com` canonical; `llms.txt` index üzerinden keşfedilebilir.
> - Versiyon notları CHANGELOG.md (github) ile takip edilebilir; komutların availability'si sıklıkla `v2.1.xxx` ile sürümlenir.
> - Lokma harness için: `docs/` klasörü tek kaynak olacak — bu raw dosya oraya ingest edilmeden önce normalize edilmeli.
