# Claude Code — Birebir Analiz & Özellik Envanteri

> **Lokma için kaynak doküman — Claude Code ne yapıyorsa Lokma da onu yapacak.**
> Kaynaklar: `https://github.com/anthropics/claude-code`, `https://code.claude.com/docs`, OMP (`https://github.com/can1357/oh-my-pi`)
> Tarih: 2026-08-31 · Durum: Araştırma Fazı

---

## 1. Claude Code Nedir? Felsefe

**Tanım:** Anthropic'in agentic coding tool'u. Terminalde yaşar, codebase'i anlar, rutin görevleri natural language ile yürütür. Sadece autocomplete değil — **planlar, kod yazar, test eder, git yönetir.**

**Felsefe:**
- **Agentic Loop:** Model → Tool çağrısı → Sonuç → tekrar Model. Tek bir API call değil, döngü.
- **Harness = Zeka:** `query.ts` (~1730 satır) tek merkez — tüm etkileşim oradan geçer. REPL, SDK, sub-agent, headless hepsi `query()` generator'ı üzerinden.
- **Harness ≠ Model:** Model reasoning yapar, harness execution/context/tool yönetimi yapar. Model değişebilir (Sonnet/Opus/Haiku), harness sabit.
- **Conversational:** Mükemmel prompt gerekmez, iteratif steering var (Esc ile durdur, düzelt, devam).

---

## 2. Yüzeyler (Surfaces) — Nerede Çalışır

| Yüzey | Nerede Koşar | Açıklama |
|-------|--------------|----------|
| **Terminal CLI** | Local makine | Ana yüzey, full-featured |
| **VS Code Extension** | Editor içinde | Inline diff, @-mention, plan review |
| **JetBrains Plugin** | IntelliJ/PyCharm/WebStorm | Diff viewing, selection context |
| **Desktop App** | macOS/Win/Linux (beta) | Multi-session, visual diff, drag-drop layout, computer use |
| **Web (claude.ai/code)** | Anthropic Cloud VM | Repo bağla, task gönder, PR al. No local setup |
| **Mobile (iOS/Android)** | Phone | Start/monitor/steer |
| **Slack** | Team chat | `@claude` tag ile task → PR |
| **CI/CD** | GitHub Actions / GitLab | `@claude` mention → otomatik response |

**Lokma Karşılığı:** Aynı 3 katman — `CLI (terminal)` → `Web Harness (browser)` → `Desktop (sonra)`. Tümünde **aynı agent loop**.

---

## 3. CLI Komutları (Tam Referans)

### Ana Komutlar
| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `claude` | Interactive session başlat | `claude` |
| `claude "query"` | Initial prompt ile başlat | `claude "explain this project"` |
| `claude -p "query"` | Headless query, sonra exit (SDK mode) | `claude -p "explain fn"` |
| `cat file \| claude -p "query"` | Piped content işleme | `cat logs.txt \| claude -p "anomalies?"` |
| `claude -c` | Son conversation'ı continue et | `claude -c` |
| `claude -c -p "query"` | Continue via SDK | `claude -c -p "Check types"` |
| `claude -r "<session>" "query"` | Session ID/name ile resume | `claude -r "auth-refactor" "Finish PR"` |
| `claude --continue` / `--resume` | Alias'lar | — |
| `claude update` | Latest'e güncelle | `claude update` |
| `claude install [version]` | Binary reinstall (stable/latest/2.1.118) | `claude install stable` |
| `claude auth login` | Anthropic login (--email, --sso, --console) | `claude auth login --console` |
| `claude auth logout` | Logout | — |
| `claude auth status` | JSON/text auth durumu | — |
| `claude agents` | Agent view — paralel session'ları izle/dispatch et | `claude agents --json --all` |
| `claude attach <id>` | Background session'a attach | `claude attach 7c5dcf5d` |
| `claude logs <id>` | Background session output | — |
| `claude respawn <id>` | Session restart (--all ile hepsi) | — |
| `claude rm <id>` | Session list'ten sil (transcript kalır) | — |
| `claude daemon status` | Supervisor durumu | — |
| `claude daemon stop --any` | Supervisor durdur (--keep-workers opsiyonel) | — |
| `claude doctor` | Read-only diagnostics (install/settings/Remote Control) | — |
| `claude mcp` | MCP server yönetimi | — |
| `claude mcp login <name>` | MCP OAuth flow | `claude mcp login sentry` |
| `claude plugin` | Plugin yönetimi | `claude plugin install code-review@...` |
| `claude project purge [path]` | Local state sil (transcripts, logs, file history) | `--dry-run`, `-y`, `--all` |
| `claude remote-control --name "..."` | Remote Control server (server mode) | — |
| `claude gateway --config gateway.yaml` | Self-hosted gateway (Bedrock/GCP/Azure) | v2.1.195+ |
| `claude self-hosted-runner setup` | Self-hosted runner kaydı | v2.1.224+ |
| `claude setup-token` | CI için long-lived OAuth token | — |
| `claude import [codex\|gemini]` | Diğer agent'lardan config import (/import) | v2.1.213+ |
| `claude --teleport` | Web'de başlayan task'ı terminale çek | subscription gerekir |
| `claude --cloud` | Local'den cloud session başlat | — |
| `claude --worktree` | Git worktree'de izole session | — |

### Önemli CLI Flag'leri
```
--model <name>              # Model seç (opus/sonnet/haiku)
--permission-mode <mode>    # auto/manual/acceptEdits/plan/bypassPermissions
--allow-dangerously-skip-permissions
--advisor <model>           # Reviewer model (fable/opus/sonnet)
--add-dir <path>            # Ek çalışma dizini
--mcp-config <path>         # MCP config dosyası
--plugin-dir <path>
--settings <path>
--effort / --agent          # Agent dispatch defaults
--output-format json|stream-json
--from-pr <number>          # PR ile linkli session'ı aç
--fork-session               # Resume yerine fork
--cwd <path>                # Agent view filtresi
```

---

## 4. Slash Komutları (Interactive Mode)

`/ ` yazınca menu açılır, filter'lı arama.

| Komut | Ne Yapar |
|-------|----------|
| `/clear` | Conversation clear (context reset, session kalır) |
| `/compact` | Context'i manuel compact et |
| `/context` | Context window kullanımını göster |
| `/model` | Model değiştir (Opus/Sonnet/Haiku) |
| `/permissions` | Permission rules düzenle |
| `/doctor` | Setup checkup + auto-fix |
| `/mcp` | MCP server panel |
| `/plugin` | Plugin marketplace |
| `/reload-plugins` | Plugin'leri yeniden yükle |
| `/review` / `/code-review` | PR/branch review (P0-P3 verdict) |
| `/schedule` | Routine oluştur (bulut, schedule trigger) |
| `/loop` | Self-paced loop (/loop repeats prompt) |
| `/agents` | Agent view aç |
| `/resume` | Session picker (worktree/project filtre) |
| `/branch` | Session fork (yeni ID) |
| `/init` | CLAUDE.md oluşturma wizard'ı |
| `/import` | Codex/Gemini config import |
| `/desktop` | Terminal session'ı Desktop app'e taşı |
| `/bug` | Bug report (feedback + usage data gönderir) |
| `/usage` | Token/limit breakdown |
| `/help` | Yardım |
| `/collab` | Live session paylaş (OMP'de, Claude Code'da benzer) |
| `/ultrareview` | Deep multi-agent review (research preview) |

**Skill-Provided Slash Commands:** `~/.claude/commands/` ve `<project>/.claude/commands/` altında markdown skill'ler → otomatik slash command olur. Örn: `plugins/mcp-server-dev` → `/mcp-server-dev:build-mcp-server`

---

## 5. Built-in Araçlar (Tools) — Tam Liste

Model bu tool'ları çağırır. Permission sistemi bu isimler üzerinden çalışır.

| Tool | Açıklama | Permission (Manual) |
|------|----------|---------------------|
| **Read** | Dosya oku | No (workdir dışı istisna) |
| **Write** | Yeni dosya oluştur / overwrite | Yes |
| **Edit** | Hedefli edit (string replace, patch) | Yes |
| **Glob** | Pattern ile dosya bul | No |
| **Grep** | Regex içerik arama (ripgrep) | No |
| **Bash** | Shell komutu çalıştır | Yes (read-only whitelist hariç) |
| **AskUserQuestion** | Çoktan seçmeli soru sor | No |
| **Agent** | Subagent spawn (kendi context window'u) | No |
| **TodoWrite** | Todo list yönet | No |
| **WebFetch** | URL'den içerik çek | No |
| **WebSearch** | Web'de ara (max 200/session) | No |
| **LSP** | Jump to def, find refs, diagnostics | No |
| **NotebookEdit** | Jupyter cell edit | Yes |
| **EnterPlanMode** | Plan moduna geç | No |
| **ExitPlanMode** | Plan onayı + plan modundan çık | Yes |
| **EnterWorktree / ExitWorktree** | Git worktree izole session | Yes/No |
| **TaskCreate/List/Get/Output** | Task yönetimi | No |
| **SendMessage** | Diğer session/agent'a mesaj | No |
| **ListAgents** | Mesaj atılabilir agent listesi | No |
| **Monitor** | Komutu bg'de çalıştır, output'u stream et | Yes |
| **Skill** | Skill çalıştır | Yes |
| **CronCreate/List/Delete** | Session-scoped scheduled task | No |
| **Checkpoint** | Dosya snapshot al | No |
| **Rewind** | Checkpoint'e geri dön | — |
| **PowerShell** | Windows PowerShell native | Yes |
| **Artifact** | HTML/MD artifact publish (claude.ai) | Yes |
| **PushNotification** | Desktop + phone push | No |

**Tool Davranış Detayları:**
- **Read:** `~/.claude/projects/` altında plaintext JSONL transcript; her tool call sonrası fresh read
- **Edit vs Write:** Write = full overwrite (Opus 4.6+ öncesi read şartı vardı, artık conditional), Edit = targeted replace
- **Bash:** Persist between commands? Claude Code'da kısmen — OMP'de brush shell ile session persistent. `timeout` ve `output limits` var, `background commands` desteklenir
- **WebSearch:** Session başına 200 limit, `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` ile artırılabilir, `/clear` reset'ler
- **Agent:** Kendi context'i, ana loop'a `yield*` ile bağlı

---

## 6. Permission Sistemi

**Modlar (Shift+Tab ile cycle):**
- **Auto** (default Pro/Max/Team): Classifier background'da değerlendirir, riskli olanı bloklar. Soru sormaz.
- **Manual:** Her file edit & shell öncesi sorar
- **Accept Edits:** File edit + `mkdir/mv` gibi fs komutları auto, diğer shell sorar
- **Plan:** Sadece okuma/araştırma, source edit yok. Plan sunar, onay bekler.
- **bypassPermissions** (aka `--allow-dangerously-skip-permissions`): Hiç sormaz. Tehlikeli.

**Permission Rules:** `.claude/settings.json` içinde allow/deny:
```json
{
  "permissions": {
    "allow": ["Bash(npm test)", "Bash(git status)", "Read(~/.config/**)"],
    "deny": ["Bash(rm -rf *)", "Read(/etc/shadow)"],
    "ask": ["Bash(git push)"]
  }
}
```
- Scope hiyerarşisi: `Managed (org) > Project (.claude/settings.json) > User (~/.claude/settings.json) > Local`
- **Auto-mode classifier rules:** `claude auto-mode defaults --label 'Git Destructive'` ile görülebilir

---

## 7. Memory Sistemi

**İki mekanizma:**

### a) CLAUDE.md (Manuel, kalıcı)
- Proje kökünde (ve parent dizinlerde) `CLAUDE.md` — her session başında okunur
- İçerik: coding standards, architecture, preferred libs, review checklist
- Hiyerarşi: `./CLAUDE.md` → `../CLAUDE.md` → `~/.claude/CLAUDE.md` → `~/.claude/memory/`
- `/init` wizard ile oluşturulur, `/memory` ile yönetilir

### b) Auto Memory (Otomatik)
- Claude çalışırken öğrenir, `~/.claude/projects/<project>/memory/` veya `MEMORY.md` içine yazar
- İlk **200 satır veya 25KB** (hangisi önce dolarsa) her session başında yüklenir
- Örnek: kullanıcının tercihleri, proje pattern'leri

**Context Window Yönetimi:**
- Context doldukça **auto-compact** olur (eski mesajlar özetlenir)
- `/compact` manuel, `/context` ile ne kadar dolu görülür
- Prompt caching: model switch uncached turn'e neden olur, `/compact` cache'i bozar

---

## 8. Hooks Sistemi

Shell komutlarını Claude Code lifecycle event'lerinde çalıştır.

**Event'ler:**
- `PreToolUse` — Tool öncesi (örn: `Bash` öncesi lint)
- `PostToolUse` — Tool sonrası (örn: `Edit` sonrası `prettier --write`)
- `UserPromptSubmit` — Kullanıcı prompt gönderince
- `Notification` — Bildirim tetiklenince
- `Stop` — Session bitince
- `SubagentStop` — Subagent bitince
- `SessionStart` / `SessionEnd`
- `PreCompact` — Compact öncesi

**Tanım:** `.claude/settings.json` içinde:
```json
{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "prettier --write $FILE"}]}
    ]
  }
}
```
- Matcher: tool name regex
- Hooks: `command` tipi shell çalıştırır

---

## 9. Plugins & Skills

**Plugin:** Skills + agents + hooks + MCP servers paketi. Marketplace'ten yüklenir.

```bash
/plugin marketplace add anthropics/claude-plugins-official
/plugin install code-review@claude-plugins-official
/plugin install mcp-server-dev@claude-plugins-official
```

- Kaynak: `~/.claude/plugins/` ve `.claude/plugins/`
- Plugin içinde: `commands/`, `agents/`, `hooks/`, `.mcp.json`, `skills/`
- Custom color themes plugin ile ship edilebilir
- `.zip` ve URL'den yükleme desteklenir

**Skill:** Markdown tabanlı reusable workflow. `/skill-name` ile çağrılır. `~/.claude/skills/` altında. Örn: `/review-pr`, `/deploy-staging`
- Skill = prompt template + tool orchestration
- Marketplace skill'leri otomatik slash command olur

---

## 10. MCP (Model Context Protocol)

**Nedir:** AI ↔ external tools için open standard. Claude Code MCP client olarak çalışır.

**Transport'lar:**
- `http` (streamable-http, önerilen) — `claude mcp add --transport http notion https://mcp.notion.com/mcp`
- `sse` (deprecated) — `claude mcp add --transport sse asana https://...`
- `stdio` (local) — `claude mcp add --transport stdio my-server -- npx my-mcp-server`
- `ws` (WebSocket)

**Scope'lar:**
- `local` — sadece bu session
- `project` — `.mcp.json` (version control'e commit'lenebilir)
- `user` — `~/.claude.json` (global)

**Özellikler:**
- Dynamic tool updates, auto-reconnect, mid-session drop handling
- OAuth: `claude mcp login <name>` / `logout`
- Tool search: çok tool varsa defer edilir, `tool_search` ile lazy load
- Elicitation, resources, prompts-as-commands
- `channels` — MCP server push messages ile session'a event enjekte eder (Telegram/Discord/webhook → Claude)

**Popüler MCP'ler:** Notion, GitHub, Jira, Sentry, Figma, Postgres, Slack, Gmail

---

## 11. Subagent & Parallel Work

**Subagent:** `Agent` tool ile spawn edilir, kendi context window'u, kendi tool set'i.

```md
# .claude/agents/reviewer.md
---
name: reviewer
tools: [Read, Grep, Glob]
model: sonnet
---
Sen bir code reviewer'ısın...
```

**Agent Teams:** Multi-agent koordinasyon, lead agent subtask dağıtır, `SendMessage` ile haberleşir
**Agent View:** `claude agents` — tek ekranda tüm session'ları izle, dispatch et
**Dynamic Workflows:** Claude'un yazdığı script ile çok subagent orchestration (codebase audit, migration)
**Worktrees:** `claude --worktree` veya `EnterWorktree` ile git worktree'de izole session, collision yok

---

## 12. Git Entegrasyonu

- `gh pr create`, `git commit`, `git branch` tool'lar üzerinden
- `claude "commit my changes"` → stage + commit message yazar
- `@claude` mention → GitHub Actions workflow tetiklenir (`.github/workflows/claude.yml`)
- `--from-pr 123` ile PR'a bağlı session'ı aç
- Auto-fix PR: cloud'da PR'ı al, düzelt, push et

**GitHub Actions Örneği:**
```yaml
on: [issue_comment]
if: contains(github.event.comment.body, '@claude')
jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## 13. Session & Checkpointing

- **Storage:** `~/.claude/projects/<encoded-project>/` altında JSONL transcript (plaintext)
- **Checkpoint:** File edit öncesi snapshot, `Rewind` ile geri dön
- **Resume/Fork:** `claude --continue` (aynı ID, append), `--resume <id>` (pick), `--fork-session` (copy → yeni ID)
- **History:** `~/.claude/history.jsonl` — cross-project command history, Ctrl+R ile search
- **Export:** `claude --print --output-format json` transcript export

---

## 14. Config Dosyaları — Tam Harita

| Dosya | Scope | İçerik |
|-------|-------|--------|
| `~/.claude.json` | User global | User settings, auth, project list, MCP user scope |
| `~/.claude/settings.json` | User | Permissions, hooks, env, theme |
| `.claude/settings.json` | Project | Project permissions/hooks (commit'lenir) |
| `.claude/settings.local.json` | Project local | Local override (gitignore) |
| `.mcp.json` | Project | MCP servers (project scope) |
| `CLAUDE.md` | Project | Persistent instructions |
| `~/.claude/CLAUDE.md` | User | Global instructions |
| `.claude/commands/*.md` | Project | Custom slash commands |
| `.claude/agents/*.md` | Project | Custom subagents |
| `.claude/hooks/` | Project | Hook scripts |
| `~/.claude/plugins/` | User | Installed plugins |
| `~/.claude/projects/<hash>/` | Cache | Transcripts, checkpoints |

---

## 15. Modeller

| Model | Güç | Kullanım |
|-------|-----|----------|
| **Opus 4.6** | En güçlü reasoning | Kompleks mimari, zor bug |
| **Sonnet 4.5** | Dengeli (default) | Günlük coding |
| **Haiku 4.5** | Hızlı/ucuz | Basit task, review |
| **Opus 4.7 + xhigh effort** | Ultra | Week 16+ yeni |

Switch: `/model` veya `claude --model opus`
Pricing: Bedrock global/regional endpoint'ler ayrı

---

## 16. Kurulum

| Yöntem | Komut | Auto-update |
|--------|-------|-------------|
| **Native (önerilen)** | `curl -fsSL https://claude.ai/install.sh \| bash` | Evet (background) |
| **Homebrew** | `brew install --cask claude-code` | Hayır (`brew upgrade`) |
| **WinGet** | `winget install Anthropic.ClaudeCode` | Hayır |
| **PowerShell** | `irm https://claude.ai/install.ps1 \| iex` | Evet |
| **npm (deprecated)** | `npm install -g @anthropic-ai/claude-code` | Hayır |

Gereksinim: `ANTHROPIC_API_KEY` veya `claude auth login` (Claude subscription)

---

## 17. Diğer Yetenekler

- **Computer Use (preview):** macOS'ta app açma, click/type, screen görme
- **Chrome Extension:** Web app test, console log, form automation
- **Image handling:** Screenshot/paste ile görsel analiz
- **Plan Mode:** Edit yapmadan plan sun, onay al
- **AskUserQuestion:** Belirsizlikte çoktan seçmeli soru
- **SendFeedback:** Bug report draft, kullanıcı onayıyla gönder
- **Remote Control:** `claude remote-control` → telefon/browser'dan local session kontrol
- **Routines:** `claude.ai`'da schedule (cron/API/GitHub event trigger)
- **Security Guidance Plugin:** Kendi yazdığı kodu vuln için review et

---

*Sonraki doküman: `11-ARASTIRMA-omp-temalar.md` ve `12-HARNESS-MIMARI-cli-web.md`*
