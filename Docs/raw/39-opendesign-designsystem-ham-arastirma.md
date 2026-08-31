# Open Design — Design Systems & Canvas Patterns: Raw Research for Lokma

> **Purpose:** English-language raw research dossier (500+ lines) for Lokma — how Open Design (nexu-io/open-design) organizes **DESIGN.md**, **design-systems/**, **design-templates/**, **Studio**, **Canvas & rendering**, and **Figma-alternative positioning**, plus concrete guidance on what Lokma should copy. All URLs cited inline; file content extracted 2026-08-31.
> **Primary sources:** `nexu-io/open-design` repo and docs, `VoltAgent/awesome-design-md`, `op7418/guizang-ppt-skill`, `opendesigner.io` blog + catalog, `craft/` + `design-systems/_schema/` contracts.
> **Style:** Raw research — dense, sourced, copy-pasteable for Lokma Docs.

---

## Table of Contents

1. [DESIGN.md schema — 9-section historical baseline vs current 7+ H2 rule](#1-designmd-schema--9-section-historical-baseline-vs-current-7-h2-rule)
2. [The 9 sections in detail (with OKLch, typography, spacing, layout, components, motion, voice, brand, anti-patterns)](#2-the-9-sections-in-detail)
3. [5-dimensional critique — huashu-design influence & OD's self-critique loop](#3-5-dimensional-critique--huashu-design-influence--ods-self-critique-loop)
4. [design-systems/ — brand-grade system packages (151 packages, manifest + tokens.css)](#4-design-systems--brand-grade-system-packages)
5. [design-templates/ — guizang-ppt, html-ppt, dating-web & the template registry](#5-design-templates--guizang-ppt-html-ppt-dating-web--the-template-registry)
6. [Studio pages — Home → Plugins → Design System → Studio (6 artifact types, conversation+files+preview)](#6-studio-pages--home--plugins--design-system--studio)
7. [Canvas & rendering — sandboxed iframe preview, real CSS/fonts/components, live agent streaming, critique loop](#7-canvas--rendering--sandboxed-iframe-preview-real-cssfontscomponents-live-agent-streaming-critique-loop)
8. [Figma-alternative positioning — push pixels vs single-page artifacts with DESIGN.md brand contract](#8-figma-alternative-positioning--push-pixels-vs-single-page-artifacts-with-designmd-brand-contract)
9. [How Lokma should copy — DESIGN.md per project, themes/*.json → DESIGN.md tokens, Studio-like pane](#9-how-lokma-should-copy--designmd-per-project-themesjson--designmd-tokens-studio-like-pane)
10. [Appendix — file tree, key routes, package manifests, references & URLs](#10-appendix--file-tree-key-routes-package-manifests-references--urls)

---

## 1. DESIGN.md schema — 9-section historical baseline vs current 7+ H2 rule

### 1.1 Historical baseline: VoltAgent/awesome-design-md → Google Stitch → OD spec.md

The canonical 9-section schema originates outside OD, in the **Google Stitch DESIGN.md specification** popularized by **VoltAgent/awesome-design-md**:

- **VoltAgent/awesome-design-md** (73+ curated ported systems at time of VoltAgent README) describes itself as: *"A collection of DESIGN.md files analysis by popular brand design systems. Drop one into your project and let coding agents generate a matching UI."* Every file there follows *the [Stitch DESIGN.md format](https://stitch.withgoogle.com/docs/design-md/specification/) with extended sections* — see the 9-row table reproduced in that repo's README. Source: https://github.com/VoltAgent/awesome-design-md and https://github.com/VoltAgent/awesome-design-md?tab=readme-ov-file
- The extended 9-section table from that README (the historical baseline OD inherited):

| # | Section | What it captures |
|---|---------|-----------------|
| 1 | Visual Theme & Atmosphere | Mood, density, design philosophy |
| 2 | Color Palette & Roles | Semantic name + hex + functional role |
| 3 | Typography Rules | Font families, full hierarchy table |
| 4 | Component Stylings | Buttons, cards, inputs, navigation with states |
| 5 | Layout Principles | Spacing scale, grid, whitespace philosophy |
| 6 | Depth & Elevation | Shadow system, surface hierarchy |
| 7 | Do's and Don'ts | Design guardrails and anti-patterns |
| 8 | Responsive Behavior | Breakpoints, touch targets, collapsing strategy |
| 9 | Agent Prompt Guide | Quick color reference, ready-to-use prompts |

  Source: https://github.com/VoltAgent/awesome-design-md (README section "What's Inside Each DESIGN.md")

- **Stitch specification layer:** VoltAgent's `design-md` companion notes the idea was popularized by Google Stitch where *"a markdown-based design description can guide UI generation without requiring a Figma plugin, a proprietary token format, or a giant prompt"* — frontmatter carries YAML tokens (colors, typography, spacing, radii) plus markdown prose explaining intent. Source: https://github.com/VoltAgent/design-md and https://stitch.withgoogle.com/docs/design-md/specification/ + https://stitch.withgoogle.com/docs/design-md/overview/ (linked from VoltAgent READMEs)
- **OD spec.md crystallizes the bet:** In the archived `docs/spec.md`, OD lists as Bet #4: *"How design systems are authored — `DESIGN.md` files following the [awesome-claude-design][acd] 9-section schema"* — reproduced verbatim in the Product bets table. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/spec.md

Additional historical framing from VoltAgent:

- File purpose table in awesome-design-md: `DESIGN.md` = the design system (what agents read), `preview.html` = visual catalog (color swatches, type scale, buttons, cards), `preview-dark.html` = same catalog with dark surfaces. Each site in the collection ships these three files. Source: https://github.com/VoltAgent/awesome-design-md
- Naming distinction: `AGENTS.md` (how to build the project) vs `DESIGN.md` (how the project should look and feel). This framing is reused throughout OD docs. Source: https://github.com/VoltAgent/awesome-design-md and https://github.com/VoltAgent/official-design-md
- Freshness note from that lineage: the 9-section extended version *"adds sections 7–9 beyond what Stitch originally specified"* — Stitch core was 6 sections; VoltAgent/awesome-design-md extends to 9 (Depth & Elevation, Do's and Don'ts, Responsive Behavior, Agent Prompt Guide). Earlier collection files may lack full 9-section compliance. Source: https://langlabs.io/VoltAgent/awesome-design-md (paraphrases the README evolution)

### 1.2 Current OD reality: the 9-section baseline is archived guidance, not a hard schema guard

OD has deliberately **relaxed** the historical 9-section schema in its authoring guide. This is the single most important drift for Lokma to understand:

- `docs/design-systems.md` states plainly: *"`DESIGN.md` explains intent, decisions, and usage to an agent. It is not a fixed nine-section numbered schema. For a migrated package, the quality guard requires at least seven H2 headings (`## ...`); it does not require specific numbers, titles, or ordering."* Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md
- `design-systems/README.md` repeats it: *"`DESIGN.md` does not use a fixed nine-section template. The package-quality guard requires at least seven substantive H2 headings for migrated packages, without prescribing their names, order, or numbering."* Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md
- Recommended coverage (not enforced ordering) for a useful migrated package — listed in `docs/design-systems.md` §3:

  1. visual theme and atmosphere
  2. color roles and contrast intent
  3. typography families, scale, leading, and tracking
  4. spacing, layout, and composition
  5. components and interaction states
  6. motion behavior and reduced-motion handling
  7. accessibility expectations
  8. concrete anti-patterns

  A source-derived brand may add provenance, imagery, data visualization, editorial voice, or platform-specific sections. The guide explicitly warns: *"Avoid empty headings added only to meet the count."* Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md
- Metadata precedence is now manifest-first, not markdown-heading-first. Title/category/summary resolution: `manifest.json` (or user `metadata.json` override) outranks legacy `H1` + `> Category:` conventions from the VoltAgent era. Those markdown conventions remain only as fallback for legacy/user folders. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §2 and https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md
- OD's blog still teaches the 9-section schema as the **editorial canon** — it is the pedagogical ordering that makes any DS legible — but the repository guard does not enforce fixed numbers/titles. The blog series is the place Lokma should steal the narrative form, even though the repo guard is more permissive. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems

### 1.3 Why the drift matters for Lokma

- Copy the **prose-rich 9-section story** for authoring new DESIGN.md files (humans + agents both read it), but validate for the **7+ substantive H2** bar rather than demanding `## 1.` … `## 9.` numbering. This is how OD keeps legacy VoltAgent systems shippable without forcing rewrites.
- Treat VoltAgent's `preview.html`/`preview-dark.html` pattern as the precursor to OD's richer `preview/` + `components.html` + `components.manifest.json` + `design-tokens.json` + `tailwind-v4.css` derived artifacts — OD replaced two-file previews with a richer package contract. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §1 + https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md §Rich package files

---

## 2. The 9 sections in detail

The section descriptions below synthesize three overlapping sources: the VoltAgent 9-row table (historical), OD's `opendesigner.io/blog/design-md-9-section-schema-explained` deep dive, and OD's `opendesigner.io/design-systems` catalog page. Where wording differs, the blog's OD-specific phrasing is privileged for Lokma reuse.

### 2.1 Section 1 — Color (VoltAgent: "Visual Theme & Atmosphere" / "Color Palette & Roles" → OD: "Color")

- **VoltAgent wording:** Visual Theme & Atmosphere (mood, density, philosophy) + Color Palette & Roles (semantic name | hex | role table). Source: https://github.com/VoltAgent/awesome-design-md
- **OD wording:** OKLch palette with semantic role names — primary, surface, body, accent, success, danger. Always paired with at least two contrast-rated text-on-background combinations. OKLch (not hex) recommended because of perceptual uniformity and gamut headroom on P3 displays; hex is tolerated and translated internally. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems
- **Example from the blog:** Stripe palette — `#635BFF` primary (CTAs/brand surfaces), `#0A2540` deep navy (body text/headers), `#425466` slate (secondary text), `#FFFFFF` background, `#F6F9FC` subtle background (cards/zebra rows). Contrast pairs annotated with ratios: navy on white 13.4:1, white on purple 4.8:1. Agents choose text colors via these pairs, not by guessing. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained
- **Lokma takeaway:** Every color needs a role. Hex-only lists are unusable for agents. Pair at least two contrast-validated combos so hover/state selections stay WCAG-aware without a separate accessibility section.

### 2.2 Section 2 — Typography (VoltAgent: Typography Rules → OD: Typography)

- **VoltAgent:** Font families + full hierarchy table. Source: https://github.com/VoltAgent/awesome-design-md
- **OD deep dive:** Display face, body face, mono face + explicit scale. Example — Stripe uses Inter with `font-variation-settings: 'opsz' 32` for ≥48px headings, `opsz` 14 for 14–18px body, JetBrains Mono for code. Scale is an opinion, not decoration: Stripe `14/16/18/22/28/36/48/64/80`, Linear `13/14/16/20/28/40` (compressed), Editorial `14/16/18/24/36/56/80/112/144` (expansive). Source: https://opendesigner.io/blog/design-md-9-section-schema-explained
- **OD catalog shorthand:** *"Display face, body face, mono face. Plus the scale. Variable-font axes are spelled out — Inter at 'opsz' 32 reads visibly different from Inter at 'opsz' 14."* Source: https://opendesigner.io/design-systems
- **Lokma takeaway:** Typographic rhythm is a 9-section DS's second most visible fingerprint after color. Spell out opsz/variation axes; agents honor them.

### 2.3 Section 3 — Spacing (VoltAgent: Layout Principles includes spacing → OD: Spacing as standalone)

- **VoltAgent:** Layout Principles carries spacing scale + grid + whitespace philosophy; spacing is not standalone. Source: https://github.com/VoltAgent/awesome-design-md
- **OD blog:** Spacing gets its own section — base unit (almost always 8px) + scale (`4/8/12/16/24/32/48/64/96/128`) + *taste annotations*: generous means prefer larger vertical rhythm values, tight means prefer smaller inline gaps. Blog calls this a proof that Markdown beats JSON tokens: ` --gap-large: 32px` is brittle, but *"prefer larger for vertical rhythm, smaller for inline gaps"* is reasoning the agent can apply contextually. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems
- **Lokma takeaway:** Separate spacing from layout. Keep a base unit and annotate taste — agents read annotations as constraints.

### 2.4 Section 4 — Layout (VoltAgent: Layout Principles → OD: Layout)

- **VoltAgent:** Spacing scale, grid, whitespace philosophy. Source: https://github.com/VoltAgent/awesome-design-md
- **OD:** Column count, gutters, breakpoints, container widths. Canonical examples — Stripe: 12-col 1280px with 24px gutters; breakpoints 640/1024/1280; hero full-bleed, body max 1280. Linear: 1024px denser. Editorial: 1440px with `max-width: 65ch` prose constraint. Placement is deterministic from this section, not guessed by the agent. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems
- **Lokma takeaway:** Layout is where Lokma's canvas work earns predictability — encode container+gutter+breakpoints so chat-generated previews land correctly.

### 2.5 Section 5 — Components (VoltAgent: Component Stylings → OD: Components)

- **VoltAgent:** Buttons, cards, inputs, navigation with states. Source: https://github.com/VoltAgent/awesome-design-md
- **OD:** Recipes for primitives — button, card, input, badge, table, modal — each including *negative annotations*: `no scale-on-hover`, `no shadow change`. Blog example: primary button 48px height, 16px padding, 8px radius, `var(--color-primary)` / white, weight 500, 16px; hover only darkens background. The negatives are what prevent AI-default exuberance ("everything pops, everything bounces"). Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems §Components row
- **Lokma takeaway:** Every component needs its "don't do" line. Positive recipes produce a look; negative rules produce identity.

### 2.6 Section 6 — Motion (VoltAgent: Depth & Elevation → OD: Motion)

- **VoltAgent slot 6:** Depth & Elevation — shadow system, surface hierarchy (z-layers). Motion is not standalone there. Source: https://github.com/VoltAgent/awesome-design-md
- **OD slot 6:** Motion — easing curves + duration tokens. Defaults: 150ms hover, 300ms state change, 500ms page transition; canonical ease `cubic-bezier(.16,1,.3,1)` (OD repo UI convention) and the catalog example `cubic-bezier(0.4,0,0.2,1)`. "No bouncy easings" as a negative annotation. Most DS keep motion to 4–6 lines; HyperFrames/kinetic-typography skills expand it to first-class treatment. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems and https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §7
- **Dok note on depth:** Shadow/surface hierarchy that VoltAgent treats as Depth & Elevation now lives in components/tokens (e.g., `--surface`, elevation layers) rather than a standalone numbered heading. Source: VoltAgent table vs OD catalog grid comparison.
- **Lokma takeaway:** Keep motion short by default and forbid bouncy curves centrally; let HyperFrames-like skills opt into richer motion.

### 2.7 Section 7 — Voice (VoltAgent: Do's and Don'ts includes voice nuance → OD: Voice as standalone)

- **VoltAgent:** Voice nuance appears implicitly in Do's and Don'ts guardrails (anti-patterns + agent prompt guide). No dedicated voice heading. Source: https://github.com/VoltAgent/awesome-design-md
- **OD standalone Voice:** Microcopy rules, pronoun guidelines (`we`+`you` not `I`+`our customers`), vocabulary banned list (`amazing`, `incredible`, `unleash`), literal-over-metaphorical preference ("your data is on your disk" > "unleash the power of your data"). OD calls this *"what most token-based systems lack entirely — the single biggest reason DESIGN.md output reads more cohesive than theme-based output."* Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems §Voice row
- **Lokma takeaway:** This is the highest-leverage novelty Lokma can lift. Voice belongs inside DESIGN.md because it shapes every generated button label, headline, and error state.

### 2.8 Section 8 — Brand (VoltAgent: Responsive Behavior → OD: Brand)

- **VoltAgent slot 8:** Responsive Behavior — breakpoints, touch targets, collapsing strategy. Brand is implicit. Source: https://github.com/VoltAgent/awesome-design-md
- **OD slot 8:** Brand — logo usage, clear space (≥24px), photographic background constraints, mark color, horizontal layout, centering prohibitions. Length scales with brand complexity (Apple 2 paragraphs, editorial 4 lines). Blog example: Stripe logo always horizontal, never centered in a card, 24px clear space, prefers white/`#F6F9FC`, never photographic, mark `#635BFF`. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems §Brand row
- **Lokma takeaway:** Brand is the application wrapper that prevents logo/contrast abuse — worth its own H2 for any brand with real assets.

### 2.9 Section 9 — Anti-patterns (VoltAgent: Agent Prompt Guide → OD: Anti-patterns / Forbidden list)

- **VoltAgent slot 9:** Agent Prompt Guide — quick color reference, ready-to-use prompts (a convenience tail, not a quality guard). Source: https://github.com/VoltAgent/awesome-design-md
- **OD slot 9:** Anti-patterns — the kill list. Blog verbatim forbidden list: *purple gradient hero backgrounds; emoji icons in CTAs; "AI" mentioned anywhere in body copy; generic abstract hero illustrations; words amazing/powerful/unleash; auto-scale on hover; bouncy easings; Inter at display sizes (use Source Serif for >48px).* Blog notes: *"Every render checks against this list during the 5-dim self-critique pass. Skip this section and your DS produces the AI-default look."* Source: https://opendesigner.io/blog/design-md-9-section-schema-explained and https://opendesigner.io/design-systems §Anti-patterns row
- **Lokma takeaway:** This is the guardrail OD believes matters most. Even a short list breaks the AI-default collapse that otherwise makes every DS render identically.

### 2.10 Why nine, not twelve — compression rationale

From OD's deep dive, worth quoting because Lokma will face the same scope temptation:

> Earlier drafts had 12, 14, even 18 sections. The cuts: iconography merged into Components (icons are a component family); imagery dropped — too brand-specific to standardize; themes (light/dark/contrast) merged into Color; accessibility dropped as a standalone section — it lives as constraints inside relevant sections (contrast in Color, font sizes in Typography); code style dropped — handled by linters, not design. Nine is enough to express any real-world brand and few enough that an agent can hold the whole DS in working context.

Source: https://opendesigner.io/blog/design-md-9-section-schema-explained §Why nine, not twelve

Companion rationale from the catalog page restates the merge logic independently (iconography→components, imagery dropped, themes→Color, accessibility distributed, code style→linters) and adds the mnemonic for ordering — *"color first, anti-patterns last — because earlier sections set context the later ones depend on."* Source: https://opendesigner.io/design-systems §9-section schema intro

### 2.11 Three reference systems side-by-side (how the same 9 sections render differently)

From the blog's Stripe/Linear/Editorial comparison:

- **Stripe:** 4–8 lines per section, professional restrained, single-hue color, short anti-patterns. Trust-signal whitespace discipline.
- **Linear:** 3–5 lines per section, terser, semicolon-heavy, engineering-flavored vocabulary, compressed type scale, 1024px dense grid.
- **Editorial:** 8–15 lines per section, voice section is 3 paragraphs, 14-item anti-patterns, distinctive 65ch prose constraint, display sizes up to 112/144.

*Result:* same brief in three systems renders three artifacts distinguishable at 50 yards — the schema's job. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained §Three real systems, side by side and https://opendesigner.io/design-systems decision guide

---

## 3. 5-dimensional critique — huashu-design influence & OD's self-critique loop

### 3.1 The provenance string and what it claims

The task prompt asserts a *"5-dimensional critique from alchaincyf/huashu-design"* as the second half of the DESIGN.md lineage — VoltAgent for the 9-section historical schema, huashu-design for the critique discipline. In OD's current repository, this is not a visible standalone repo file but a **product-level pattern** that OD's docs and related skills attribute and operationalize:

- OD's landing hero and the `opendesigner.io` feature grid describe a **5-direction picker** (deterministic palettes when no brand spec) and a **5-dimensional self-critique pass** scoring output before emitting. Exact phrasing from the product surface: *"A turn-1 question form locks the brief before the model paints. A 5-direction picker provides deterministic palettes when there's no brand spec. A 5-dimensional self-critique scores output before emitting. Every skill ships a P0/P1/P2 checklist enforced via pre-flight side-file injection."* Source: https://opendesigner.io/ (feature section + skill spotlight area) and the repository's `craft/` + `skills-protocol.md` descriptions that follow.
- The companion skill comparison that positions huashu-design relative to guizang-ppt: *"huashu-design: a fuller HTML-native design workflow"* vs guizang-ppt's focused magazine-deck workflow — implying huashu-design is the fuller HTML-native workflow that the critique loop belongs to conceptually. Source: https://knightli.com/en/2026/05/09/guizang-ppt-skill-huashu-design-agent-skills (TOC framing) — topical bridge, not a spec.

Because `https://github.com/alchaincyf/huashu-design` does not resolve as a raw-extractable public repo at research time (attempted fetches at `/main/README.md`, `/main/SKILL.md`, `/main/docs/design-system.md` returned 404), the reconstruction below uses OD's own **critique machinery** — anti-ai-slop linter + craft rubric + theater — which is the shipped realization of that 5-dim discipline. Treat the dimension labels as the operational dimensions OD actually scores, not merely a blog metaphor.

### 3.2 What "5 dimensions" means operationally in OD

OD distributes critique/responsibility across three coupled mechanisms. The "5 dimensions" label is the picker/critique naming; the enforcing surfaces are `craft/` + `lint-artifact.ts` + skill `references/checklist.md` + the glance-check `Theater` overlay. Together they score roughly along these axes:

| # | Dimension | What is scored | Enforcing surface |
|---|-----------|---------------|-------------------|
| 1 | **Design / Visual coherence** | Palette fidelity, type hierarchy, spacing/layout discipline, depth/elevation restraint | `craft/typography.md`, `craft/color.md`, `craft/typography-hierarchy*.md`, `design-systems/_schema/tokens.schema.ts` token sync |
| 2 | **Craft / Anti-slop** | The seven cardinal sins + P1/P2 tells — no default indigo, no two-stop trust gradient, no emoji-as-icons, no serif-bypass, no left-border accent tile, no invented metrics, no filler copy | `craft/anti-ai-slop.md` + daemon linter `apps/daemon/src/lint-artifact.ts` (`AI_DEFAULT_INDIGO`, P0/P1/P2 findings) |
| 3 | **Interaction / State coverage** | Every interactive control has visible `:focus-visible`, semantics preserved, keyboard behavior valid, empty/loading/error states covered | `craft/state-coverage.md`, `craft/form-validation.md`, `craft/accessibility-baseline.md` |
| 4 | **Brand / Voice alignment** | DESIGN.md palette + typography + voice + brand rules + anti-patterns honored; voice word bans enforced | The active `DESIGN.md` §1,2,7,8,9 itself — scored at render time by the agent + by the judge rubric referenced in `opendesigner.io` marketing ("judge via P0/P1/P2 checklist") |
| 5 | **Accessibility / Correctness guard** | Contrast 4.5:1 normal / 3:1 large, reduced-motion scoped correctly, no undeclared tokens, token/prose sync, manifest parity | `docs/design-systems.md` §6 accessibility, `design-systems/_schema/AGENTS.md` token parity guards, `tailwind-v4.css`/`design-tokens.json` parity |

Sources: https://raw.githubusercontent.com/nexu-io/open-design/main/craft/README.md, https://raw.githubusercontent.com/nexu-io/open-design/main/craft/anti-ai-slop.md, https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §6–7, https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/_schema/AGENTS.md

### 3.3 How the critique loop runs (agent-time vs daemon-time)

- **Agent-time self-critique:** Every render checks against the DESIGN.md anti-patterns list *during* a self-critique pass before emitting. Blog: *"Every render checks against this list during the 5-dim self-critique pass."* That pass is triggered by skill `references/checklist.md` P0 gates and the per-skill `od.critique.policy` (values `required` / `opt-in` / `opt-out`). The skill body's workflow tells the agent to pass its own checklist before handing off a file or `text_artifact` block. Source: https://opendesigner.io/blog/design-md-9-section-schema-explained §Anti-patterns and https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md §2.1 (critique.policy) and https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/guizang-ppt/SKILL.md (implements its own checklist)
- **Daemon-time lint:** `apps/daemon/src/lint-artifact.ts` reports anti-ai-slop findings back to the UI (P0/P1 badges) and to the agent as a system reminder for self-correction. Product note: *"Artifact persistence is not currently hard-blocked on P0 hits."* — so the agent can revise. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/craft/README.md §Enforcement levels
- **UI surface:** `CritiqueTheaterMount` / `useCritiqueTheaterEnabled` (web component) overlays findings; checklist outcomes drive badges so the user can gate delivery visually. Source: inferred from `apps/web/src/components/ProjectView.tsx` imports (`Theater`) and `craft/README.md` enforcement mapping
- **Heavyweight disclosures:** For briefs with no brand spec, the **5-direction picker** deterministically selects a palette (the complementary tool to critique — pick direction before paint, critique after paint). The hero pitch: *"A 5-direction picker provides deterministic palettes when there's no brand spec."* Source: https://opendesigner.io/

### 3.4 What Lokma should borrow from the 5-dim discipline

- Don't copy the dimension *labels* verbatim; copy the **dual-gating**: agent self-check against `DESIGN.md` + `references/checklist.md` (P0 gates) **before** emissive write, plus a daemon linter that flags P0 regressions **after** emission and feeds them back as a system reminder. Both exist in OD.
- Encode huashu-design's HTML-native breadth as a craft rulebook (`craft/` equivalent) rather than as extra headings inside DESIGN.md. OD's insight is that universal craft (letter-spacing caps, accent-overuse limits, anti-slop) belongs in `craft/` files injected by `od.craft.requires`, not in every brand's markdown. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/craft/README.md

---

## 4. design-systems/ — brand-grade system packages

### 4.1 Size and provenance of the catalog

- **Shipped count:** 151 ported design-system packages (the README says 151, the `opendesigner.io/design-systems` gallery page says 152 including a landing-count off-by-one — use 151 as the repository truth). Line: *"The bundled catalog currently contains 151 packages."* Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md
- **The gallery page phrasing:** *"152 portable DESIGN.md systems · The 9-section DESIGN.md schema — color, typography, spacing, layout, components, motion, voice, brand, anti-patterns. Every artifact reads from the active system. Switch system, the next render uses new tokens."* Source: https://opendesigner.io/design-systems
- **Upstream mix noted in the README's Attribution section:**

  - `VoltAgent/awesome-design-md` (MIT) for upstream-derived product systems
  - `bergside/awesome-design-skills` for normalized design-skill systems
  - `tw93/kami` (MIT) for the `kami` package
  - `Tom-Opencart/tom-modern-html-style-rule` (MIT) for `tom-modern`

  Brand-referencing packages are *"aesthetic inspirations, not official assets of the brands they reference."* Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md

- **Catalog breadth:** 152 (gallery) entries span categories like AI & LLM (15), Automotive (7), Backend & Data (9), Productivity & SaaS (12), Bold & Expressive (8), etc. Gallery carries per-package tokens (display face, 4-color signature, spacing rhythm, anti-patterns) so switching systems visibly changes the next render. Source: https://opendesigner.io/design-systems (filter + listing)

### 4.2 Package contract — not a standalone markdown file

Modern OD design systems are **packages**, not loose markdown files. Minimum machine-readable shape (from `docs/design-systems.md` §1):

```text
design-systems/<slug>/
├── manifest.json  ← discovery metadata + declared package files (id, name, category, description, source)
├── DESIGN.md      ← canonical design prose for agents
└── tokens.css     ← canonical compiled CSS custom properties
```

Manifest v1 fixed fields:

```json
{
  "schemaVersion": "od-design-system-project/v1",
  "id": "acme",
  "name": "Acme",
  "category": "Productivity & SaaS",
  "description": "A concise English catalog summary.",
  "source": { "type": "bundled", "origin": "OpenDesign curated bundled fixture" },
  "files": { "design": "DESIGN.md", "tokens": "tokens.css" }
}
```

Rules: folder slug must equal `manifest.id` (normalized ASCII); `files.design` is `DESIGN.md`; `files.tokens` is `tokens.css`; `name`/`category`/`description` are primary catalog copy; `source` carries provenance (`bundled`|`local`|`github`|`shadcn`); every declared path must be safe, relative, and present. Schema authority: `design-systems/_schema/manifest.schema.ts` + `packages/contracts/src/design-systems/token-schema.ts`. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §1 and https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md

Backward compatibility: the daemon still discovers *legacy* folders containing only `DESIGN.md` (no manifest), but that is an explicit compatibility fallback, *"not the authoring target for new repository content."* Source: both docs above.

### 4.3 Rich package profile — beyond the minimum

Once a package opts into the rich profile, the quality guard expects a complete profile declared through manifest fields (`usage`, `files.components`, `componentsManifest`, `files.designTokens`, `files.tailwind`, `assetsDir`, `fonts`, `preview`, `sourceFiles`). The richer shape:

```text
USAGE.md                     agent-facing read-order + usage guide (must contain H2s: Read Order, Design Highlights, Do, Avoid)
components.html              standalone component fixture (≥10 selectors + ≥8 referenced tokens)
components.manifest.json     derived index from components.html + tokens.css
design-tokens.json           derived Design Tokens JSON (must agree with tokens.css)
tailwind-v4.css              derived @theme Tailwind v4 mapping (must not redefine values independently)
assets/                      optional brand assets (logos, wordmarks, icons — preserved from importer evidence)
fonts/                       optional webfonts
preview/                     indexed preview pages (guard expects ≥3 previews covering colors, typography, spacing for rich packages)
source/                      importer evidence + token reports (scanned-files.json, evidence.md, tokens.source.json, token-contract.report.json, snippets/INDEX.json)
```

Derived-file contract: `components.manifest.json`, `design-tokens.json`, `tailwind-v4.css` are *caches* regenerated from `components.html`/`tokens.css`/token-contract report — not competing sources of truth. Parity drift fails the guard. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §1 "Rich package files" + §5 "Component fixtures and usage guides" and https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md §Rich package files

### 4.4 Authoring tokens.css — the compiled contract

- `tokens.css` is the canonical compiled stylesheet: put shared declarations in `:root { --bg: …; --fg: …; --accent: …; --font-display: … }`. Contract source is `packages/contracts/src/design-systems/token-schema.ts` re-exported via `design-systems/_schema/tokens.schema.ts`. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §4
- **Four-layer token contract** (`design-systems/_schema/AGENTS.md` "Four layers, two questions") — key to how Lokma should think about extension:

| Layer | Who decides | If omitted | Examples |
|-------|------------|------------|----------|
| A1-identity | brand | guard fails | `--bg`, `--fg`, `--accent`, `--font-display` |
| A1-structure | brand | guard fails | type scale, `--container-max`, `--section-y-*` |
| A2 | brand with fallback | guard fails today; derive fills tomorrow | `--motion-fast`, `--success`, `--space-4`, `--font-mono` |
| B-slot | brand or schema-suggested alias | guard fails — brand must declare as `var(--sibling)` (collapsed) or independent value (richer) | `--fg-2 -> var(--fg)`, `--surface-warm -> var(--surface)` |

  Brand-specific tokens outside the shared schema are tracked as **C-extensions** (`BRAND_EXTENSIONS` per-brand allowlist or `BRAND_EXTENSION_PREFIXES` for families like `--tag-bg-*`). Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/_schema/AGENTS.md

- **Synchronization rule:** If `DESIGN.md` names an accent, type scale, spacing rhythm, or motion duration, the binding in `tokens.css` must express the same decision. The daemon/guard checks prose/token sync plus unknown-token allowlists. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §3 closing paragraph
- **Dark variant:** Override semantic tokens under a theme selector rather than duplicating component rules: `[data-theme="dark"] { --bg: #111113; --fg: #fafafa; }`. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §4

### 4.5 Catalog & runtime behavior

- **Scan:** The daemon scans the catalog on *every* `/api/design-systems` request. After editing a package, refresh the Design System surface — no daemon restart required. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md
- **Precedence:** `manifest.json` metadata outranks legacy Markdown H1/`> Category:` and frontmatter. Complete frontmatter color metadata outranks Markdown swatches. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §2 and README equivalent
- **Importers:** Product exposes local-folder, GitHub, and shadcn import flows in UI + `od design-systems import-*` CLI; importers write the package contract (manifest + DESIGN.md + tokens.css), not a standalone markdown file. Bulk catalog sync remains via `scripts/sync-design-systems.ts`. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md §Importing and refreshing and https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §8
- **Accessibility & motion sub-sections:** Guard checks contrast (4.5:1 normal, 3:1 large), visible `:focus-visible`, preserved semantics/keyboard, reduced-motion scoping to animating properties, and the strong-ease convention `cubic-bezier(.16,1,.3,1)` for motion. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §6–7

### 4.6 What "brand-grade" means in practice

- Each package's `components.html` is an *executable proof* tokens compose into real controls — at least four component groups, 10 selectors, 8 tokens. `USAGE.md` is the agent-facing router (Read Order → Design Highlights → Do → Avoid) that steers prompt composition to feed the right package files. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §5
- Preserved source assets (logos, wordmarks, icons, imagery, fonts) belong in `assets/`/`fonts/`/`build/` when importer evidence supplies them — the gallery preview cards visibly load preserved files when available. Source: inferred from `docs/design-systems.md` + gallery listings (e.g., Apple, Linear, Vercel carry recognizable type/asset signatures)

---

## 5. design-templates/ — guizang-ppt, html-ppt, dating-web & the template registry

### 5.1 Registry split: skills/ vs design-templates/ vs design-systems/ vs craft/

OD maintains *four axes* (from `design-systems/_schema/AGENTS.md` + `craft/README.md` + root `AGENTS.md` — synthesized):

| Axis | Directory | API | Scope | Example ids |
|------|-----------|-----|-------|-------------|
| Functional skills | `skills/` | `/api/skills` | Capability an agent invokes while working (utilities, briefs, packagers) | `brand-extract`, `design-brief`, `imagegen` |
| Design templates | `design-templates/` | `/api/design-templates` | Renderable starting point for creation workflows (forked shape, not blank) | `guizang-ppt`, `html-ppt-*`, `dating-web`, `saas-landing`, `pricing-page`, `docs-page`, `blog-post` |
| Design systems | `design-systems/` | `/api/design-systems` | Brand tokens, rules, fixtures (catalog of 151) | `linear-app`, `vercel`, `editorial`, `apple` |
| Craft | `craft/` | composed by daemon into prompt | Universal brand-agnostic craft rules | `typography`, `color`, `anti-ai-slop`, `state-coverage`, `animation-discipline` |

Skill and template endpoints scan user-writable roots first and bundled roots second on each listing request; a user entry can shadow a bundled entry with the same id. Chat resolution spans both roots because a persisted project's primary `skillId` may identify either a functional skill or a design template. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/architecture.md §3.4, https://raw.githubusercontent.com/nexu-io/open-design/main/craft/README.md §Why a fourth axis, https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md

Bundled material covers **~100+ design-templates** plus **31 functional `skills/`** plus **craft/** plus **151 design-systems/**. The file tree under `design-templates/` lists guizang-ppt and the html-ppt family as siblings, not nested. Source: design-templates directory listing as reflected in blog/architecture extracts above (including the long `design-templates/` tree in html-ppt context above).

### 5.2 guizang-ppt — the bundled MIT editorial deck skill

- **Origin:** `op7418/guizang-ppt-skill` — a Claude Code skill producing magazine-style, horizontal-swipe web decks with *"editorial magazine × electronic ink"* aesthetic — *"picture Monocle with code stitched in."* Structure is `SKILL.md` + `assets/template.html` + `assets/motion.min.js` + `references/{components,layouts,themes,checklist}.md`. Single-file HTML output with embedded CSS/WebGL; keyboard/scroll/touch nav. Source: https://github.com/op7418/guizang-ppt-skill (README + SKILL.md), https://pyshine.com/Guizang-PPT-Skill-Magazine-Style-HTML-Decks-Claude-Code
- **Bundled location in OD:** `design-templates/guizang-ppt/` — shipped verbatim with upstream license preserved and OpenDesign metadata/file-handoff integration applied. The skill directory convention (`assets/` + `references/` + `SKILL.md`) is documented as the pattern we require for skill authors. The *6-step workflow + quality-checklist rubric* pattern from guizang is the canonical skill-authoring workflow OD documents. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/references.md §guizang entry + https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/AGENTS.md
- **Frontmatter in OD's fork:** Name `magazine-web-ppt`, `od.mode: deck`, `od.default_for: deck`, `upstream: https://github.com/op7418/guizang-ppt-skill`, `preview.type: html`, `design_system.requires: false`, scenario `marketing`. The `default_for: deck` makes it the default deck creation path. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/guizang-ppt/SKILL.md
- **Visual tone (OD fork):** Electronic magazine + electronic ink hybrid; WebGL fluid/contour/dispersion backgrounds visible on hero pages; serif headlines (Noto Serif SC + Playfair Display) + sans body (Noto Sans SC + Inter) + monospace metadata (IBM Plex Mono); Lucide line icons (no emoji); horizontal paging with smooth theme interpolation on hero flip. Source: same SKILL.md
- **Workflow in OD's fork (5 steps, inferred from Steps 0–2 in SKILL.md excerpt):** Step 0 — infer one of 5 magazine directions from brief (Monocle Editorial default, WIRED Tech, Kinfolk Slow, Domus Architectural, Lab/Reference) — only surface a picker if user asks to compare; Step 1 — 6-question clarifying checklist (audience, duration, source material, images, hard constraints); Step 2 — copy `assets/template.html` to `project/ppt/index.html` and scaffold `images/`; Step 3 — populate slides from layout catalog + theme rhythm; Step 4 — self-check against `references/checklist.md`; Step 5 — preview + inline-style iteration. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/guizang-ppt/SKILL.md and the broader guizang SKILL.md original at https://raw.githubusercontent.com/op7418/guizang-ppt-skill/main/SKILL.md
- **Reference files:** `references/styles.md` (5 magazine directions with theme colors, layout chrome, slide-count guidance — replacing the upstream `themes.md` + `themes-swiss.md` 5+4 theme presets), `references/layouts.md` (10 layout skeletons pasted as paste-ready blocks — hero cover, act divider, big numbers, lead image+text, image grid, pipeline, hero question, big quote, before/after, image+text mix), `references/components.md` (type system, grid, icon/animation recipes), `references/checklist.md` (P0/P1/P2 gates). Source: OD fork SKILL.md + upstream component summary at https://pyshine.com/Guizang-PPT-Skill-Magazine-Style-HTML-Decks-Claude-Code and the directory note in https://github.com/KwokJay/open-design-desktop/blob/main/QUICKSTART.md
- **Why OD keeps it under design-templates/ not skills/:** Rendering templates are browsed via `design-templates/` + `/api/design-templates` (the rendering catalogue), not `skills/` + `/api/skills`. guizang-ppt is a rendering shape (produces a deck artifact), not a utility capability invoked mid-task. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md §3 + https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/AGENTS.md
- **License:** Upstream guizang-ppt-skill is MIT; OD preserves the upstream license with attribution when bundling. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/references.md and bundled fork README

### 5.3 html-ppt — 15 decks, 36 themes, and the wrapper proliferation

- **What it is:** A second, broader deck skill family under `design-templates/html-ppt*`. The canonical `html-ppt` skill plus 14 wrapper variants (the task shorthand "15 decks") and 36 themes (the wrapper-per-theme / theme-per-variant matrix).
  - Count in OD's directory listing tree: `html-ppt`, `html-ppt-course-module`, `html-ppt-graphify-dark-graph`, `html-ppt-hermes-cyber-terminal`, `html-ppt-knowledge-arch-blueprint`, `html-ppt-obsidian-claude-gradient`, `html-ppt-pitch-deck`, `html-ppt-presenter-mode-reveal`, `html-ppt-product-launch`, `html-ppt-taste-brutalist`, `html-ppt-taste-editorial`, `html-ppt-tech-sharing`, `html-ppt-testing-safety-alert`, `html-ppt-weekly-report`, `html-ppt-xhs-pastel-card`, `html-ppt-xhs-white-editorial` plus the `html-ppt-zhangzara-*` family (≈ 30 zhangzara* variants) — the 15/36 numbers in the task refer to the curated html-ppt family (the exact 15 counted as the html-ppt-* wrappers shown in the design-templates tree excerpt) + 36 themes exposed by that skill's `references/themes.md` like arctic-cool, brutalist, editorial, kami, +32 more. Source: directory tree extract under https://github.com/nexu-io/open-design/tree/main/design-templates/guizang-ppt (tree shows html-ppt* family) and product site "Skill spotlight · html-ppt · One skill. 36 themes, 31 layouts, 47 animations, 14 deck templates" at https://opendesigner.io/
- **Skill spotlight phrasing on the product site:**

  > One skill. 36 themes, 31 layouts, 47 animations, 14 deck templates. The bundled html-ppt skill ships every primitive a deck agent needs: a presenter mode, a layout library, a kinetic animation set, and 14 ready-to-fork templates. Drop the folder in, restart the daemon, you have an in-browser PPT engine.

  With per-link breakdown on that page: `36 built-in themes — arctic-cool, brutalist, editorial, kami, +32 more`, `14 deck templates — pitch deck, knowledge graph, magazine, pastel card, +10 more`, `47 animations — 27 CSS + 20 Canvas FX`, `31 batteries-included layouts — split-pane, columns, hero, gallery, quote`, `Presenter mode — current slide on the left, next slide on the right`. Source: https://opendesigner.io/ §html-ppt animated overview
- **Wrapper taste-locking:** `html-ppt-taste-brutalist` and `html-ppt-taste-editorial` ship as taste-locked wrappers — same engine, different hard-coded aesthetic. Three additional wrappers for web prototypes: `web-prototype-taste-{brutalist,editorial,soft}`. Source: same https://opendesigner.io/ §Taste-locked variants + directory listing
- **Deck runtime contract (all deck templates, including html-ppt + guizang-ppt):** Any template with `od.mode: deck` must make its baked `example.html` usable inside the gallery iframe without host assistance. Minimum: keyboard `ArrowRight/Down/PageDown/Space` → next, `ArrowLeft/Up/PageUp` → prev, `Home`/`End` jump, mouse wheel accumulated threshold → single slide (reset quickly, no overshoot), touch 50px horizontal swipe (greater than vertical) → prev/next, dots — one button per slide with `aria-current="true"`, active slide marked `.slide.active` (alias `.is-active`), focus deck on load/interaction, avoid `scrollIntoView()`, no-script/print must expose all slides, hide non-active slides only after runtime boot. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/AGENTS.md §Deck preview navigation contract
- **Export targets for deck mode:** HTML (single file, inlined assets), PDF (browser print deck-aware), PPTX (agent-driven skill), ZIP (archive), Markdown. The deck skill's workflow + export pipeline is deck-aware of speaker notes and slide thumbnails. Source: `docs/modes.md` §Deck + README Demo §3

### 5.4 dating-web prototype — the web prototype reference template

- **Location:** `design-templates/dating-web/` — listed as the web-prototype showcase template the README cites:
  > Web prototype — an editorial dashboard with scrollbars, KPIs, and charts. Rendered straight from design-templates/dating-web/.

  Companion prototype reference: mobile-app prototype — three-screen gamified flow with XP ribbons and quest detail. Both surfaces are *"hand off straight to Cursor / Codex / Claude Code to turn into React/Next/Vue."* Source: https://raw.githubusercontent.com/nexu-io/open-design/main/README.md §Demo 1
- **What it demonstrates:** A single-screen interactive prototype that reads `DESIGN.md`/`tokens.css` and renders in a sandboxed iframe — the default `prototype` output surface ("Single-page HTML artifacts that read your DESIGN.md and render in a sandboxed iframe"). Dating-web uses editorial-dashboard patterns (KPIs, charts, scrollbars) wired to tokens, proving a template's hand-built `example.html` shapes agent output meaningfully when the user says "dating app, like dating-web but for X". Source: same README Demo §1 plus `design-templates/AGENTS.md` on what a rendering template is
- **How to fork it:** Copy `design-templates/dating-web/` to `design-templates/<your-name>/`, change `SKILL.md` name/description/triggers, replace `example.html` with a hand-built sample, preserve `od.mode: prototype` (or wire `od.design_system.requires: true` so token composition applies — the dating-web family does). Refresh the gallery — the daemon re-scans on every `/api/design-templates` request, no restart required (classic path; `AGENTS.md` notes the daemon still re-scans on each request). Source: https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/AGENTS.md §Daemon plumbing + https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-contributing.md §1 happy path
- **Registry routing:** Selecting a template from "Start from" replaces the creation tab's default `prototype` skill as `skillId`. At runtime the daemon resolves that id across both registries and injects the template's `SKILL.md` (not both). Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/modes.md §Prototype

---

## 6. Studio pages — Home → Plugins → Design System → Studio

### 6.1 Navigation model and where it lives

OD's "Product tour" in the README describes the four core pages:

> Start from **Home** with a brief, explore reusable skills in **Plugins**, and turn brand references into a **Design System**. Then enter a project's **Studio** to create and refine prototypes, decks, mobile apps, images, documents, and HyperFrames in one place.

With a **Core pages** subtable:

| Page | One-line routing |
|------|-----------------|
| Home | choose artifact type, enter brief, set design system / working dir / model before starting |
| Plugins | browse official skills by category, search catalog, launch workflow with Try it |
| Design System | extract and refine a brand's visual language, preview the result, and create with it |
| Studio | many artifact types in one project — the creation + refinement workspace |

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/README.md §Product tour and the component wiring in `apps/web/src/components/ProjectView.tsx` (HomeView / NewProjectPanel routing).

The "Design system" entry is itself a full product surface — not a tab under New Project — so a user can iteratively extract → refine → preview → create-without-leaving-Design-System, then also swap the active DS mid-project inside Studio. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/modes.md §Design systems are a separate product surface

### 6.2 Home

- **Role:** Entry Composer. The Home hero shows a prompt card + a Chip Rail (intent chips below the prompt). A chip chooses the composer surface, default scenario plugin, default option state, and the project kind stamp before the user presses Run. Home also surfaces the `HomeHero` chips + `SkillPicker` for explicit skill selection. Source: `CONTEXT.md` glossary entries for `Chip Rail` + `Home Composer Media Surface` at https://raw.githubusercontent.com/nexu-io/open-design/main/CONTEXT.md
- **Controls before Run:** Artifact type / working directory / design system picker / model selector — the four controls wired as props to `HomeView` → `NewProjectPanel`. After Run, the frontend creates a project record through `/api/projects` and the daemon's project/create flow takes over. Source: README §Product tour (Home row) + architecture flow §4 Generation data flow
- **Analogy for Lokma:** Home is the brief → kind → DS → model preflight that locks direction *before* the agent paints. OD commits to this lock on purpose to avoid rework; the same "locking" is worth copying in Lokma's new-project dialog.

### 6.3 Plugins

- **Role:** Browse official skills by category, search the catalog, and launch a workflow with **Try it**. In daemon terms this is the web surface over `/api/skills` + `/api/design-templates` + `plugins/_official/` + configured registries. The catalog is functionally grouped (prototype / deck / template / design-system / image / video / audio and scenario hints like `marketing`, `productivity & SaaS`, etc.). Source: README §Product tour (Plugins row) + `docs/architecture.md` §3.4 + `docs/skills-protocol.md`
- **Discovery behavior:** Each listing request re-scans user-writable and bundled roots (user shadows bundled on collision). The daemon does not require a watcher or SIGHUP — local skill/template edits appear after refreshing the catalog surface. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md §3 and https://raw.githubusercontent.com/nexu-io/open-design/main/docs/architecture.md §3.4

### 6.4 Design System

- **Role:** Extract and refine a brand's visual language, preview the result, and create with it inside the same workspace. The page offers brand-reference ingestion (screenshot / brand-guide PDF / Figma link → `design-system-skill` → `DESIGN.md` emission) plus refinement (revise DS after seeing renders) and preview (the brand assets actually loaded). Source: README §Product tour (Design System row) + `docs/spec.md` scenario S4
- **Inside Studio:** A project can also show a design-system workspace — the `DESIGN_SYSTEM_TAB` / `isDesignSystemProject` path in `ProjectView.tsx`. The active design system's `DESIGN.md` is editable, the gallery picker lives in the Studio header, and the "extract from repo" CTA surfaces when a repo-connected project's evidence is missing. Source: `apps/web/src/components/ProjectView.tsx` (designSystemProject, designSystemWorkspace, `DESIGN_SYSTEM_TAB`, `designSystemNeedsRepoConnect` branch)

### 6.5 Studio — the central claim

The Studio page is the most consequential page because it is where the loop closes. README §Studio phrasing:

> Inside a project's **Studio**, the **conversation**, **generated files**, and **live preview** stay together across **six artifact types**:

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/README.md §Studio

#### 6.5.1 The six artifact types (Studio vocabulary)

| # | Studio artifact type | What it renders | Preview host | File handle |
|---|---------------------|-----------------|--------------|-------------|
| 1 | **Prototype** | generate/reconstruct web experiences; inspect rendered page; iterate with agent in place | sandboxed iframe (srcDoc or URL) | `index.html` or `Prototype.jsx`, kind `prototype` |
| 2 | **Deck** | multi-slide presentation; review thumbnails + speaker notes; export when ready | deck-runtime iframe (keyboard/wheel/swipe/dots) with host slide counter | single-file HTML deck (`index.html` + `slides.json` for PPTX) |
| 3 | **Mobile app** | generate/polish mobile interfaces in a device preview | device-framed iframe with responsive switching | mobile `index.html` / JSX |
| 4 | **Image** | generate visual assets from the project conversation | full-size image preview at full size | image asset + optional prompt template |
| 5 | **Document** | polished multi-page guides / editorial docs; inspect rendered layout; export/share | multi-page document preview (print export) | HTML/MD document artifact |
| 6 | **HyperFrame** | code-driven motion graphics; preview animation inside Studio; export MP4 | animated HyperFrames iframe | HyperFrames HTML motion package |

Rows 1–6 mirror the README's six bullet definitions verbatim. Extended surface coverage is described by `docs/modes.md`: Media's image/video/audio modes map onto dedicated Studio render paths; HyperFrames is a standalone Home composer surface that submits as `kind: video` with `videoModel: hyperframes-html` while keeping its own Studio entry. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/README.md §Studio, https://raw.githubusercontent.com/nexu-io/open-design/main/docs/modes.md §Media / Other, https://raw.githubusercontent.com/nexu-io/open-design/main/CONTEXT.md (HyperFrames composer surface).

#### 6.5.2 The triptych: conversation + files + preview (always together)

Within `ProjectView.tsx`, a single project resolves `ProjectDetail` + `OpenTabsState` + live `ProjectFile[]` + streaming `ChatMessage[]` + `DesignSystemSummary[]`. Those four data sets populate three panes that are always present:

- **Conversation** — left. Streams agent events (thinking, tool-call, tool-result, text deltas, file writes), supports `@` mentions for per-turn additional skillIds, question forms (when the skill asked to lock the brief on turn 1), critique notices, and resume/continuation flows. Imports used: `ChatPane`, `ChatComposer`, `streamViaDaemon`, `useProjectFileEvents`, `appendBufferedAgentDeltas`, `requestAmrArtifactUpgrade`, `strategy-question-continuation`, `todos` tracking. The assistant's turn ends with a short summary of files it wrote, not a duplicated code block — filesystem profile contract. Source: `apps/web/src/components/ProjectView.tsx` import + body synthesis + `docs/architecture.md` §4 Filesystem execution profile
- **Files** — center. `FileWorkspace` + `workspaceTabsDock` + `IframeKeepAlivePool` + auto-open selection (`auto-open-file.ts`, `autoOpenProducedArtifact`, `decideAutoOpenAfterWrite`). Tabs are managed as `OpenTabsState` with per-tab kind/renderer/export metadata; live artifacts sit alongside normal artifacts as a distinct store with refreshable preview state. Source: `apps/web/src/components/ProjectView.tsx` (`FileWorkspace`, `DESIGN_SYSTEM_TAB`, `LiveArtifact*`), https://raw.githubusercontent.com/nexu-io/open-design/main/CONTEXT.md (Project / Normal Artifact / Live Artifact glossary)
- **Preview** — right. The rendered deliverable that the file handle points to (HTML deck, prototype, document, image, HyperFrame). Rendering is the canvas described in the next section. Source: preview stack references below.

The key Studio invariant OD states directly: *"the conversation, generated files, and live preview stay together"* — no mode separates them. Source: README §Studio

#### 6.5.3 Project kinds behind the Studio types

Studio's six types map to daemon `ProjectMetadata.kind` plus inference from the resolved primary `SkillSummary.mode`:

- Creation tabs → `ProjectMetadata` kinds: `prototype` (default), `prototype`+`intent: live-artifact` (Live Artifact), `deck`, `template`, `image|video|audio`, `other`. Skills carry registry modes `prototype|deck|template|design-system|image|video|audio`. Design-system projects are a valid skill mode but not a New Project tab — they have their own product surface, but Studio still renders them in-project as a design-system workspace. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/modes.md and https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md §4 Registry modes

#### 6.5.4 Companion surfaces inside Studio

- **Design System picker in Studio header** — metadata `designSystemId` is editable inside a project. Changing the DS re-renders with the new `DESIGN.md` in context (no project reset). Analytics track origin/status/apply target kind so the funnel sees applies from both Home and Studio. Source: `ProjectView.tsx` (`handleChangeDesignSystemId`, `activeDesignSystemSummary`)
- **Comments / collab** — PresenceBar + useProjectCollab + PreviewComment store (`fetchPreviewComments`, `upsertPreviewComment`, `fetchConnectorStatuses`), anchor write-back for comment targets, duplication between file selection → chat continuation paths. Source: `ProjectView.tsx` imports `PresenceBar`, `PreviewComment`, `commentsToAttachments`, `anchor-client`
- **Export & Share** — per artifact kind: HTML/ZIP/MD (prototypes), PDF/PPTX (decks), MP4 (HyperFrames), plus share-to-community flows (`share-to-community/shareToCommunityPrompt`) and cloud saves. Source: README Demo sections + ProjectView share artifacts

---

## 7. Canvas & rendering — sandboxed iframe preview, real CSS/fonts/components, live agent panel streaming, critique loop

### 7.1 Sandboxed iframe preview — the core rendering boundary

> Prototype is the default output surface. Single-page HTML artifacts that read your DESIGN.md and render in a sandboxed iframe.

That sentence is the architectural thesis. The preview renderer is the file-workspace iframe that renders the active artifact file (typically `index.html`) as it exists on the daemon's project workspace — no separate build step.

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/README.md Demo §1

Deeper choices in the codebase:

- **HTML vs JSX handling:** The web app's `apps/web/src/App.tsx` wires sandboxed `srcdoc` iframes for HTML/JSX artifacts (using `IframeKeepAliveProvider` to avoid reload flashes when switching preview state). JSX artifacts carry a vendored React + Babel bridge so a prototype doesn't require a host recompilation. Plain HTML artifacts load through a plain iframe path. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/references.md (Open CoDesign iframe borrow) + `architecture.md` §3.6 Preview renderer
- **srcDoc vs URL decision:** `apps/web/src/components/file-viewer-render-mode.ts` explicitly decides between two render strategies: URL-load (served from daemon artifact URLs under `/artifacts/*` or the proxying `/api/*` rewrites) and `srcDoc` load (iframe `srcDoc` set directly with postMessage bridges for inspection, comment selection, palette/edit/tweak behavior). The host keeps *both* frame types mounted when switching render mode to avoid reload flashes. Message handlers validate the sending iframe and re-check the active window for signals that must come from the active frame. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/architecture.md §3.6
- **Branding the bridge:** The choice of `srcDoc` is the only path that enables comment-mode selection, palette/edit/tweak sliders, and host integration — all of which rely on a message bridge the daemon injects. URL-load is cheaper but has no host→iframe bridge. Source: same architecture excerpt + `opendesigner.io` product notes about sandboxed iframe preview
- **Export: HTML / PDF / PPTX / MP4:** The export pipeline (daemon headless Chrome for PDF, inlined HTML ZIP, agent-driven PPTX conversion, HyperFrames MP4) is post-preview, not an alternative render path — the preview is already the deliverable the export captures. Source: README Demo §3 + `docs/modes.md` §Deck
- **Safety guarantees:** The iframe is sandboxed; the daemon bounds file operations to the resolved project workspace (`RUNTIME_DATA_DIR` → `PROJECTS_DIR` or external `metadata.baseDir` for imported-folder projects); preview/source static-file routes expose only declared manifest `preview`/`source` entries — not arbitrary filesystem roots. Source: `AGENTS.md` Daemon data directory contract + `docs/architecture.md` §3.5 + design-systems package notes on preview/source file APIs

### 7.2 Real CSS / fonts / components — what "real" means against a design-system

"Real" is not an adjective — it is a distribution constraint that distinguishes OD canvases from canvas-painting tools (Figma) and from partial-canvas tools (Excalidraw-style sketches):

- **Real CSS:** Artifacts ship semantic custom properties (the compiled `tokens.css` contract from `design-systems/_schema`), not generic hex. Canonical example: `var(--accent)` instead of `#6366f1`, `var(--font-display)` instead of hard-coded `Inter`, `var(--container-max)` / `--space-*` / `--ease-standard: cubic-bezier(.16,1,.3,1)` for motion. The anti-ai-slop rule is: *if `DESIGN.md` provides `--accent`, using Tailwind indigo variants (`#6366f1`, `#4f46e5`, `#4338ca`, `#3730a3`, `#8b5cf6`, `#7c3aed`, `#a855f7`) is a P0 failure.* Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §4, https://raw.githubusercontent.com/nexu-io/open-design/main/craft/anti-ai-slop.md §The seven cardinal sins (sin #1 + #3 + #4 + #5), https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/_schema/AGENTS.md
- **Real fonts:** Fonts are loaded as shipped webfonts via CDN links preset in templates (e.g., guizang-ppt bundles Noto Serif SC + Playfair Display + IBM Plex Mono via optimized CDN) plus optional `fonts/` shipped per design-system package (importers preserve real source fonts when importer evidence provides them — logos, icons, wordmarks, imagery, and font files belong in `assets/`/`fonts/`/`build/`, not only prose). Preview cards visibly load those preserved files when available. Source: `design-templates/guizang-ppt/SKILL.md` §Workflow + `docs/design-systems.md` richness notes
- **Real components:** Every artifact reifies the DS component recipes as HTML elements + CSS classes bound to tokens, not as mockups. Example from guizang-ppt: `.h-hero` / `.h-hero-en`, `.ph-img`, WebGL-backed hero → card→body progression; from html-ppt: `31 layouts` library (split-pane, columns, hero, gallery, quote) animated by `47 animations` (27 CSS + 20 Canvas FX) via real class toggling and JS. The `components.html` fixture per DS package proves at least 4 component groups × 10 selectors declare real token-backed selectors the agent can copy. Source: `design-templates/guizang-ppt/SKILL.md`, https://opendesigner.io/ skill spotlight, `docs/design-systems.md` §5
- **Real-tokens verification:** The daemon's token/schema guard, A2 parity check, B-slot collapse rule, C-extension allowlist, and `components.manifest.json` regeneration enforce that the artifact's token usage matches the authored contract — a post-render invariant, not just honest instructions. Source: `design-systems/_schema/AGENTS.md`
- **Anti-slop discipline at the component level:** Cardinal sin #5 in `anti-ai-slop.md` forbids *"Rounded card with a colored left-border accent — the canonical 'AI dashboard tile' shape. Drop either the radius or the left border."* — an explicit case where "real" components must avoid the AI-default that looks correct at a glance. Source: same file.

### 7.3 Live agent-panel streaming — how the canvas updates while the agent works

The generation data flow is explicitly filesystem-shaped (see `docs/architecture.md` §4. Generation data flow):

1. Web UI or `od` CLI creates/selects a project via `/api/projects`
2. Chat/run request reaches daemon over `/api/*` (`/api/design-systems`, `/api/skills`, `/api/projects/:id/chat`)
3. Daemon resolves project + design system + primary skill/template + per-turn skills + runtime def + execution metadata; composes the system prompt stack (active DS package: `DESIGN.md` + `tokens.css` + `USAGE.md` + craft requires + skill body + side files staged under `.od-skills/<alias>/` as real copies, not symlinks); re-scans registries at request time so user edits shadow correctly
4. Daemon spawns the runtime CLI with the project workspace as cwd and streams normalized events over SSE (structured: thinking / tool-call / tool-result / text-delta / file-write / error / done). Dispatch keys are `streamFormat` / `eventParser` per `RuntimeAgentDef` (e.g., `claude-stream-json`, `json-event-stream`, `acp-json-rpc`, `dsh-profile-jsonl`, `plain`, `qoder-stream-json`, `copilot-stream-json` — see the 7-format catalog in `docs/agent-adapters.md` §3)
5. Structured/tool-capable runtimes write canonical project files; `ProjectView`'s `useProjectFileEvents` + file-list hydration subscribes to write events, the files pane updates immediately, and `FileWorkspace` auto-opens the newly produced artifact via `auto-open-file` heuristics
6. Assistant ends with an ordinary summary of files it wrote (no duplicated source in a code fence) — filesystem execution profile contract

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/architecture.md §4 and Runtime registry notes at §3.5–3.6 + `apps/web/src/components/ProjectView.tsx` streaming imports

Streaming specifics worth copying for Lokma:

- The web UI and `od` CLI call the same daemon HTTP APIs — the CLI is not a second business-logic implementation; it is the machine-readable surface for the same capabilities. Source: same architecture doc
- The panel coexists with Preview — `IframeKeepAlivePool` keeps the active preview frame mounted during streaming so deltas don't flash/reload. Buffered deltas are coalesced (`pendingContentDelta`, `pendingTextEventDelta`, `pendingThinkingEventDelta`) and flushed into the live message in one `appendBufferedAgentDeltas` batch to avoid chat jitter. Source: derived from `ProjectView.tsx` common-pattern imports
- Comment/tweak interactions feed back into the stream: a preview click selects a target element → a preview comment is persisted → `mergeAttachedComments` maps it into the next turn's prompt attachments so the agent can rewrite just the selected region — the loop is edit-and-recover, not regenerate-and-hope. Source: `ProjectView.tsx` comment subgraph + `docs/references.md` ("comment mode: click-to-pin element edits") + `docs/spec.md` S1 ("User clicks an element, drops a comment, the agent rewrites just that region")
- Runtime registry is explicitly *data, not behavior* — 20+ `RuntimeAgentDef` literal objects (claude, codex, deepseek-harness `dsh`, opencode, qwen, copilot, amp, pi, kiro, kilo, vibe, devin, hermes, kimi, antigravity, qwen …) share one generic detection/launch/invocation/stream engine. Adding a CLI is one file + registry array insert; no class override. Source: `docs/agent-adapters.md` §1–3

### 7.4 Critique loop — where rendering meets judgment

The rendering loop is not just paint-then-preview; it is paint → **judge** → revise. Three interlocking layers enforce the judge:

- **Pre-flight skill body + craft injection.** The system prompt stack for every run is: active `DESIGN.md` + `tokens.css` + `USAGE.md` + per-skill `craft/*.md` (only the slugs the skill declared in `od.craft.requires` — so `typography`/`color`/`anti-ai-slop` cost nothing for a non-typographic skill) + the skill's `SKILL.md` workflow + side files (`assets/`, `references/`). The skill body's workflow step that invokes the checklist (`references/checklist.md` P0/P1/P2 gates) is what forces the agent to self-check against the DS before emissive hand-off. Source: `docs/skills-protocol.md` §2 (craft.requires), `craft/README.md` (opt-in + `FUTURE_SECTIONS.md` forward-reference), `docs/architecture.md` §4 step 3, `design-templates/guizang-ppt/SKILL.md` workflow
- **Daemon linter (artifact-level).** `apps/daemon/src/lint-artifact.ts` scans emitted artifacts for P0 anti-slop patterns — e.g., the `AI_DEFAULT_INDIGO` solid-accent set + two-stop hero gradients + emoji-as-icons in `.icon` contexts + serif-bypass on h1/h2 + left-border accent tile + invented metrics. Findings are reported both as UI P0/P1 badges and as a system reminder back into the agent's context for self-correction (persistence is not hard-blocked, so the agent can revise without discarding the write). Source: `craft/README.md` §Enforcement levels + `craft/anti-ai-slop.md`
- **Human-in-the-loop theater + file workspace.** `CritiqueTheaterMount`/`useCritiqueTheaterEnabled` surfaces the judgment above the canvas in Studio; the reviewer can compare buggy-vs-fixed canvases seeded through production HTTP APIs. The product guidance is explicit: *"Stage human verification for visible bugs. When the symptom needs an eye to confirm — UI, platform-native behavior, animations, race conditions — green specs alone aren't acceptance. Stand up a buggy-vs-fix comparison the reviewer can drive themselves (typical shape: two namespaced runtimes, one on `main`, one on the fix branch)."* Source: `AGENTS.md` Dev workflow → Verification, `ProjectView` theater imports

The loop's closure signal is file delivery: the agent's canonical deliverable is a project file the daemon persists under `RUNTIME_DATA_DIR` → `PROJECTS_DIR` (or the imported-folder `metadata.baseDir`). Delivery is coarse: the run's terminal artifact write is the truth the canvas renders — there is no second serialization layer that can contradict the file system. For text-artifact runtimes (no filesystem tools, e.g., BYOK proxy), the canonical deliverable is one complete standalone code fence, not a claimed file write. Source: `docs/architecture.md` §4 Filesystem vs text-artifact execution profiles + `docs/skills-protocol.md` handoff guidance

---

## 8. Figma-alternative positioning — push pixels vs single-page artifacts with DESIGN.md brand contract

### 8.1 The thesis sentence — memorize it

OD's README says the positioning in one paragraph Lokma should keep pinned above its own canvas code:

> OpenDesign is what you get when the **agent-native** loop Anthropic shipped with Claude Design — discover the brief, lock the direction, stream the artifact, critique, deliver — stops being closed and becomes a **filesystem of functional skills, rendering design templates, design systems, and plugins** that the coding agents already on your laptop can read, write, and remix. Your CLI becomes the design engine, your laptop becomes the studio, and your team's `DESIGN.md` becomes the brand contract.

And one sentence below, the Figma claim hardens:

> It's also the **Figma alternative for the agent era** — instead of pushing pixels on a canvas, it delivers **single-page artifacts in real CSS, real fonts, real components, exported straight to HTML / PDF / PPTX / MP4** — already shaped by your **design system**, already runnable inside the agent you use every day.

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/README.md (What is OpenDesign — two opening paragraphs)

### 8.2 What it is really arguing — five contrasts against Figma

| # | Figma (canvas tool) | OD / Lokma-want artifact tool |
|---|---------------------|-------------------------------|
| 1 | Canvas you push pixels on (vector fills, auto-layout, freeform composition) | Filesystem artifact you generate with an agent — single-page HTML/JSX/Markdown/MP4 + optional ZIP export |
| 2 | Design tokens are plugin state (Tokens Studio, Style Dictionary export) | Design tokens are ** prose + compiled tokens** — `DESIGN.md` is prompt input, `tokens.css` is the compile target — both read by the agent at render time |
| 3 | Components are Figma component instances on a canvas | Components are **HTML fixtures wired to semantic CSS variables** — `components.html` plus `components.manifest.json` proves the DS token contract is real |
| 4 | Real fonts live in the Figma renderer; deliverable is a PNG / developer handoff | Real fonts are CDN + `fonts/` assets loaded in the sandboxed iframe — the preview is the deliverable |
| 5 | Collaboration = multiplayer cursors on an infinite canvas | Collaboration = comment-mode anchors on a rendered artifact + preview comments that feed back into the next agent turn |

Aggregated from: README Figma-alternative paragraph + https://raw.githubusercontent.com/nexu-io/open-design/main/CONTEXT.md artifact glossary + https://raw.githubusercontent.com/nexu-io/open-design/main/docs/architecture.md §3.6 + `design-systems/_schema/AGENTS.md` components-manifest contract

### 8.3 Why "Figma alternative" is not "Figma clone"

OD is careful with this hedge, and Lokma should adopt it verbatim rather than claiming Figma parity:

- The differentiation spec (`docs/spec.md` Core bets table) compares OD not to Figma but to Claude Design and Open CoDesign — budgets 1–5: where the product runs, who owns the agent loop, what "design skills" are, how design systems are authored, and the extension point (drop a folder vs vendor PR). Figma appears as a cultural anchor, not an implementation sibling.
- A distinct one-liner in the repo: *"Single-page artifacts … already shaped by your design system, already runnable inside the agent you use every day."* The operative adjective is **runnable** — the artifact is real rendered HTML, not a spec handed to engineers; the agent that made it can keep iterating it.
- "Figma alternative for the agent era" is positioned opposite Figma's vector-canvas + Dev Mode hand-off model — the claim is: for the brief → direction lock → STREAM the artifact → critique → deliver loop, the right canvas is HTML, not a vector stage. Source: `docs/spec.md` §2 + README pair

### 8.4 The brand contract — DESIGN.md as the non-negotiable opposite of a theme

- **Not a theme switcher:** The gallery page warns against a literal theme interpretation:

  > A CSS theme is a build artifact — colors compiled into custom properties, consumed by stylesheets. `DESIGN.md` is a prompt input — an AI agent reads the prose at render time and uses it as a constraint set. Same goal (consistent design output); different mechanism (post-build override vs pre-render guidance).

  Source: https://opendesigner.io/design-systems FAQ
- **Provenance honesty:** The gallery FAQ also discloses editorial reconstruction:

  > These are our editorial reconstructions, written by reading each brand's public marketing, design-blog posts, and rendered UI, then encoding the patterns into a 9-section DESIGN.md. They are accurate enough to produce visually convincing renders, but they are not official, endorsed, or affiliated.

  Source: same FAQ; same hedge appears in `design-systems/README.md` Attribution
- **Switching is live:** *"Switch system, the next render uses new tokens."* The DS picker exists in both Home (pre-run selection) and Studio header (re-render without project reset). Source: gallery pitch + `ProjectView` picker handler
- **One active DS per project:** The gallery FAQ is explicit: `Not within a single artifact. One active DS per project. You can have multiple projects in your `.od/projects/` each with their own active DS.` — mixing two DS within one artifact is declared unreliable on purpose. Source: same FAQ
- **No theme shuffle inside the render:** The artifact-level caution is the inverse: *"You can have multiple projects in your `.od/projects/` … better to render twice with two systems and compare."* Source: same FAQ

### 8.5 The one-sentence competitive map Lokma should echo

From `docs/references.md`, OD locates itself:

- **Claude Design (Anthropic):** closed, Anthropic-only models, no self-hosting, defines the category (viral ~60M X impressions week 1). What OD borrows: the natural-language → editable visual value prop + modes + inline-editing patterns. What it rejects: closed source, model router, paid-tier lock-in.
- **Open CoDesign (OpenCoworkAI):** main MIT Electron rival — React 19 + Vite + Tailwind v4 + `pi-ai`; 12 design skill modules; sandboxed iframe preview; exports HTML/PDF/PPTX/ZIP/MD; 15 templates; comment mode + sliders + multi-frame. What OD borrows: comment mode, tweak sliders, multi-frame preview, sandboxed iframe. Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/references.md (Primary references, Anthropic Claude Design + Open CoDesign entries, synthesized)

Lokma's version of this paragraph is: "Lokma is the terminal-first, themeable harness that delivers the same category — just with swappable engines and a DESIGN.md contract instead of a closed model router."

---

## 9. How Lokma should copy — DESIGN.md per project, themes/*.json → DESIGN.md tokens, Studio-like pane

This section translates the OD findings into Lokma-specific build instructions. Each sub-section states what to **lift**, what to **adapt** (Lokma already ships `themes/*.json` parity across CLI + Web — OD does not), and what to **avoid**.

### 9.1 DESIGN.md per project — the primitive to port 1:1

#### What OD proves

- Discovery: daemon reads `design-systems/<slug>/{manifest.json, DESIGN.md, tokens.css}` at request time (re-scans on every `/api/design-systems` request), user-writable shadow over bundled, no restart required. Source: `docs/architecture.md` §3.4, `design-systems/README.md`
- Composition: at run time the daemon composes the active DS package (`DESIGN.md` + `tokens.css` + `USAGE.md` + craft requires) into the system prompt above the selected skill/template body, and stages skill/template side files under `.od-skills/<alias>/` as real copies with absolute-path fallback so every agent can resolve `assets/template.html` + `references/*.md`. Source: `docs/agent-adapters.md` §4, `docs/architecture.md` §4, `docs/skills-protocol.md`
- Governance: guard validates manifest parity, token-schema layers (A1/B/C), prose/token sync, `components.manifest.json` coherence, and `seven substantive H2` minimum (no fixed numbered headings). Source: `design-systems/_schema/AGENTS.md`, `docs/design-systems.md`
- Authoring: one file, one restart (gallery refresh), one `pnpm guard` + `pnpm typecheck` pass — low ceremony enough to fork. The cheapest authoring path is fork an existing DS: copy `design-systems/editorial/` → `design-systems/your-brand/`, edit `DESIGN.md` (change `manifest.id`, colors, type stack, voice, anti-patterns), edit `tokens.css` to match, refresh. Source: gallery + design-systems/README guidance

#### What Lokma lifts exactly

- **One DESIGN.md per Lokma project** — store at `project/.lokma/DESIGN.md` or project root `DESIGN.md` (choose one and commit). Lokma's daemon/loop composes that file around every turn the way OD composes its DS package. The AGENTS.md/DESIGN.md distinction VoltAgent teaches maps well to Lokma: `AGENTS.md` for build constraints, `DESIGN.md` for look-and-feel constraints.
- **Manifest parity:** add `design-systems/<slug>/manifest.json` equivalent if Lokma wants a gallery — but even for a single project's DESIGN.md, carry the `source.type` provenance field (at minimum `source: { type: "local" }`).
- **Seven-H2 bar:** enforce the relaxed OD bar for Lokma's DESIGN.md linter rather than demanding the historical 9-numbered headings. Seven is what the guard actually enforces today; it keeps editorial richness available without penalizing terser systems like Linear.
- **Staging:** if Lokma skills reference `assets/` or `references/`, copy the active DS + skill directories into `.lokma-skills/<alias>/` equivalent before spawning — don't symlink, and advertise both the relative + absolute fallback in the preamble. OD hit real cross-filesystem symlink issues; Lokma should skip learning this the hard way. Source: `docs/agent-adapters.md` §4, `docs/architecture.md` §3.4

#### Lokma-specific adaptation: imported-folder projects

OD has an imported-folder exception — user-selected `metadata.baseDir` can escape `PROJECTS_DIR`. If Lokma honors imported folders, the DS lookup must follow that: resolvable DS paths belong under `RUNTIME_DATA_DIR` for managed projects, and under `metadata.baseDir` for imported-folder projects — the same split the daemon already makes for file operations. Source: `AGENTS.md` Daemon data directory contract + `docs/architecture.md` §3.5

### 9.2 themes/*.json → DESIGN.md tokens — the Lokma-special bridge

Lokma already ships a property OD does not — theme parity with one source: `themes/*.json` for CLI + Web (e.g., `omp`, `claude`, `midnight`, `paper`) as described in `Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md` + Lokma docs inventory (`Docs/12-HARNESS-MIMARI-...`). OD's ships are two files per brand — prose `DESIGN.md` + compiled `tokens.css` + derived `design-tokens.json`/`tailwind-v4.css`. Lokma's bridge should therefore be:

```text
themes/*.json  (Lokma's CLI+Web theme tokens — one JSON source, two surfaces)
      │  compile (project init, or `lokma theme set <name>` handler)
      ▼
project/.lokma/DESIGN.md  +  project/.lokma/tokens.css
      │  daemon prompt composition + canvas preview
      ▼
generated artifact (HTML/JSX that actually binds var(--accent)/var(--bg)/var(--font-display))
```

Concrete rules:

1. **Single JSON drives two artifacts:** Write a `lokma-tokens` compile step that emits `DESIGN.md` (§§Color→Anti-patterns skeleton) + `tokens.css` (`:root` with A1/B/C-layer variables). Don't maintain two sources of truth. The JSON's color roles already encode `primary`, `surface`, `body`, `accent`; the compiler enriches them with DESIGN.md prose (taste annotations, anti-patterns — purple gradients, emoji icons, auto-scale, bouncy easings — plus voice + brand as generic first-skeleton text). Source: OD's `DESIGN.md`↔`tokens.css` sync rule in `docs/design-systems.md` §3–4, Lokma's theme token inventory.
2. **Token parity aligned to OD's layers:** Mirror OD's four-layer discipline inside the JSON → compiled pair:
   - **A1 (required):** `--bg`, `--fg`, `--accent`, `--font-display` must be present in the JSON and derived files — guard fails without them.
   - **A2 (fallback):** `--motion-fast`, `--success`, `--space-*`, `--font-mono` may use defaults from a shared `defaults.css`-like fallback; register these defaults explicitly so reviewers see the parity contract. Source: `design-systems/_schema/AGENTS.md` ("Four layers, two questions" + defaults parity guard).
   - **B-slot (shared aliases):** emit `var(--sibling)` collapsed bindings when Lokma has no opinion (`--fg-2: var(--fg)`, `--surface-warm: var(--surface)`), or independent values when Lokma is richer — must be declared, not silently omitted.
   - **C-extensions:** brand-specific extensions (`--tag-bg-*` families, product-specific tag colors, graph palettes) go behind `BRAND_EXTENSIONS` / prefix allowlists, not ad-hoc hex.
3. **Anti-theme-shuffle guard:** Lokma inherits OD's theme-engine warning verbatim. `themes/*.json` compile does not hot-swap during a single artifact — switching `lokma theme set omp` generates the next render's DS; it doesn't repaint the current preview. Make this visible in the Lokma header (active theme chip = gallery-style switcher that triggers re-render, not CSS hot-swap).
4. **No invention during compile:** When Lokma's JSON doesn't know a number, compile to a labelled placeholder (`—` or grey block) rather than fabricate metrics, and forbid the hard-coded indigo fallbacks with the `AI_DEFAULT_INDIGO` set checked by the artifact linter (`#6366f1`, `#4f46e5`, `#4338ca`, `#3730a3`, `#8b5cf6`, `#7c3aed`, `#a855f7`). Source: `craft/anti-ai-slop.md` cardinal sins + `apps/daemon/src/lint-artifact.ts`.

### 9.3 Studio-like pane — the layout Lokma should build (conversation + files + preview)

OD's Studio is the hardest pattern to copy because it is four files of state held in sync, not just a layout. The minimum Lokma pane that earns "Studio-like" status is a **three-pane workspace** wired as follows (names mirror `ProjectView.tsx` so the Lokma PR diff is legible to an OD reviewer):

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Lokma Header — project title chip (type = prototype/deck template/...),      │
│ active DESIGN.md / theme picker, model picker, collab presence, share/export │
├──────────────┬────────────────────────┬──────────────────────────────────────┤
│ Conversation │ Files                  │ Preview (sandboxed iframe)           │
│ (ChatPane)   │ (FileWorkspace)        │ (IframeKeepAlivePool)                │
│              │                        ├──────────────────────────────────────┤
│  streaming   │  tabs + auto-open      │ Inspector: selected element →        │
│  SSE events  │  produced files +      │ comment mode / palette / tweak       │
│  thinking /  │  live artifacts        │ sliders fed back as chat attach.     │
│  tool-call / │  DESIGN_SYSTEM_TAB     │                                      │
│  tool-result │  + normal artifact     │ Deck: thumbnails + speaker notes +   │
│  text deltas │  manifest + entry file │ export (HTML/PDF/PPTX).              │
│              │                        │ Mobile: device-framed frame.         │
├──────────────┴────────────────────────┴─────────────────┬────────────────────┤
│ Agent run controls — resume / cancel / retry, balances,│ Critique Theater   │
│ todos, first-artifact hint, recovery analytics          │ (P0/P1/P2 badges)  │
└────────────────────────────────────────────────────────┴────────────────────┘
```

#### Conversations pane (Chat) — what to lift

- `ChatPane` + `ChatComposer` backed by `streamViaDaemon` (SSE) + `useProjectFileEvents` + `appendBufferedAgentDeltas` coalescing (avoid chat jitter by batching content/thinking deltas into one flush). Source: `ProjectView.tsx` imports + `docs/architecture.md` §4
- Non-negotiable: the assistant's filesystem handoff ends with a summary of files written — no duplicate source-in-markdown-fence — while text-artifact runtimes (BYOK/plain) emit one complete standalone fenced block. Enforce this via the handoff contract in the guard, not per-skill convention. Source: `docs/architecture.md` §4 + `docs/skills-protocol.md` handoff note
- Include `@` mention resolution for per-turn additional skillIds and the question-form lock before paint (the turn-1 brief lock OD's landing hero emphasizes). Source: `ProjectView` question-continuation strategy imports + product hero

#### Files pane (Workspace) — what to lift

- Allocate canonical files through `FileWorkspace` + `workspaceTabsDock` + `OpenTabsState` (tabs, active, hidden) + `IframeKeepAlivePool`. Auto-open through `auto-open-file.ts` (`selectAutoOpenProducedArtifact` / `decideAutoOpenAfterWrite`) — the artifact the agent just produced must open automatically without user action. Source: `ProjectView.tsx`
- Distinguish three file kinds at the manifest layer (from `CONTEXT.md`):
  - **Project** → contains **Normal Artifact**(s) → each has **Artifact Entry File** (the rendered file) + **Artifact Manifest** (sidecar with kind/renderer/exports). Source: https://raw.githubusercontent.com/nexu-io/open-design/main/CONTEXT.md Relationships
  - **Live Artifact** — refreshable, data-bound artifact type (dashboard/KPI with tweak manifests, data.js/data.json). Belongs to the project, not normal, and carries its own preview state.
  - Imported-folder projects: `metadata.baseDir` is the workspace (don't copy into managed `PROJECTS_DIR`).
- Persist tabs via locally cached `OpenTabsState` + daemon `tabs` load/persist parity (avoid tabs vanishing on reload). Source: `ProjectView.tsx` (`loadTabs`, `cacheTabsLocally`, `persistTabsToDaemonNow`)
- Add the `DESIGN_SYSTEM_TAB` special tab for design-system projects (acts as the editable DS surface inside Studio). Source: same component
- Emit a post-write `def.produced` signal the auto-opener can consume — OD's file write side-channel is one of the reasons Streaming + Preview feels alive.

#### Preview pane (Canvas) — what to lift

- Mount both a `srcDoc`-bridge frame and a `URL` frame behind `IframeKeepAlivePool` so render-mode switches don't flash. Bridge frames enable comment selection, palette nudges, and tweak sliders with message validation; URL frames cover large artifacts where `srcDoc` is wasteful. Source: `docs/architecture.md` §3.6 + `file-viewer-render-mode.ts`
- Sandboxed iframe, bounded to `RUNTIME_DATA_DIR` (or `metadata.baseDir`) for URL loads; `/artifacts/*` is daemon-served and proxied through the web surface. Source: `AGENTS.md` daemon data contract + `docs/architecture.md`
- Real CSS/fonts/components discipline per the section above (semantic vars, CDN-wired fonts, `components.html` proof-level fixtures). Don't collapse the DS to a prettified `<style>` block — wire tokens as custom properties so the agent's next revision can change them without regeneration.
- Deck, Mobile, Document, Image, HyperFrames as distinct Studio renderers under one page (not separate apps) — route by `ProjectMetadata.kind` / `SkillSummary.mode` and isolate thumbnail/speaker-notes/device-frame affordances per type. Source: README Demo §1–5 + `docs/modes.md`

#### Critique overlay + loop closure

- Render `CritiqueTheaterMount` over the preview with P0/P1/P2 badges sourced from the artifact linter + the skill checklist. Feed findings back to the next turn as a system reminder (not a blocking error) so the agent loop self-corrects. Include the "buggy vs fix twin-runtime" smoke pattern for visual bugs — this is what separates a themeable app from a harness that can verify design. Source: `craft/README.md` enforcement levels + `AGENTS.md` verification guidance + `ProjectView` theater import

### 9.4 Anti-patterns to copy to avoid

- Purple-to-blue two-stop "trust" hero gradients (P0 failure)
- Emoji as feature icons inside `.icon`/`button`/`span` contexts — require 1.6–1.8px `currentColor` monoline SVGs (P0)
- Horsing serif on display text — bind h1/h2 to `var(--font-display)` (P0)
- Rounded card with colored left-border accent — drop radius or border (P0)
- Invented metrics / filler copy / placeholder CDNs (`unsplash`/`placehold.co`) (P0)
- `var(--accent)` overuse (cap at 2 visible uses per screen) + >12 raw hex outside `:root` (P1 guidance)
- Decorative blob/wave SVG backgrounds + perfect symmetry without tension (P2 nice-to-fix). Source: `craft/anti-ai-slop.md` §The seven cardinal sins + P1/P2 tells

### 9.5 Minimal Lokma build order (the ordered checklist)

1. **Claim the primitives:** Add `AGENTS.md` ("how to build") + `DESIGN.md` ("how to look") to the Lokma docs — copy VoltAgent's distinction verbatim so every command author knows which file answers which question. Source: VoltAgent table.
2. **Ship the bridge:** Build `themes/*.json` → `DESIGN.md` + `tokens.css` compile step + guard (seven-H2 lint + token A1/B parity + `AI_DEFAULT_INDIGO`/anti-slop guard). Reuse OD's `lint-artifact.ts` discipline rather than inventing new checks.
3. **Build the 3-pane Studio:** conversation (SSE + coalesced deltas + auto-summarize handoff), files (`OpenTabsState` + `IframeKeepAlivePool` + auto-open), preview (sandboxed iframe with srcDoc + URL + bridge). Route by `kind`/`mode` so deck/mobile/document/image/hyperframe reuse the same workspace.
4. **Wire the catalog surfaces:** Home (brief → chip rail → kind/DS/model picker), Plugins (skill/template gallery over `/api/skills` + `/api/design-templates`), Design System (extract/refine/preview), Studio (header DS switcher + comment anchors + critique theater). Keep the re-scan-per-request behavior for a first version — no watcher.
5. **Hardcode taste at first, scale later:** Bundle 2 starter DS (Neutral Modern / Warm Editorial mirrors — the same pair OD and the gallery ship) + `guizang-ppt` (MIT, verbatim) + `html-ppt` (36 themes / 14 templates) + `dating-web` (prototype reference) as the v1 baseline. Each carries `DESIGN.md` prose + `tokens.css` tokens + `references/checklist.md` P0 gates + `example.html` hand-built sample. After v1, grow the catalog via `scripts/sync-design-systems.ts`-style upstream sync + local/ GitHub / shadcn importers.
6. **Ship the voice discipline:** Sample anti-patterns lists already — across the bundled DS, *"No purple"* appears in Linear/Stripe/Apple independently as defense against the same failure mode. Keep the blog quote above that join as a Loki-maintainer memo. Source: blog anti-patterns closing paragraph.

---

## 10. Appendix — file tree, key routes, package manifests, references & URLs

### 10.1 Canonical file trees

**Bundled design system (minimum):**

```text
design-systems/<your-brand>/
├── manifest.json          # id, name, category, description, source.type, files:{design,tokens}
├── DESIGN.md              # ≥7 substantive H2s, prose/token sync, voice + anti-patterns present
└── tokens.css             # :root with A1-requires + A2 fallbacks + B-slot aliases
```

**Rich bundled design system:**

```text
design-systems/<your-brand>/
├── manifest.json
├── DESIGN.md
├── tokens.css
├── USAGE.md               # H2s: Read Order, Design Highlights, Do, Avoid
├── components.html        # ≥4 groups × ≥10 selectors, ≥8 token refs
├── components.manifest.json
├── design-tokens.json
├── tailwind-v4.css
├── assets/                # brand assets (logos, icons)
├── fonts/                 # webfonts when evidence provides them
├── preview/               # ≥3 preview pages (colors / typography / spacing coverage)
└── source/                # importer evidence + token-contract reports
```

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md §1 + https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md + https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/_schema/AGENTS.md

**Design template / functional skill (both use SKILL.md base format):**

```text
design-templates/<id>/    # rendered shape — browsed via /api/design-templates
skills/<id>/              # utility capability — browsed via /api/skills
├── SKILL.md              # YAML frontmatter (name, description, triggers, od.mode/craft/critique…) + body
├── assets/               # templates/images/boilerplate the skill writes (e.g., guizang-ppt's template.html + motion.min.js)
└── references/           # knowledge the agent reads when planning (e.g., layouts.md, themes.md, checklist.md)
```

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md §1–3 + https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/AGENTS.md + https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/guizang-ppt/SKILL.md

**Daemon data root (as Loki should reference it, not copy it):**

```text
# Never hardcode a path — read AGENTS.md section "Daemon data directory contract"
apps/daemon/src/server.ts  resolves  OD_DATA_DIR → RUNTIME_DATA_DIR
                            then derives  PROJECTS_DIR, ARTIFACTS_DIR, SQLite, etc.

Imported-folder projects: metadata.baseDir escapes RUNTIME_DATA_DIR (explicit exception).
```

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/AGENTS.md §Daemon data directory contract

### 10.2 Key routes and what they read/write

- `/api/design-systems` — re-scans `design-systems/` + user roots, merges catalog; reads `manifest.json` or fallback `DESIGN.md` H1/`> Category:`; composition reads `DESIGN.md` + `tokens.css` + `USAGE.md` + `components.*` + preview/source.
- `/api/design-templates` + `/api/skills` — parallel endpoints (same `SkillSummary` type) over separate registries; both re-scanned per request; user shadows bundled.
- `/api/projects` / `/api/projects/:id/chat` (`streamViaDaemon` SSE) — spawns runtime CLI with project cwd + composed skill/DS context, streams normalized events, persists file writes via project file routes, triggers auto-open.
- `/api/preview` / `/artifacts/*` / preview static routes under daemon — serve `preview/` + `assets/` + `fonts/` + `source/` only when declared in manifest; static file apps expose only declared preview/source paths (no broad fs).
- `od design-systems import-*` CLI family (`import-local`, `import-github`, `import-shadcn`, bulk `scripts/sync-design-systems.ts`) — importers write the package contract, not loose markdown.
- `/api/canvas`-adjacent component contracts: `apps/web/src/components/file-viewer-render-mode.ts` (srcDoc vs URL), `apps/daemon/src/lint-artifact.ts` (anti-slop), `apps/web/src/components/ProjectView.tsx` (Studio composition), `apps/web/src/components/HomeView.tsx` / `NewProjectPanel.tsx` (creation kinds + chip rail).

Source: `docs/architecture.md` + `docs/skills-protocol.md` + `docs/modes.md` + `design-systems/_schema/AGENTS.md` synthesized

### 10.3 Frontmatter grammar excerpt (portable + OD extensions)

Base (Claude Code spec, unchanged in OD):

```yaml
---
name: magazine-web-ppt
description: "One paragraph trigger description the agent matches on"
triggers: ["magazine deck", "horizontal swipe presentation", "杂志风 PPT"]
---
```

OD extensions (optional, all prefixed `od:`):

```yaml
od:
  mode: deck                       # prototype | deck | template | design-system | image | video | audio
  surface: web                     # web | image | video | audio
  scenario: marketing              # filter hint (gallery grouping)
  design_system: { requires: false } # compose active DS into prompt?
  craft: { requires: [typography, color, anti-ai-slop] } # brand-agnostic injects
  critique: { policy: opt-in }     # required | opt-in | opt-out
  preview: { type: html }          # html | jsx | markdown | pptx
  example_prompt: "A copy-pastable starter prompt"
```

Source: https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md §2 OD extensions + https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/guizang-ppt/SKILL.md frontmatter

### 10.4 Reference URL inventory

- Repo root: https://github.com/nexu-io/open-design
- Raw docs used above:
  - https://raw.githubusercontent.com/nexu-io/open-design/main/docs/design-systems.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/docs/architecture.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-contributing.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/docs/modes.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/docs/agent-adapters.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/docs/spec.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/docs/references.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/CONTEXT.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/AGENTS.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/README.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/_schema/AGENTS.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/design-systems/_schema/tokens.schema.ts
  - https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/AGENTS.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/design-templates/guizang-ppt/SKILL.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/craft/README.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/craft/anti-ai-slop.md
  - https://raw.githubusercontent.com/nexu-io/open-design/main/apps/web/src/components/ProjectView.tsx (also: file-viewer-render-mode.ts)
- VoltAgent lineage:
  - https://github.com/VoltAgent/awesome-design-md
  - https://github.com/VoltAgent/awesome-design-md?tab=readme-ov-file
  - https://github.com/VoltAgent/design-md
  - https://github.com/VoltAgent/official-design-md
  - https://stitch.withgoogle.com/docs/design-md/specification/
  - https://stitch.withgoogle.com/docs/design-md/overview/
  - https://getdesign.md/vercel/design-md
  - https://getdesign.md/what-is-design-md
  - https://explainx.ai/designs/voltagent-awesome-design-md/vercel/design-md
- Guizang / html-ppt:
  - https://github.com/op7418/guizang-ppt-skill
  - https://raw.githubusercontent.com/op7418/guizang-ppt-skill/main/SKILL.md
  - https://github.com/nexu-io/open-design/tree/main/design-templates/guizang-ppt
  - https://open-design.ai/blog/guizang-ppt-skill/ (adjacent)
  - https://pyshine.com/Guizang-PPT-Skill-Magazine-Style-HTML-Decks-Claude-Code
  - https://knightli.com/en/2026/05/09/guizang-ppt-skill-huashu-design-agent-skills
  - Skill spotlight: https://opendesigner.io/
- Catalog / blog narrative:
  - https://opendesigner.io/blog/design-md-9-section-schema-explained
  - https://opendesigner.io/design-systems
  - https://opendesigner.io/ (home — plugin/architecture spotlight)
  - Alternative desktop mirror: https://github.com/KwokJay/open-design-desktop/blob/main/QUICKSTART.md
  - Dated attribution mirror: https://github.com/nullmastermind/open-design-npm/blob/main/QUICKSTART.md

### 10.5 Notes for the next Lokma write pass

- If huashu-design's exact "5 dimensions" phrasing is needed as a verbatim block-quote (e.g., for a slide deck appendix), gate that pass behind an explicit `EXA_API_KEY` fetch against `alchaincyf/huashu-design` README/SKILL.md rather than re-deriving — the repo did not return content during this run's raw-fetch pass (404 on attempted main-branch paths). The critique mapping above is the OD-shipped correlate; label it as derived until that gate is cleared.
- The `html-ppt` 15-deck / 36-theme matrix cited in the task is the guizang-adjacent deck skill family described in the product-site skill spotlight. The directory tree extract on the guizang-design-templates page and the `opendesigner.io/` "One skill. 36 themes, 31 layouts, 47 animations, 14 deck templates." card are the canonical count sources; lock them as numbers Lokma can cite in its own Docs the next time it drafts a competitive deck table.
- Keep `themes/*.json` as the Lokma-public token contract — do not leak `DESIGN.md`-as-theme confusion. Match OD's gallery FAQ wording when a reviewer asks "can I use a theme on top of a design system?" — answer: a theme *is* a DESIGN.md after compile — one active DS per project, re-render to switch, no mixing inside one artifact.

---

*End of raw research. This file is the verbatim reference synthesis before editorial rendering into Lokma Docs (`Docs/`) — keep it as-is and append deltas underneath rather than rewriting.*
