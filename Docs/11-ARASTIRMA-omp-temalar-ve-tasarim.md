# OMP (Oh My Pi) — Tema & Tasarım Analizi

> **Lokma'da "omp gibi temalar" ne demek, nasıl yapılır?**
> Kaynak: `https://omp.sh`, `https://github.com/can1357/oh-my-pi` (28.5k ⭐, 80k Rust core)
> Tarih: 2026-08-31

---

## 1. OMP Nedir? Özet

**OMP = Oh My Pi**, `https://omp.sh` — **"A coding agent with the IDE wired in."**

- **Fork:** Mario Zechner'ın `Pi` projesinin fork'u, üzerine Can Bölük (Stencil Labs) 80k satır Rust core eklemiş.
- **Felsefe:** "The most capable agent surface that ships. Continuously tuned by real-world use — complete out of the box, open all the way down."
- **Stack:** TypeScript (CLI/SDK) + Rust (core, ~80k LOC) + Bun runtime. `brush` shell (bash fork), `pi-walker`, `pi-ast`, `pi-natives` N-API.
- **Paket:** `bun install -g @oh-my-pi/pi-coding-agent` → `omp` komutu
- **Lisans:** MIT

**Farkı Claude Code'dan:**
- Claude Code = Anthropic API'ye kilitli, tek provider
- OMP = **60+ provider** (Anthropic, OpenAI, Google, DeepSeek, Qwen, xAI, Moonshot, Groq, Cerebras, Ollama, vLLM, HuggingFace, Bedrock... hepsi)
- Rust core → Windows-native, WSL yok, ripgrep/glob/bash in-process (fork/exec yok)

---

## 2. "OMP Gibi Temalar" — Ne Demek?

Kullanıcı "omp gibi temalar olacak" dediğinde kastı:

### a) Terminal Tema Sistemi
OMP ve Pi fork'ları **TUI theme** destekler. Claude Code docs'unda da var: *"custom color themes you can build and ship in plugins"* (Week 17 changelog).

**Nasıl çalışır:**
- Theme = renk paleti + stil token'ları JSON/TOML dosyası
- CLI render ederken `pi-tui` (React-like TUI lib) theme token'larını kullanır
- Örnek token'lar: `background`, `foreground`, `accent`, `border`, `success`, `warning`, `error`, `muted`, `selection`
- Claude Code'da 2.1.17+ ile plugin içinde theme ship edilebilir
- OMP'de `~/.config/omp/theme.json` veya `settings.json` içinde `theme` alanı

**Lokma için Tema Sistemi Tasarımı:**

```
lokma themes/
├── default.json      # Krem #FAF9F5 + Terracotta #C96442 (Claude renkleri)
├── dark.json         # Warm dark #211F1D + #D97B57
├── omp.json          # OMP-inspired: koyu terminal, neon accent
├── catppuccin.json   # Popüler community theme
└── dracula.json      # Klasik
```

Her tema dosyası:
```json
{
  "name": "omp",
  "displayName": "OMP Dark",
  "colors": {
    "background": "#0a0a0f",
    "foreground": "#e4e4e7",
    "accent": "#6366f1",
    "border": "#27272a",
    "success": "#10b981",
    "warning": "#f59e0b",
    "error": "#ef4444",
    "muted": "#71717a",
    "selection": "#3f3f46"
  },
  "tui": {
    "headerBg": "#18181b",
    "codeBlockBg": "#1c1c1f",
    "diffAdd": "#10b98122",
    "diffRemove": "#ef444422"
  }
}
```

CLI'da: `lokma theme list` → `lokma theme set omp` → `lokma theme preview`

### b) Web Harness Tema Sistemi
Web'de aynı token'lar CSS variables olarak:

```css
:root[data-theme="omp"] {
  --bg: #0a0a0f;
  --fg: #e4e4e7;
  --accent: #6366f1;
  --border: #27272a;
}
:root[data-theme="claude"] {
  --bg: #FAF9F5;
  --fg: #262624;
  --accent: #C96442;
}
```

- `localStorage: lokma-theme`
- `<html data-theme="omp">` toggle
- Tailwind `@theme` ile map

### c) OMP Görsel Dili — İlham Alınacak Noktalar

**OMP Sitesi (omp.sh) Tasarımı:**
- **Koyu, terminal-first:** Siyah/near-black background, monospaced font, grid çizgileri
- **Hero:** Büyük başlık + tek satır install komutu (`curl -fsSL https://omp.sh/install | sh` + copy butonu)
- **Provider grid:** 30+ provider logosu tek satırda (Meta, DeepSeek, Qwen, Google, OpenAI, Anthropic...)
- **Feature bölümleri:** Numaralı (01-12), her biri bir GIF/capture ile, teknik detay + benchmark
- **"benchmaxxed" vurgusu:** Her tool için metrik tablosu (Grok 6.7%→68.3%, -61% tokens)
- **Minimal, hızlı, Japon minimalizmi hissi**

**Claude Code Sitesi:** Daha kurumsal, açık renk, docs-heavy

**Lokma için Karışım:**
- CLI: OMP'nin koyu terminal estetiği + Claude'un krem/terracotta light teması (kullanıcı seçer)
- Web: OMP'nin grid/capture layout'u + Claude'un docs yapısı
- Tema sayısı başlangıçta 3-4, sonra community theme desteği

---

## 3. OMP'nin Öne Çıkan Teknik Özellikleri (Lokma'ya İlham)

| # | Özellik | Ne Yapar | Lokma'da? |
|---|---------|----------|-----------|
| 01 | Code execution w/ tool-calling | Python + Bun worker, tool'ları loopback bridge üzerinden çağırır | ✅ Python REPL + Node worker |
| 02 | LSP wired into every write | `workspace/willRenameFiles` → rename re-export/barrel'i günceller | ✅ LSP client |
| 03 | Real debugger (lldb/dlv/debugpy) | Segfault'ta attach, frame oku | 🔜 Sonra |
| 04 | Time-traveling stream rules | Regex match → stream abort + system reminder inject, compaction'da survive eder | ✅ Stream interceptor |
| 05 | First-class subagents (task) | Isolated worktree, typed result (schema-validated) | ✅ Agent tool |
| 06 | Advisor model (second model) | Her turn'ü izleyen reviewer, inline note inject eder | ✅ `--advisor` flag |
| 07 | Live collab (/collab + QR) | Relay üzerinden read-write/view sharing, E2E sealed | 🔜 Web harness'te |
| 08 | Web fetch + PDF | 23 provider search → structured markdown | ✅ WebFetch/WebSearch |
| 09 | Native Rust core | ripgrep/glob/brush in-process, zero fork | 🔜 Rust portu sonra, önce Node |
| 10 | P0-P3 code review | Multi-agent parallel review, verdict + ranked issues | ✅ /review |
| 11 | Hashline edit | Content hash anchoring, -61% tokens | ✅ Edit tool'da hashline |
| 12 | GitHub as filesystem | Issue/PR direkt tool üzerinden | ✅ GitHub MCP |

**Paket Yapısı (OMP monorepo — Lokma için referans):**
```
packages/
├── pi-coding-agent  → CLI + SDK (lokma → lokma-cli)
├── pi-agent-core    → Agent runtime (lokma-core)
├── pi-ai            → Multi-provider LLM client
├── pi-tui           → Terminal UI (Ink benzeri)
├── pi-natives       → Rust N-API (grep/shell/image)
└── collab-web       → Browser guest + relay
crates/
├── pi-shell, pi-ast, pi-walker, brush-core, pi-builtins
```

Lokma'da ilk faz Node-only (Rust yok), sonra `pi-natives` benzeri native modüller eklenebilir.

---

## 4. OMP Tema Dosyası — Gerçek Örnek

`docs/theme.md` ve kaynak koddan çıkarılan theme contract:

```ts
// packages/coding-agent/src/config/theme.ts (tahmini)
interface Theme {
  name: string
  colors: {
    primary: string
    secondary: string
    background: string
    foreground: string
    muted: string
    border: string
    success: string
    error: string
    warning: string
    info: string
  }
  tui: {
    prompt: string      // kullanıcı prompt rengi
    assistant: string   // assistant response rengi
    tool: string        // tool call rengi
    diff: { add, remove, context }
    spinner: string
  }
}
```

**OMP'de tema değişimi:** `~/.config/omp/settings.json` → `"theme": "catppuccin"` veya CLI flag `--theme`

---

## 5. Lokma Tema Kararı

**Başlangıçta 4 tema ship edilecek:**

1. **claude** — Krem #FAF9F5 + Terracotta #C96442 + Ink #262624 (light, default — kullanıcı seviyor)
2. **omp** — Near-black #0a0a0f + Indigo #6366f1 + Zinc (dark, OMP inspired)
3. **midnight** — Saf dark #09090b + Violet (OLED)
4. **paper** — Saf light, minimal, yüksek kontrast (gündüz okuma)

**Sonrası:** `lokma theme create <name>` ile custom, `lokma theme publish` ile marketplace (ileride).

Her tema hem CLI (Ink/Chalk) hem Web (CSS vars) için aynı token'ları kullanır — tek kaynak `themes/<name>.json`.

---

*Sonraki: `12-HARNESS-MIMARI-cli-web.md` — harness nasıl inşa edilir*
