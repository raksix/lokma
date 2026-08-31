# Testing — Autonomous Harness (TestSprite-Inspired, but Better & Self-Hosted)

> **Inspired by:** [TestSprite](https://www.testsprite.com) (`docs.testsprite.com/llms.txt` · `llms-full.txt`) — AI E2E tester that turns a PRD/URL into Playwright tests with video
> **Lokma's edge:** Not a TestSprite clone — **independent, open-source, self-hosted, skills-integrated, cost-transparent, privacy-preserving**. Same job, better fit for a harness.
> **Raw:** `raw/40-testsprite-ham-arastirma.md` (655 lines) · `raw/41-lokma-test-ui-security-ham-arastirma.md` (1,136 lines)
> **Companion:** `23-PLUGIN-SYSTEM-deepseek-cordis.md` · `24-WEB-PANE-SYSTEM-and-orchestration.md` · `26-CONFIG-and-CREDENTIALS.md` · skill `llm-e2e-testing` (6-stage pipeline)
> **Owner ask (verbatim):** *"ajan gidip lokma içindeki skillerle test edilecek, UI'da detaylı görünecek — testin videosu, raporu, roadmap plan çıkarma, frontend tüm butonlar expect ve sonuç, API testleri, Shannon + güvenlik"*

---

## 1. What TestSprite Does (and Where Lokma Improves)

| Capability | TestSprite | Lokma Autonomous Harness |
|------------|------------|--------------------------|
| **Trigger** | Web portal — paste PRD/URL → cloud run | **Skill + CLI + Web pane** — `test_app` skill, `lokma test` CLI, or `Test Lab` web pane — all optional, same engine |
| **Plan** | Feature map → test plan (LLM) | **Roadmap plan extraction** before any test: PRD/routes/Docs → `plan.json` (feature map + per-route element inventory) — enumerated, auditable |
| **Element coverage** | Every button/link/input → one test each | Same — **inventory guarantee**: every interactive element gets an `expect` (see §4) |
| **Codegen** | Playwright `.spec.ts` | Playwright `.spec.cjs` (`type:module` safe, `video:"on"` + `trace:"on"` + `screenshot:"only-on-failure"`) |
| **Execution** | Cloud sandbox | **Local sandbox pool** — headless Chromium (Playwright `chromium` channel), configurable concurrency |
| **Video** | Per-test video | Per-test **`.webm` + `trace.zip`** — inline `<video>` + Trace Viewer |
| **Report** | Portal report (expect vs actual, pass/fail) | **Rich report**: expect vs actual · steps · console errors · network log · before/after screenshots · duration · LLM classify reason · cost |
| **Classify** | LLM judge + asserts | **Deterministic asserts + LLM judge** — `expect` is code, judge explains *why* |
| **Auto-heal** | Rewrites failing test, re-runs | Same — **one auto-heal retry** per failing test (rewrite once, re-run) |
| **Security** | Not a focus | **Shannon + Lokma Security Suite** (secret scan, CSP/CORS, auth/IDOR, prompt injection) — see §6 |
| **API tests** | Limited | **First-class** — happy + auth + validation + rate-limit + security (see §5) |
| **Cost** | Cloud credits | **Transparent** — tokens + USD per test, `TokenLedger` by `agentId` (see `30-AGENT-SYSTEM`) |
| **Privacy** | Code → cloud | **Local** — `.webm`/`trace.zip` stay on disk (`~/.lokma/test-runs/<id>/`) unless you export |
| **Open source** | Closed | **Open** — harness code + skill + pipeline are part of Lokma |

---

## 2. Overall Loop (6 Stages — Mirrors TestSprite, Adapted)

```
Stage 1 — Feature Map
  PRD / Docs / routes / OpenAPI → LLM → featureMap.json
  { features: [{ id, title, routes: ["/", "/panel"], apis: ["GET /api/me"] }] }

Stage 2 — Element Inventory (the guarantee)
  For each route: crawl via CDP/Playwright → every button/link/input/select/textarea
  → inventory.json: [{ route, selector, role, label, expect }]
  Example expect: { selector: "button:has-text('Save')", expect: "click → toast 'Saved' and no 500" }

Stage 3 — Playwright Codegen
  inventory + featureMap → LLM → tests/*.spec.cjs
  Template: page.goto → locator.click → expect(...).toBeVisible / toHaveURL / network idle

Stage 4 — Sandbox Exec
  Pool of headless Chromium (concurrency = min(maxConcurrent, inventory.length))
  Each test isolated: fresh context, video:"on", trace:"on", console+network capture

Stage 5 — Classify
  Deterministic asserts first → if ambiguous, LLM judge (expect vs actual + screenshot + console)
  → { pass, failReason, evidence: { screenshot, consoleErrors, network } }

Stage 6 — Auto-Heal (optional, one retry)
  For each failing test: LLM rewrites the spec once (fix selector / wait / assert) → re-run
  → final verdict; never loops forever
```

**Two-phase UX:** **Plan** (stages 1–2, produces `plan.json` + human-reviewable test list) → **Exec** (stages 3–6, produces videos + report). User can approve the plan before exec.

---

## 3. Roadmap Plan Before Testing (Stage 1–2 Detail)

Before any browser launches, Lokma extracts an **auditable test plan**:

**Feature map table:**

| Feature | Routes | Elements | APIs |
|---------|--------|----------|------|
| Auth | `/login`, `/panel` | 8 buttons, 2 forms | `POST /api/login`, `GET /api/me` |
| Dashboard | `/panel` | 12 cards, 3 filters | `GET /api/stats` |

**Element inventory (per route, every interactive element):**

| Route | Selector | Role | Label | Expect |
|-------|----------|------|-------|--------|
| `/` | `a:has-text('Get started')` | link | Get started | `click → nav to /panel, 200` |
| `/panel` | `button:has-text('Save')` | button | Save | `click → toast 'Saved', no 500, row persists` |
| `/panel` | `select[name='status']` | select | Status | `select 'Done' → row status updates` |

**API inventory (from OpenAPI / route scan / `server.js`):**

| Endpoint | Method | Auth | Tests |
|----------|--------|------|-------|
| `POST /api/login` | POST | none | happy (200) + wrong pass (401) + missing field (400) + rate-limit (429) |
| `GET /api/me` | GET | cookie | with cookie (200) + without (401) + expired (401) |

Plan is saved as `plan.json` and rendered in the Web pane as a reviewable table before the user clicks **Run**.

---

## 4. Frontend Element Coverage (Every Button Gets an Expect)

**Inventory guarantee:** The crawler (Playwright `page.$$ eval` + accessibility tree) enumerates **every** interactive element per route:

- `button`, `a[href]`, `input`, `select`, `textarea`, `[role=button]`, `[onclick]`
- Each gets a **stable selector** (prefer `data-testid` → `role+name` → `text` → `nth`)

**Expect definition** (LLM drafts, deterministic asserts enforce):

```js
// Example generated spec (simplified)
test('panel — Save button', async ({ page }) => {
  await page.goto('/panel');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.toast.error')).toHaveCount(0);
});
```

**Result per element:**

| Field | Meaning |
|-------|---------|
| `expect` | Human-readable intent (what should happen) |
| `actual` | What happened (pass/fail + evidence) |
| `evidence` | Screenshot before/after, console errors, network log, duration |
| `classifyReason` | LLM judge's one-line why (if used) |

---

## 5. API Tests

Auto-generated from OpenAPI / route table (no manual spec needed):

- **Happy:** valid payload → `2xx` + schema matches Zod/OpenAPI
- **Auth:** missing/invalid/expired credential → `401`/`403`
- **Validation:** missing required field, wrong type, out-of-range → `400` with error shape
- **Rate-limit:** burst → `429` (if route has limiter)
- **Security:** IDOR probe (swap `userId`), CORS preflight, auth bypass (see §6)

Each API test is a plain `fetch` (or `supertest` if `server.js` is local) with `expect(status)` + `expect(json)`; failures include request/response dump.

---

## 6. Security — Shannon-Style + Lokma Suite

### 6.1 Shannon Secret Scan

Entropy + pattern scan over **bundle + `.env` + `~/.lokma/credentials.json` references**:

- High-entropy strings in `dist/*.js` / `.next/static` (potential leaked `apiKey`)
- `.env` committed? (`git ls-files | grep .env`)
- `GET /api/config` leaks key? (probe — should return `keySet: true`, never the key)
- `credentials.json` permissions `0600`? (`stat -c %a`)

This is the same class as `detect-secrets` / `gitleaks` Shannon entropy.

### 6.2 Lokma Security Suite (Runs as Optional Test Phase)

| Check | Probe |
|-------|-------|
| **Secret in bundle** | Build → grep `dist/` for `sk-` / `AKIA` / long base64 — fail if found |
| **CORS** | `OPTIONS` preflight from foreign origin → should not return `*` with credentials |
| **CSP** | `Content-Security-Policy` header present? `unsafe-inline` without nonce? |
| **Auth bypass** | `GET /api/me` without cookie → must be `401`, not `200` |
| **IDOR** | `GET /api/resource/:id` with another user's `id` → must be `403`/`404`, not `200` |
| **Prompt injection** | Submit `Ignore previous instructions` via every `input`/`textarea` → classify if agent repeats it |
| **Rate-limit** | Burst `N` requests → `429` after threshold |
| **Dependency audit** | `npm audit` / `osv-scanner` — high/critical CVEs fail |

All are **opt-in** (checkbox in `lokma test --security` or Web pane toggle) — they run as extra tests in the same report.

---

## 7. Video, Trace, Report (What You Get)

### 7.1 Per-Test Artifacts

```
~/.lokma/test-runs/<runId>/
  plan.json               # feature map + inventories (stages 1–2)
  tests/
    panel-save.spec.cjs
    login-form.spec.cjs
  videos/
    panel-save.webm       # Playwright video:"on" — full run
    login-form.webm
  traces/
    panel-save.zip        # trace:"on" — open in https://trace.playwright.dev
  screenshots/
    panel-save-before.png
    panel-save-after.png
  report.json             # machine-readable (see below)
  report.html             # human report (self-contained)
  junit.xml               # CI-friendly
```

### 7.2 Report Shape (`report.json`)

```json
{
  "runId": "20260831_0226_abc123",
  "plan": { "features": 4, "elements": 47, "apis": 12 },
  "summary": { "total": 59, "pass": 52, "fail": 7, "durationMs": 34000, "cost": { "tokens": 42000, "usd": 0.12 } },
  "tests": [{
    "id": "panel-save",
    "title": "panel — Save button",
    "status": "pass",
    "durationMs": 2100,
    "expect": "click → toast 'Saved' and no 500",
    "actual": "toast appeared in 800ms, status 200",
    "evidence": { "video": "videos/panel-save.webm", "trace": "traces/panel-save.zip", "consoleErrors": [], "network": [{ "url": "/api/save", "status": 200 }] },
    "classifyReason": "deterministic assert passed"
  }],
  "security": { "shannon": { "findings": [] }, "suite": { "csp": "pass", "cors": "pass", "idor": "fail — GET /api/user/2 returned 200 for user 1" } }
}
```

### 7.3 Web Pane — Test Lab

```
┌─ Test Lab ──────────────────────────────────────┐
│ [Plan] [Run] [Report] [Security]                │
│ Plan tab: feature map table + element list +    │
│           API list — [Approve & Run]            │
│ Run tab:  live progress (pass/fail per test),   │
│           streaming logs, concurrency bar        │
│ Report tab: summary (52/59 pass) + per-test     │
│           row: title · status · duration ·      │
│           [Video] [Trace] [Screenshots]         │
│           expect vs actual + classify reason    │
│ Security tab: Shannon findings + suite checks   │
│           (each with evidence + fix hint)       │
└─────────────────────────────────────────────────┘
```

Videos play inline (`<video src="videos/panel-save.webm">`); traces open via `trace.playwright.dev` or local viewer. `report.html` is self-contained (no server needed) for sharing.

---

## 8. CLI & Skill

```bash
lokma test                    # interactive: pick target (current project), plan → exec
lokma test --plan-only        # only produce plan.json, no browser
lokma test --run <runId>      # re-run a previous plan
lokma test --security         # include Shannon + security suite
lokma test --open             # open latest report.html
```

**Skill `test_app`** (agent-callable, same engine):

```
test_app { target: ".", includeSecurity: false, planOnly: false }
→ { runId, plan, report, cost }
```

Agent can call `test_app` mid-task: build a feature → `test_app` → read `report.json` → fix failures → loop. This is the **harness-level** equivalent of TestSprite's portal, but the agent drives it.

---

## 9. Cost & Concurrency

- **Concurrency:** `min(maxConcurrent, elementCount)` — reuses `30-AGENT-SYSTEM` `maxConcurrent` (default 5) for the Chromium pool; override via `lokma test --concurrency 8`
- **Cost:** LLM calls for feature map + inventory expects + codegen + classify are metered via `TokenLedger` (`agentId: "test-harness"`), surfaced in the report (`tokens`, `usd`)
- **Isolation:** Each test gets a fresh `browserContext` (no cookie leak); `video` + `trace` are per-context

---

## 10. Non-Goals

- No cloud dependency — runs fully offline (only LLM calls need a provider).
- No Mermaid/screenshot-only asserts — every `expect` is code that can fail deterministically.
- No secret exfiltration — `credentials.json` is never read by the test harness; `GET /api/config` is probed, not dumped.

---

## 11. References

- TestSprite: https://www.testsprite.com · https://docs.testsprite.com/llms.txt
- Hermes loop: `loop-engineering` skill + `hermes-harness` (`scaffold-loop.sh`)
- Lokma testing skill (prior art): `llm-e2e-testing` (6-stage: feature map → inventory → codegen → sandbox → classify → heal) — `~/.hermes/skills/software-development/llm-e2e-testing/SKILL.md`
- Lokma agents/budgets: `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md`
- Lokma config/secrets: `26-CONFIG-and-CREDENTIALS.md`
