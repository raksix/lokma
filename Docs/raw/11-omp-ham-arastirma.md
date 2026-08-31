# OMP (oh-my-pi / omp.sh) Derin Araştırma Raporu

> **Kaynak:** Lokma (Claude Code klonu harness) için OMP temaları entegrasyonu ön araştırması  
> **Tarih:** 2026-08-31  
> **Kaynak site:** https://omp.sh — "a coding agent with the IDE wired in"  
> **Repo:** https://github.com/can1357/oh-my-pi (28.5k ⭐, 2.8k fork, MIT)  
> **Çekilen kaynak sayısı:** 7+ (site + GitHub + docs + EveryDev + design doc + vs karşılaştırmaları)

---

## 1) OMP Nedir, Felsefesi

**OMP = oh-my-pi**, `omp` komutu ile çalışan terminal-first bir coding agent harness'ıdır. Orijinalinde Mario Zechner'in **Pi (pi-mono)** projesinin fork'udur; **Can Bölük / Stencil Labs, Inc.** tarafından "batteries included, open all the way down" felsefesiyle yeniden yazılmıştır. Slogan: **"A coding agent with the IDE wired in."**

### Kim yapıyor?
- **Yazar:** Can Bölük (New York), Stencil Labs (stencil.so)
- **Temel:** `badlogic/pi-mono` fork'u, TypeScript + Rust hibrit
- **Lisans:** MIT (tamamen açık kaynak, GitHub'da tüm kod)
- **Boyut:** ~80.000 satır Rust core + ~80.000 satır vendored (brush bash fork + 58 coreutils), ~80+ kaynak dosyası içeren `packages/coding-agent` monorepo
- **Dağıtım:** `curl | sh`, Homebrew, Bun, Nix, mise, PowerShell; macOS/Linux/Windows native (WSL gerektirmez), Bun ≥1.3.14

### Felsefe — "The harness problem"
OMP'nin manifestosu blog yazısında tartışılan **harness problem**'dir: Model aynı olsa bile etrafındaki harness (tool formatı, edit stratejisi, bağlam yönetimi) sonucu 10 kata kadar değiştirir. OMP'nin iddiası:
- **Model ≠ ürün.** Claude Sonnet/Opus aynı ağırlıklarla Grok Code Fast 1'de %6.7→%68.3 (10x), Gemini 3 Flash'ta +5pp, MiniMax'te 2.1x iyileşme sadece edit formatı (hashline vs str_replace) değiştirilerek elde edilmiştir.
- **Her tool benchmaxxed.** `read` özetleyen snippet'ler döndürür, `grep` in-process ripgrep ile en hızlı, `lsp` IDE'nin bildiğini bilir, prompt'lar her modele göre relentlessly ayarlanır.
- **Native, fork/exec yok.** ripgrep, glob, find, bash (brush-shell), 58 coreutils, BPE token sayımı, AST, syntax highlight — hepsi Rust N-API addon içinde, libuv thread pool'da, sıcak yolda fork yok. Windows'ta da aynı binary.
- **Batteries included, açık.** 40+ provider, 32 tool, 14 LSP op, 28 DAP op, subagent, plan mode, hindsight memory, hashline, time-traveling rules — hepsi kutuda, hepsi MIT.
- **Terminal-first ama editor-aware.** Terminal'de yaşar, ama LSP/DAP/ACP ile IDE'nin bilgisini içeri çeker; context'i editör-shell-chat arasında shuttle etmez, tek session'da tutar.
- **Config inheritance.** İlk çalışmada `.claude`, `.cursor`, `.windsurf`, `.codex`, `.cline`, `.github/copilot`, `.vscode`, `.gemini` içindeki kuralları/skill'leri/MCP server'ları native haliyle okur; migration script yok.

> Kaynak: omp.sh ana sayfa meta description: "Subagents, plan mode, LSP, DAP, hindsight memory, hashline edits, time-traveling rules — with a native Rust engine doing the heavy lifting." (omp.sh, GitHub README, EveryDev)

---

## 2) IDE Entegrasyonu Nasıl

OMP'nin en ayırt edici vaadi **"IDE wired in"** — diğer agent'ların sonradan eklediği LSP/DAP burada çekirdekte.

### LSP — 14 operasyon
- **Nedir:** Language Server Protocol üzerinden gerçek IDE zekası. 53 dil server'ı destekler (TypeScript, Rust Analyzer, clangd, gopls, zls, Biome, ESLint, Deno, Tlaplus ...).
- **14 operasyon:** `lsp_hover`, `lsp_definition`, `lsp_references`, `lsp_completion`, `lsp_signature`, `lsp_codeAction`, `lsp_rename`, `lsp_format`, `lsp_rangeFormat`, `lsp_prepareRename`, `lsp_documentSymbol`, `lsp_semanticTokens`, `lsp_inlayHint`, `lsp_diagnostic`
- **Kritik fark:** `workspace/willRenameFiles` — bir dosya taşındığında barrel file'lar, re-export'lar, alias import'lar atomik güncellenir. Model "rename" der, OMP gerçek rename yapar.
- **Auto-detection:** Config yoksa bile cwd'deki `rootMarkers` (örn. `package.json`, `Cargo.toml`, `go.mod`, `CMakeLists.txt`) + `$PATH` veya proje-local `node_modules/.bin`, venv, binstubs içindeki binary'i kesiştirerek server'ı otomatik bulur. CWD-only, parent recursive değil.
- **Config:** `~/.omp/agent/lsp.json` (user-wide) ve `<cwd>/.omp/lsp.json` (project) + plugin LSP config'leri, `lsp.json`/`lsp.yaml`/`lsp.yml` varyantları, shallow merge per-server. `idleTimeoutMs` ile idle shutdown.
- **Dokümantasyon:** `docs/lsp-config.md`, `packages/coding-agent/src/lsp/defaults.json` — kaynakta tüm built-in tanımlar.

### DAP — 28 operasyon, 14 adapter
- **Nedir:** Debug Adapter Protocol — model gerçek debugger sürer, print sprinkling yok.
- **28 op:** `dap_launch`, `dap_attach`, `dap_setBreakpoints`, `dap_continue`, `dap_next`, `dap_stepIn`, `dap_stepOut`, `dap_pause`, `dap_threads`, `dap_stackTrace`, `dap_scopes`, `dap_variables`, `dap_evaluate`, `dap_watch`, `dap_setVariable`, `dap_source`, `dap_exceptionInfo`, `dap_loadedSources`, `dap_disconnect`, `dap_terminate`, `dap_restart`, `dap_configurationDone`, `dap_runInTerminal`, `dap_startDebugging`, `dap_reverseContinue`, `dap_stepBack`, `dap_goto`, `dap_completions`
- **14 bundled adapter:** lldb-dap (C/C++/Rust), dlv (Go), debugpy (Python), js-debug-adapter (Node), ve 10 diğer. `debug.enabled` ile gate'lenir.
- **Örnek:** C binary segfault → lldb attach, bad pointer'a step, frame oku; Go hang → dlv goroutine gez; Python wedge → debugpy pause/evaluate.

### ACP — Editor-drivable agent
- **Agent Client Protocol:** `omp acp` ile Zed editörü içinde aynı agent terminaldeki gibi çalışır — buffer'ı canlı okur, editörün save path'i ile yazar, editörün terminal'inde shell spawn eder. Yıkıcı tool'lar permission prompt ile durur. Bridge/plugin/second brain yok.
- **Diğer entegrasyonlar:** Warp terminal 2026 changelog'da native omp CLI-agent integration (Rich Input) olarak listelenir. `computer` tool'u Electron app'leri (Slack gibi) CDP üzerinden sürer; `browser` tool'u Puppeteer/Chromium + relay extension ile kullanıcının açık Chrome tab'larını devralır.

> Kaynak: GitHub README 02/03 maddeleri, docs/lsp-config.md, EveryDev "LSP wired into every write / Drives a real debugger", oh-my-pi-design docs 05-pi-coding-agent

---

## 3) Tema Sistemi (OMP Gibi Temalar Ne Demek)

Lokma için "OMP gibi temalar" demek, **JSON token tabanlı, vars-referanslı, dark/light slot'lu, live-reload'lı** bir TUI tema motoru demektir. Teknik referans `docs/theme.md` ve `src/modes/theme/theme.ts`.

### Ne kontrol eder?
- TUI foreground/background color token'ları
- Markdown styling (`getMarkdownTheme()`)
- Selector/editor/settings list adaptörleri (`getSelectListTheme()` vb.)
- Sembol preset + override (`unicode`/`nerd`/`ascii`) ve spinner frame'leri
- Native highlighter syntax renkleri (`@oh-my-pi/pi-natives`, syntect)
- Status line segment renkleri

### Tema JSON şekli
```json
{
  "$schema": "https://.../theme-schema.json",
  "name": "my-theme",
  "vars": { "accent": "#7aa2f7", "muted": 244 },
  "colors": { "accent": "accent", "border": "#4c566a", ... },
  "export": { "pageBg": "#18181e", ... },
  "symbols": { "preset": "unicode", "overrides": { "check": "✓" }, "spinnerFrames": ["⠋","⠙"] }
}
```
- **Top-level:** `name` (required), `colors` (required, tüm token'lar zorunlu), `vars` (optional, reusable değişken), `export` (optional, HTML export), `symbols` (optional)
- **Color value:** hex `#RRGGBB` | 256-index `0..255` | `vars` referansı (string) | `""` (terminal default `\x1b[39m/\x1b[49m`)
- **Var resolution:** rekürsif, nested, circular reference'te throw, missing'de throw

### Zorunlu color token'lar (67 + 1 optional)
- **Core 11:** `accent`, `border`, `borderAccent`, `borderMuted`, `success`, `error`, `warning`, `muted`, `dim`, `text`, `thinkingText`
- **Background 7:** `selectedBg`, `userMessageBg`, `customMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, `statusLineBg` (+ `link`)
- **Message/tool text 5:** `userMessageText`, `customMessageText`, `customMessageLabel`, `toolTitle`, `toolOutput` (+ `toolText`)
- **Markdown 10:** `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet`
- **Diff + syntax 12:** `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext`, `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`
- **Thinking/mode 9:** `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`, `thinkingMax` (optional, fallback `thinkingXhigh`), `bashMode`, `pythonMode`
- **Status line 13:** `statusLineSep`, `statusLineModel`, `statusLinePath`, `statusLineGitClean`, `statusLineGitDirty`, `statusLineContext`, `statusLineSpend`, `statusLineStaged`, `statusLineDirty`, `statusLineUntracked`, `statusLineOutput`, `statusLineCost`, `statusLineSubagents`
- **Export 3 optional:** `export.pageBg`, `export.cardBg`, `export.infoBg`
- **Box drawing (override):** `boxRound.{topLeft,topRight,bottomLeft,bottomRight,horizontal,vertical}`, `boxSharp.{cross,teeDown,teeUp,teeRight,teeLeft,topLeft,topRight,bottomLeft,bottomRight}`

### Built-in vs custom temalar
- **Lookup order:** 1) embedded built-in'ler (`dark.json`, `light.json`, `defaults/*.json` → `defaultThemes`), 2) `~/.omp/agent/themes/<name>.json` (override `PI_CODING_AGENT_DIR` ile `$DIR/themes`)
- **Built-in sayısı:** 80+ — `titanium` (varsayılan dark), `light` (varsayılan light) + `dark-*` (abyss, arctic, aurora, catppuccin, dracula, gruvbox, nord, tokyo-night, synthwave, volcanic ...) + `light-*` (arctic, catppuccin, github, solarized ...) + nötr `alabaster`, `graphite`, `obsidian`, `quartz`, `sandstone`, `titanium`, `obsidian` vb. `getAvailableThemes()` merge edip sıralar, çakışmada built-in kazanır.
- **Örnek titanium vars:** `brushedTitanium #151820`, `electricBlue #00b4ff`, `titaniumGold #d4c090`, `readoutGreen #00ff88`, `alertRed #ff4757`
- **Örnek dark-nord vars:** `nord0 #2e3440` ... `nord15 #b48ead` (Nord paleti birebir)

### Çalışma zamanı davranış
- **Color mode detection (`detectColorMode`):** `COLORTERM=truecolor|24bit` → truecolor, `WT_SESSION` → truecolor, `TERM=dumb|linux|empty` → 256color, diğer → truecolor. Hex → `Bun.color(..., ansi-16m|ansi-256)`, numeric → `38;5/48;5`, `""` → reset.
- **Init (`initTheme`):** `symbolPreset`, `colorBlindMode`, `theme.dark`, `theme.light` ile başlar. Auto slot seçimi: 1) OSC 11 background luminance, 2) `COLORFGBG` index (<8 dark), 3) macOS fallback, 4) dark fallback. Defaults: `theme.dark=titanium`, `theme.light=light`, `symbolPreset=unicode`, `colorBlindMode=false`.
- **Switching:** `setTheme(name, watch)` → singleton güncelle, watcher başlat, `onThemeChange` tetikle; fail → built-in `dark` fallback. `previewTheme` → geçici, persist etmez, Settings UI'da live preview.
- **Watcher & live reload:** `~/.omp/agent/themes/<current>.json` izlenir (sadece custom), built-in izlenmez. Değişiklik debounced reload; hata/geçici silinmede son başarılı tema korunur. Auto mode ayrıca terminal appearance + `SIGWINCH` + macOS observer ile dark/light slot'u re-evaluate eder.
- **Color-blind mode:** Sadece `toolDiffAdded` HSV ile yeşilden maviye kaydırılır (hex ise).
- **Persist:** `~/.omp/agent/config.yml` → `theme.dark`, `theme.light`, `symbolPreset`, `colorBlindMode`. Eski flat `theme: "name"` → `theme.dark/light`'a luminance'a göre migrate.

### Custom tema iskeleti (docs'tan)
```json
{
  "name": "my-theme",
  "vars": { "accent": "#7aa2f7", "muted": 244 },
  "colors": {
    "accent": "accent", "border": "#4c566a", "borderAccent": "accent", "borderMuted": "muted",
    "success": "#9ece6a", "error": "#f7768e", "warning": "#e0af68", "muted": "muted", "dim": 240, "text": "", "thinkingText": "muted",
    "selectedBg": "#2a2f45", "userMessageBg": "#1f2335", "userMessageText": "", "customMessageBg": "#24283b", "customMessageText": "", "customMessageLabel": "accent",
    "toolPendingBg": "#1f2335", "toolSuccessBg": "#1f2d2a", "toolErrorBg": "#2d1f2a", "toolTitle": "", "toolOutput": "muted",
    "mdHeading": "accent", "mdLink": "accent", "mdLinkUrl": "muted", "mdCode": "#c0caf5", "mdCodeBlock": "#c0caf5", "mdCodeBlockBorder": "muted", "mdQuote": "muted", "mdQuoteBorder": "muted", "mdHr": "muted", "mdListBullet": "accent",
    "toolDiffAdded": "#9ece6a", "toolDiffRemoved": "#f7768e", "toolDiffContext": "muted",
    "syntaxComment": "#565f89", "syntaxKeyword": "#bb9af7", "syntaxFunction": "#7aa2f7", "syntaxVariable": "#c0caf5", "syntaxString": "#9ece6a", "syntaxNumber": "#ff9e64", "syntaxType": "#2ac3de", "syntaxOperator": "#89ddff", "syntaxPunctuation": "#9aa5ce",
    "thinkingOff": 240, "thinkingMinimal": 244, "thinkingLow": "#7aa2f7", "thinkingMedium": "#2ac3de", "thinkingHigh": "#bb9af7", "thinkingXhigh": "#f7768e", "thinkingMax": "#ff007c", "bashMode": "#2ac3de", "pythonMode": "#bb9af7",
    "statusLineBg": "#16161e", "statusLineSep": 240, "statusLineModel": "#bb9af7", "statusLinePath": "#7aa2f7", "statusLineGitClean": "#9ece6a", "statusLineGitDirty": "#e0af68", "statusLineContext": "#2ac3de", "statusLineSpend": "#7dcfff", "statusLineStaged": "#9ece6a", "statusLineDirty": "#e0af68", "statusLineUntracked": "#f7768e", "statusLineOutput": "#c0caf5", "statusLineCost": "#ff9e64", "statusLineSubagents": "#bb9af7"
  }
}
```

> Kaynak: `docs/theme.md` (358 satır), `src/modes/theme/theme.ts`, `src/modes/theme/defaults/` (81 dosya), `src/modes/theme/dark.json` & `light.json`

---

## 4) Görsel Tasarım Dili

### TUI kimliği
- **Stack:** `pi-tui` — differential rendering yapan terminal UI kütüphanesi (React benzeri). Tüm chrome `boxRound` ile yuvarlatılmış köşeler (`╭╮╰╯`), tee/cross junction'lar `boxSharp`'tan (`├┤┬┴┼`), markdown tabloları istisna olarak tam sharp (`┌┐└┘`).
- **Fontlar:** `Geist` (UI) + `JetBrains Mono` (code) — omp.sh head'de Google Fonts preconnect. Terminal'de Nerd Font opsiyonel.
- **Renk paleti:** Titanium teması referans — koyu `brushedTitanium #151820` background, `electricBlue #00b4ff` accent, `readoutGreen #00ff88` success, `alertRed #ff4757` error, `titaniumGold #d4c090` vurgu. Syntax'ta `syntaxComment #6A9955`, `syntaxKeyword #569CD6`, `syntaxFunction #DCDCAA` gibi VS Code benzeri ama daha doygun.
- **Kart sistemi:** Her tool çağrısı compact card olarak akar; `Ctrl+O` ile expand/collapse ile full diff/output görülür. `toolPendingBg` / `toolSuccessBg` / `toolErrorBg` ile durum renklenir. `thinking*` token'ları ile düşünme seviyesi border renk değiştirir (off→minimal→low→medium→high→xhigh→max).
- **Status line:** Alt bar'da `statusLineBg #121212` üzerinde segment'ler: model (mor `#d787af`), path (cyan `#00afaf`), git clean/dirty, context, spend, staged/dirty/untracked, cost, subagents — her biri ayrı token.
- **Markdown:** Başlıklar accent, linkler `#0088fa`, inline code `#e5c1ff`, code block `#9CDCFE`, quote/border muted, hr dim — `getMarkdownTheme()` adaptörü üzerinden.
- **Modlar:** `bashMode` cyan (`#2ac3de`), `pythonMode` mor (`#bb9af7` / `#b281d6`) ile border vurgusu.
- **Semboller:** `unicode` (default) → `╭─○●✓✗⚠⧉` , `nerd` → Nerd Font glyph, `ascii` → `+--+`. `symbols.spinnerFrames` ile 12.5fps status spinner ve 30fps activity spinner override edilebilir; `colorBlindMode` sadece yeşili mavileştirir.
- **Responsive:** Osc11 / COLORFGBG / macOS CoreFoundation FFI ile otomatik dark/light switch; SIGWINCH'te reflow; 256 vs truecolor otomatik.

### Site tasarımı (omp.sh)
- **Vibe:** Siyah (`#000000`) dark-first, minimal, "terminal that stays open" estetiği. Geist + JetBrains Mono, büyük başlık "A coding agent with the IDE wired in", her özellik için poster görsel + clip (dap, ttsr, irc, collab, web).
- **Örnek görsel:** `assets/python.webp` — CSV okuyup chart çizen agent; `lspv.webp` — TypeScript + Biome server aktif; `dap-poster.webp` — lldb frame (`x=57351`); `ttsr-poster.webp` — `Box::leak` kural injection; `collab-poster.webp` — QR kodlu `/collab view`.

> Kaynak: `src/modes/theme/theme.ts`, `src/modes/theme/dark.json`, `titanium.json`, `dark-nord.json`, omp.sh HTML head + asset poster'ları

---

## 5) CLI vs IDE Deneyimi

### CLI (birincil)
OMP **terminal-first**'tır; 4 entry point aynı motoru sarar:

| Mod | Tetik | Giriş | Çıkış | Kullanım |
|-----|-------|-------|-------|----------|
| **Interactive** | `omp` (TTY) | TUI prompt'ta yaz | TUI render | Günlük dev, en zengin |
| **Print (one-shot)** | `omp -p "fix tests"` | stdin/argv tek mesaj | düz metin reply | Script, CI, quick ask |
| **RPC** | `omp --mode rpc` | JSON-RPC over stdio | JSON-RPC events stdout | `cc-connect`, `multica`, IDE plugin'lerin subprocess pattern'i |
| **ACP** | `omp acp` | ACP over stdio | ACP events | Zed editor içinde agent |
| **Collab** | `omp --collab [port]` | WebSocket (protobuf) | HTTP + WS server | Multi-user web (collab-web React 19) |

- **Avantaj CLI:** En düşük latency, en fazla kontrol (slash command, keybinding, queue, thinking, approval), tüm 32 tool düz namespace, `read` ile `pr://1428`, `issue://1234`, `agent://id`, `skill://`, `vault://`, `ssh://`, `conflict://N` gibi 16 internal scheme tek arayüz; `ast_edit` preview-then-accept (`xd://resolve`), `computer` ile host desktop kontrol.
- **Dezavantaj CLI:** Öğrenme eğrisi (vim-keybinding, Ctrl+O, Alt+A Agent Hub), görsel diff'in terminal width ile sınırlı olması.

### IDE
- **Zed (ACP):** Aynı agent, editörün buffer'ını canlı okur, editörün save path ile yazar, editör terminal'inde shell açar. Ayrı plugin/brain yok.
- **VS Code / JetBrains:** Doğrudan eklenti yok (Claude Code'un aksine marketplace paketi yok); `omp --mode rpc` veya `omp acp` üzerinden entegre eden üçüncü parti köprüler ( `cc-connect`, `multica`, `rtk` ) var. `rtk init --agent omp` ile `~/.omp/agent/extensions/rtk.ts`'e hook kurulması gerekir (Pi'nin `~/.pi/agent/extensions`'i OMP'de otomatik yüklenmez).
- **Avantaj IDE:** Dosya ağacında görsel gezinme, editörün kendi LSP/diagnostics'i ile yan yana, click-to-jump.
- **Dezavantaj IDE:** Harness'in hızı (in-process grep/shell) editör köprüsünde biraz kaybolabilir, permission prompt'lar editöre yansıtılır.

### Karşılaştırma özeti (omp.sh/vs)
- **vs Claude Code:** Claude Code tek vendor (Anthropic), `str_replace` edit, debugger yok, bash+print; OMP 40+ provider, hashline (Anthropic'te bile bench üstün), 28-op DAP, schema-validated subagent, `.claude/` config'i ilk turn'de okur. Claude Pro/Max OAuth OMP'de de aynı quota ile çalışır.
- **vs Cursor:** Cursor editör-centric, OMP terminal-centric + ACP ile editöre girer; OMP MIT, Cursor proprietary.
- **vs Codex/Cline/Kilo:** Benzer harness'lar ama OMP Rust core + LSP/DAP/hashline/snapcompact + 23 web_search backend ile "en dolu harness" iddiasında.

> Kaynak: ompomp.sh/vs/claude-code, oh-my-pi-design 05-pi-coding-agent (4 modes, boot sequence), GitHub issues #2194 (rtk omp entegrasyonu), Warp changelog

---

## 6) Özellik Listesi

### Çekirdek (Rust, ~80k LoC)
- 6 crate: `pi-natives` (25k, N-API surface), `pi-shell` (38k, embedded brush bash + 58 coreutils), `pi-walker` (5.2k, ignore-aware parallel walker), `pi-iso` (3.3k, APFS/btrfs/zfs/reflink/overlayfs/projfs/rcopy izolasyon), `pi-ast` (2.9k, tree-sitter + ast-grep), `pi-voice` (1k, Opus/WebRTC)
- `pi-natives` modüller: desktop (10.6k), grep (3.28k), text (2.07k), snapcompact (1.76k), keys (1.74k), ast (1.51k), diff, pty, highlight (syntect, 11 kategori, 30+ alias), appearance (Mode 2031 + macOS FFI), task, file_lock, clipboard (arboard), sixel (SIXEL image render), vb.

### 32 Built-in Tool (62 isim, 32 kavram)
**Files & search (7):** `read` (file/dir/archive/SQLite/PDF/notebook/URL/ssh/internal:// tek path), `write`, `edit` (hashline), `ast_edit` (preview-then-accept, atomik), `ast_grep` (50+ grammar), `grep` (in-process, regex, glob/type filter, fuzzy), `glob`  
**Runtime (2):** `bash` (46 coreutils, PTY, background job), `eval` (persistent Python + Bun JS, prelude paylaşımlı, loopback ile tool re-entry)  
**Code intelligence (3):** `lsp` (14 op), `debug` (28 op, 14 adapter), `security_scan` (Codex Security cloud)  
**Coordination (4):** `task` (subagent fan-out, workspace-isolated, IRC bus), `hub` (live agent mesaj/bekle/iptal), `todo` (ordered todo + phase), `ask` (structured follow-up)  
**Desktop & web (7):** `browser` (Puppeteer, headless/CDP/relay, stealth on), `computer` (host desktop: window/screenshot/input/AX/clipboard), `web_search` (23 provider, structured markdown, sit-aware), `github` (CLI ops), `generate_image` (Gemini/GPT/Grok), `inspect_image` (vision), `tts` (Grok Voice, 5 ses, WAV/MP3)  
**Memory & skills (8):** `checkpoint`/`rewind` (collapse), `retain`/`recall`/`reflect`/`memory_edit` (Hindsight/Mnemopi), `learn`/`manage_skill`  
**Gated (varsayılan kapalı):** `github`, `security_scan`, `generate_image`, `tts`, `checkpoint`, `rewind`, memory (`memory.backend`), `inspect_image` (model can't see ise auto)

### Hashline — content-hash edit
- `line:hash` anchor ile edit; model satır numarası yerine içerik hash'i verir, whitespace savaşı biter, stale-file'da reject-before-corrupt. Grok 4 Fast %61 token düşüşü.

### Subagent & koordinasyon
- `task` → izole worktree, kendi tool yüzey, schema-validated typed yield, `Alt+A` Agent Hub ile canlı transcript/steering/revive/kill. `hub` ile IRC DM, `todo` ile faz takibi.

### Time-Traveling Stream Rules (TTSR)
- Regex dormant, model off-script olduğunda stream mid-token abort, kural system reminder olarak inject, aynı noktadan retry; context tax sıfır, compaction'da survive.

### Memory
- **3 backend:** `off` (default), `local` (rollout summary → `memory_summary.md`), `hindsight` (Hindsight Cloud/self-hosted Docker, `HINDSIGHT_*` env'ler, Vectorize), `mnemopi` (local SQLite + vector/graph). `retain`/`recall`/`reflect`/`memory_edit`/`learn`. Project-scoped.

### Diğer distinctive
- **Snapcompact:** Bitmap-frame raster + PNG (1568×1568 ≈40k char) deterministic on-device compaction, no summarizer model; 4 strateji: shake/handoff/snapcompact/context-full.
- **Plan mode:** `/plan` ile ayrı planning turn, sandboxed planner, onay sonra execute.
- **Advisor role:** İkinci model her turn'ü izler, `aside/concern/blocker` inject eder, ayrı context.
- **Collab:** `/collab` → relay link + QR, `omp join` veya `my.omp.sh` browser; read-write veya `/collab view` read-only; AES-256-GCM E2E, anahtar URL fragment'te, relay görmez.
- **GitHub as filesystem:** `read pr://1428` / `pr://1428/diff/3` / `issue://1234` / `agent://id/findings.0.path` / `conflict://N` / `xd://` device'lar.
- **omp commit:** `git_overview`/`git_file_diff`/`git_hunk` ile atomik topolojik commit split, lock file hariç, source > test > doc öncelik.
- **web_search:** 23 backend (`perplexity`, `gemini`/`anthropic`/`codex`/`xai` oauth, `exa`/`jina`/`kagi`/`tavily`/`firecrawl`/`brave`/`kimi`/`parallel`/`synthetic`/`searxng`/`duckduckgo`/`startpage`/`google`/`ecosia`/`mojeek`/`public`), site-aware extraction (npm/PyPI/crates/MDN/arXiv/StackOverflow/Reddit/HN), link anchor korunur, cite/follow.
- **Provider routing:** 60+ provider, 1000+ model, 10 rol (`default`, `smol`, `slow`, `plan`, `commit`, `vision`, `designer`, `task`, `advisor`, `tiny`), per-role fallback chain, path-scoped `enabledModels`/`disabledProviders`, round-robin credential rotation.
- **Magic keywords:** `ultrathink`/`orchestrate`/`workflowz` — prose'de trigger, code/span/XML içinde değil.
- **Config:** `~/.omp/agent/config.yml` + `.omp/settings.json`, `AGENTS.md` auto-discovery, 8 format inheritance.

> Kaynak: GitHub README "31 tools" tablosu, oh-my-pi-design 32 tools breakdown, EveryDev featured list, `docs/cli.md` (belge içi)

---

## 7) Kurulum ve Kullanım

### Kurulum

**Hızlı (macOS/Linux):**
```sh
curl -fsSL https://omp.sh/install | sh
omp --version
```
**Windows (PowerShell):**
```powershell
irm https://omp.sh/install.ps1 | iex
```
**Homebrew:**
```sh
brew install can1357/tap/omp
```
**Bun (önerilen):**
```sh
bun install -g @oh-my-pi/pi-coding-agent
```
**Nix:**
```sh
nix run github:can1357/oh-my-pi
nix profile install github:can1357/oh-my-pi
# flake: packages.<system>.omp, overlays.default, nixos/homeManagerModules.default
# Home Manager:
# programs.omp = { enable = true; settings.startup.quiet = true; }
```
**mise (pinned):**
```sh
mise use -g github:can1357/oh-my-pi
```
**Alpine/musl:** `apk add libstdc++ libgcc` önce.

**Shell completions (otomatik, live metadata):**
```sh
eval "$(omp completions zsh)"      # zsh ~/.zshrc
eval "$(omp completions bash)"     # bash ~/.bashrc
omp completions fish > ~/.config/fish/completions/omp.fish
# --model/--smol/--slow/--plan model isimleri, --resume session'lar için dinamik
```

### İlk çalıştırma (Quickstart)

```sh
cd path/to/your-project
omp
```
1. **Provider bağla:** Açılış wizard'ında `Sign in` → provider seç → Enter → browser OAuth (Anthropic, OpenAI Codex, Cursor, Copilot, Antigravity, Perplexity ...) veya API key export ( `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY` vb. veya `.env` → `~/.omp/agent/.env` precedence). Birden fazla provider eklenebilir; `omp models` ile doğrula.
2. **Default model seç:** `Choose your default model` → search yaz → provider/model seç → Enter (örn. `anthropic/claude-sonnet-4-20250514`, `openai-codex/gpt-5.5`, `ollama/qwen3`).
3. **Appearance:** Dark (`titanium`) / Light (`light`) preview edip kaydet; `symbolPreset` (unicode/nerd/ascii), `colorBlindMode`.
4. **Prompt:** `Refactor auth middleware to use JWT` yaz → Enter. Agent repo'yu tarar, tool card'lar akar, `Ctrl+O` ile diff/output genişlet, `Esc` ile durdur, follow-up ile düzelt.

### Model & provider routing

```sh
omp --model anthropic/claude-sonnet-4-20250514 "Reply with provider and model ID"
omp --model openai/gpt-5.5
omp --model ollama/llama3.2          # local, OLLAMA_BASE_URL auto-discovery
omp models                             # tüm available
omp models find sonnet
omp models refresh
# Roller: --smol (cheap fan-out), --slow (deep), --plan (planning), Ctrl+P ile cycle
# Custom provider: ~/.omp/agent/models.yml
# providers:
#   spark: { baseUrl: http://192.168.10.223:8000/v1, api: openai-completions, apiKey: MY_KEY, models: [{id: minimax-m3, contextWindow: 100000}] }
```

### Slash command & keybinding (seçme)

| Komut | İş |
|-------|----|
| `/model` | Model picker / `/model provider/id` |
| `/login` , `/login openai-codex` , `/logout` | OAuth/API key akışı |
| `/review` | P0-P3 scored review + verdict (branch/commit/uncommitted) |
| `/plan` | Planning turn (sandboxed) |
| `/collab`, `/collab view`, `omp join <link>` | Live share (relay + QR) |
| `/advisor` | İkinci model reviewer |
| `/vibe`, `/fresh` | Vibe mode, stream reset |
| `/settings` | Appearance, Memory, Provider, vb. |
| `Ctrl+O` | Card expand/collapse |
| `Ctrl+P` | Aynı rolde model cycle |
| `Alt+A` | Agent Hub (subagent roster) |
| `Esc` | Stop turn |

### Session yönetimi

```sh
omp --continue        # son session resume (aynı proje)
omp --resume          # recent list'ten seç
omp --resume <id>     # spesifik
# İçerde: branch (what-if), fork, export (json/html/md), merge (swarm), checkpoint/rewind
```

### Tema değiştirme

```sh
# Settings UI: Appearance → Dark Theme / Light Theme → preview → save
# Veya config.yml:
theme:
  dark: titanium
  light: light
symbolPreset: nerd
colorBlindMode: false
# Custom tema: ~/.omp/agent/themes/my-theme.json oluştur (tüm 67 token + optional), otomatik watcher reload
```

### Kaynakça (en az 5, detaylı scrape edilenler)

1. **omp.sh** — https://omp.sh/ (SPA, curl ile head + JS bundle parse edildi; meta, OG, JSON-LD, asset poster'ları) — slogan, kurulum komutları, özellik poster'ları (python/lsp/dap/ttsr/irc/collab/web), fontlar, install script
2. **GitHub can1357/oh-my-pi README** — https://github.com/can1357/oh-my-pi (699 satır, 28.5k star, 20.564 commit, 80k Rust LoC, tool benchmark tablosu, 21 maddelik özellik anlatımı, kurulum matriksi) — ana scrape kaynağı, omp.sh içeriğinin düz metni
3. **docs/theme.md** — https://github.com/can1357/oh-my-pi/blob/main/docs/theme.md (358 satır, 12.1KB) — tema şeması, token listesi, var resolution, color mode, watcher, custom skeleton
4. **EveryDev omp page** — https://www.everydev.ai/tools/omp-oh-my-pi — 40+ provider, 32 tool, Rust crate breakdown, Hindsight/mnemopi, collab E2E, web_search 23 backend özeti
5. **oh-my-pi Design 05-pi-coding-agent** — https://yeluo45.github.io/oh-my-pi-design/en/docs/05-pi-coding-agent — CLI mimarisi, 6 sub-system, 4 mod, boot sequence, 62 tool ismi → 32 kavram, autoresearch, capability/async/auto-thinking, session manager
6. **docs/lsp-config.md** — https://github.com/can1357/oh-my-pi/blob/main/docs/lsp-config.md — LSP 53 server, rootMarkers, auto-detection, config merge order, idleTimeout
7. **omp.sh vs Claude Code** — https://omp.sh/vs/claude-code — honest comparison, hashline bench, DAP farkı, OAuth Pro/Max reuse

---

## Lokma İçin Çıkarımlar

- **Tema sistemi doğrudan port edilebilir:** JSON schema (`theme-schema.json`) + `vars` resolver + ANSI converter (truecolor/256) + `theme.dark/light` + `symbolPreset` + file watcher pattern'i Lokma'da birebir kullanılabilir. 67 zorunlu token listesi ve `boxRound/boxSharp` ayrımı korunmalı.
- **Varsayılan tema:** `titanium` dark (electricBlue + brushedTitanium) Lokma için de güçlü default; `light` light slot.
- **CLI vs IDE:** Lokma harness CLI-first kalmalı, RPC (`--mode rpc`) ve ACP için ince adaptör eklemek yeterli; Zed dışında editör entegrasyonu için `cc-connect`/`multica` pattern'i örnek.
- **Felsefe sinyali:** "The harness problem" — Lokma'nın vaadi de model değil harness olmalı; hashline gibi edit formatı ve LSP/DAP derhal yol haritasına alınmalı.

---

*Bu dosya otomatik scrape + manuel sentez ile oluşturulmuştur. omp.sh SPA olduğundan içerik GitHub README + JS bundle + docs üzerinden doğrulanmıştır. Tema token sayıları `docs/theme.md` ve `src/modes/theme/*.json` ile çapraz kontrol edilmiştir.*
