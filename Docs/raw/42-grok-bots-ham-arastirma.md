# Grok Bots — Deep Research Dossier for Lokma Bots Plan

> **Purpose:** The user reports Hermes now has "bots" like Grok bots and wants a Lokma Bots plan inspired by it. This raw research file documents everything discoverable about Grok bots (xAI) as of August 2026 — what they are, how to create them, how they are discovered/used, how they differ from single-agent chat, pricing/limits, and flows/screenshots described in docs. All claims are cited with URLs. Written 2026-08-31.

> **Primary sources scraped for this file:**
> - https://x.ai/bot — Grok Bot marketing/landing page
> - https://x.ai/news/introducing-grok-bot — Aug 11 2026 launch post
> - https://x.ai/news/grok-bot-more-plans — Aug 26 2026 expansion post
> - https://docs.x.ai/grok-bot/overview — Overview docs
> - https://docs.x.ai/grok-bot/get-started — Get-started docs
> - https://docs.x.ai/grok-bot/bots — Create and manage Bots
> - https://docs.x.ai/grok-bot/chat-and-collaboration — Message and collaborate
> - https://docs.x.ai/grok-bot/computer-and-apps — Computer and apps
> - https://docs.x.ai/grok-bot/skills-routines-and-automations — Skills and routines
> - https://docs.x.ai/grok-bot/files-and-results — Files and results
> - https://docs.x.ai/grok-bot/settings-and-notifications — Settings and notifications
> - https://docs.x.ai/grok-bot/approvals-security-and-privacy — Approvals, security, privacy
> - https://docs.x.ai/grok-bot/teams-and-enterprises — Teams and enterprises
> - https://docs.x.ai/grok-bot/faq — FAQ
> - https://docs.x.ai/grok-bot/use-cases — Use cases
> - https://grok.com/faq — grok.com FAQ (Grok website/apps)
> - https://grok.com/skills — Grok Skills page (via extraction)
> - https://grok.com/release-notes — Grok Release Notes
> - https://cursor.com/help/grok-bot/getting-started — Cursor help: getting started
> - https://cursor.com/help/grok-bot/plans — Cursor help: plans and billing
> - https://x.ai/pricing — xAI pricing table
> - https://x.ai/bot/use-cases — Grok Bot use-cases marketing page
> - https://x.ai/bot/guides/designing-grok-bot-with-grok-bot — Design guide
> - https://bot.store/ — Bot Store (third-party app store for Grok Bots, independent)
> - https://github.com/rdmgator12/awesome-grok-bot-plugins — Independent catalog of Grok Bot plugins (219 listings, 2026-08-12 snapshot)
> - Secondary articles: TechWiser "Grok's New Customize Feature" (2025-02-05), Blutrumpet "How to Change Grok's Response Style" (2026-03-15), MindStudio Grok Bot setup guide, RuntimeWire marketplace note, CellCog pricing explainer.

---

## Table of Contents

1. [Executive Summary: Two Different "Grok Bots" Meanings](#1-executive-summary-two-different-grok-bots-meanings)
2. [What Grok Bot (xAI, Aug 2026) Actually Is](#2-what-grok-bot-xai-aug-2026-actually-is)
3. [The grok.com / X Legacy "Customize Grok" — Not Grok Bot](#3-the-grokcom--x-legacy-customize-grok--not-grok-bot)
4. [Anatomy of a Grok Bot (Per-Bot Personality, Memory, Tools, Computer)](#4-anatomy-of-a-grok-bot-per-bot-personality-memory-tools-computer)
5. [How a User Creates a Bot — Bot Builder Flow](#5-how-a-user-creates-a-bot--bot-builder-flow)
6. [Bot Store / Marketplace & Discovery](#6-bot-store--marketplace--discovery)
7. [How Bots Are Used Day-to-Day (Chat, Switching, Groups, Handoffs)](#7-how-bots-are-used-day-to-day-chat-switching-groups-handoffs)
8. [Skills, Routines, and Teach-by-Demonstration](#8-skills-routines-and-teach-by-demonstration)
9. [How Grok Bots Differ from Single-Agent Chat](#9-how-grok-bots-differ-from-single-agent-chat)
10. [The Shared Computer — Architecture Detail](#10-the-shared-computer--architecture-detail)
11. [Pricing, Plans, Quotas & Limits](#11-pricing-plans-quotas--limits)
12. [Security, Approvals & Privacy Boundaries](#12-security-approvals--privacy-boundaries)
13. [Teams & Enterprise — Admin View](#13-teams--enterprise--admin-view)
14. [Platform Support & Availability](#14-platform-support--availability)
15. [Screenshots & Flows Described in Docs/Marketing](#15-screenshots--flows-described-in-docsmarketing)
16. [Use Cases Catalog (What Teams Actually Run)](#16-use-cases-catalog-what-teams-actually-run)
17. [Gaps, Criticisms & Open Questions](#17-gaps-criticisms--open-questions)
18. [Mapping to Lokma Bots — Explicit Inspiration Points](#18-mapping-to-lokma-bots--explicit-inspiration-points)
19. [Appendix A: Key Doc Snippets (Verbatim)](#19-appendix-a-key-doc-snippets-verbatim)
20. [Appendix B: URL Index](#20-appendix-b-url-index)

---

## 1. Executive Summary: Two Different "Grok Bots" Meanings

There are **two** distinct things people call "Grok bots" in 2025–2026, and conflating them breaks product planning:

**A) Grok Bot (xAI × Cursor, launched Aug 11 2026, early beta)** — This is the flagship "AI teammates you can give real work to." Each Bot is a **durable, named AI teammate** with its own conversation, memory, and working context that lives on a **persistent cloud computer** (Linux VM with browser, filesystem, terminal). Bots can sign into tools and websites as a human would (including sites with no API), keep working 24/7, collaborate with other Bots via DM and group chat, and learn workflows as reusable skills/routines. This is the product documented at `docs.x.ai/grok-bot/*`, `x.ai/bot`, and `cursor.com/help/grok-bot/*`. The team behind it is xAI + Cursor (Anysphere), and the metaphor in all first-party material is "teammates," not "custom GPTs" [x.ai/bot](https://x.ai/bot) [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot) [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)

**B) grok.com "Customize Grok" / Custom Instructions & Companions** — The earlier (Feb 2025+) personalization layer inside `grok.com` and the Grok apps. Two fields: "What would you like Grok to know about you?" and "How would you like Grok to respond?" plus presets (Concise / Formal / Custom), plus iOS-only animated "Companions" (3D avatars with personalities) announced Aug 2025. This is closer to OpenAI's Custom Instructions / GPTs memory, not a cloud-computer teammate [TechWiser — Grok's New Customize Feature](https://techwiser.com/groks-new-customize-feature-get-personalized-ai-responses/) [Blutrumpet — How to Change Grok's Response Style](https://www.blutrumpet.com/post/change-grok-response-style-personality)

**Why this matters for Lokma:** If the brief says "Hermes now has 'bots' like Grok bots," it almost certainly means model **A**. But many web articles still use "Grok bots" to mean **B**. The research below separates them and focuses on **A**, with a short section on **B** for completeness.

> **Terminology note:** In docs and in the Grok Bot app, "a Bot = a single persistent, named agent or one AI teammate." The docs are explicit about this equality [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)

---

## 2. What Grok Bot (xAI, Aug 2026) Actually Is

### 2.1 One-sentence definition

> "Bots are AI teammates you can give real work to. Bots can sign and use apps and websites just like you do on a persistent cloud computer. They can collaborate independently, passing context between each other and handing off tasks, and understand the nuances of how you like work done over time. They finish jobs end to end, and only come back when something needs your approval." — Overview page headline [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)

The marketing page repeats: "AI teammates you can give real work to. Bots can sign in to your tools, use them just like you do, and come back with finished work." [x.ai/bot](https://x.ai/bot)

The launch post (Aug 11 2026) adds: "Grok Bot is your team of always-on agents. They have their own computer, work inside tools and apps like you do, and keep working 24/7." [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)

The consumer FAQ (grok.com/faq) cross-references: "Grok Bot gives you durable AI teammates on a persistent cloud computer — messaging, approvals, connectors, and routines. It is not the same as Grok on grok.com or the Grok mobile apps." [grok.com/faq](https://grok.com/faq)

### 2.2 The five differentiators xAI lists

From the Overview docs' "What makes Grok Bot different" box [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview):

1. **It has a computer of its own.** Each Bot runs on a persistent cloud VM with browser, filesystem, terminal. Connectors/MCP where available; computer-use where not, so "work finishes in the real tools rather than as chat drafts."
2. **It is very easy to get started.** Create a Bot, message it, grant access as needed. "No workflow builder or prior Bot setup required." Same Bot reachable from desktop and iOS.
3. **It coordinates independently with other Bots.** Multiple Bots share one user-scoped computer and can run in parallel. They can message each other, share context in threads/group chats, pass ownership "so you are not the router between tools."
4. **It can learn workflows from live demonstration.** "Ask a Bot to follow along once through a multi-step or multi-system path. It persists that path as a routine and can re-run it on a schedule or on demand."
5. **It is a persistent, named teammate with durable state.** Named Bots keep memory, files, browser sessions, preferences across turns. "Context compounds instead of resetting to a fresh environment on every task."

### 2.3 The human-teammate framing

All launch material insists on anthropomorphic framing to shape expectations. Internal quotes on the launch post: "There is a huge difference between 90% done and 100% done. Most AI gets you almost there. Grok Bot can finish the swing, because the work lands where a human would put it, in the actual tool." — Roman, Product [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)

"The experience: 'Early access users say Grok Bot feels less like prompting an agent, and more like giving work to a highly capable teammate.'" [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)

The design guide repeats the same language: "Grok Bot gives me a team of always-on AI design agents with their own computers. They have memory, can use tools, and can carry work from an initial idea to a finished artifact. They also keep working while I'm AFK." [x.ai/bot/guides/designing-grok-bot-with-grok-bot](https://x.ai/bot/guides/designing-grok-bot-with-grok-bot)

### 2.4 Product lineage

- Grok (chat at grok.com / X) — the chat assistant.
- Grok Connectors — OAuth tiles inside that chat (Gmail, Drive, Calendar, etc.).
- Grok Build — the local terminal coding agent with its own marketplace (`xai-org/plugin-marketplace`).
- **Grok Bot — the cloud-computer agent team** whose structured integrations live under `Settings → Plugins` and the Cursor Marketplace. The awesome-grok-bot-plugins README is emphatic that these four are different surfaces and should not be conflated [github.com/rdmgator12/awesome-grok-bot-plugins](https://github.com/rdmgator12/awesome-grok-bot-plugins)

---

## 3. The grok.com / X Legacy "Customize Grok" — Not Grok Bot

Because search still surfaces it, document it once and set aside:

- **Customize Grok** launched Feb 2025: a "Customize Grok" control below the input box on grok.com web, opening two free-text fields per TechWiser: (1) "What would you like Grok to know about you to provide better responses?" and (2) "How would you like Grok to respond?" Toggle for per-conversation vs all-conversations, off by default, with Grok choosing when to apply it [TechWiser](https://techwiser.com/groks-new-customize-feature-get-personalized-ai-responses/)
- **Presets:** Blutrumpet guide lists "Concise, Formal, and Custom modes" reachable via account icon → Settings → Customize; Formal strips humor/casual tone, Concise minimizes elaboration [Blutrumpet](https://www.blutrumpet.com/post/change-grok-response-style-personality)
- **Deeper personalization theory:** The same site argues Grok's true customization is multi-layered: system prompt + stored memories + style presets, with Grok-4 / Grok-4 Heavy retaining bold/witty tone unless instructed otherwise [blutrumpet.com — Grok Custom Instructions](https://www.blutrumpet.com/post/grok-custom-instructions)
- **Companions (iOS only):** 3D animated avatars on the Grok iOS app (announced Aug 4 2025 by EONMSK), letting users pick/create a companion personality; web/Android not supported, and docs explicitly say "Are Companions available on the web or Android? No — Companions are available on the iOS app only" [grok.com/faq](https://grok.com/faq) [eonmsk.com — custom companions feature](https://www.eonmsk.com/2025/08/04/xai-grok-bringing-custom-companions-feature-for-personalized-experience/)
- **Relation to Grok Bot:** The grok.com FAQ explicitly scopes them apart: Grok Bot "is not the same as Grok on grok.com or the Grok mobile apps." [grok.com/faq](https://grok.com/faq)

**For Lokma:** This layer is instructive only as an example of *lightweight* per-user personalization (two text fields + presets) vs Grok Bot's *heavyweight* per-Bot durable teammate. Lokma Bots should support both if it can, but the flagship is the teammate model.

---

## 4. Anatomy of a Grok Bot (Per-Bot Personality, Memory, Tools, Computer)

### 4.1 Identity layer (what persists per Bot)

Per the "Create and manage Bots" docs, a Bot has [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots):

- **Name + title + description + avatar** (editable via Bot actions → Edit Profile). The description is the durable system-prompt equivalent: "rules that should remain true." The message thread is for task-specific instructions: "Use the conversation for task-specific instructions. Use the description for rules that should remain true: Description: 'Never send external messages without approval.' Message: 'Draft follow-ups for these twelve accounts.'"
- **Its own conversation / transcript** (messaging thread with tool activity, computer-use, files, questions, approval requests interleaved with normal messages).
- **Working context that develops over time** ("a durable AI teammate with a name, a job, its own conversation, and working context that develops over time").
- **Learned memory:** "A Bot can retain stable working preferences, important facts, and summaries from its work. This helps it keep a role over time without replaying every prior message." Docs warn this is *not* an authoritative source: "Keep changing facts in the source system; Ask the Bot to cite or reopen current data for consequential decisions" [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- **Up to 50 routines owned** and the 20 most recent run records per routine are kept; deleting a Bot also deletes its routines [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

From the Cursor help side: when creating the first agent, users pick "name, shape, color, and title" in the new chat window [cursor.com/help/grok-bot/getting-started](https://cursor.com/help/grok-bot/getting-started)

The Settings → Agent settings for a single Bot expose: Name, title, description, avatar, notifications preference. Execution-on-local-computer and Auto-review are *not* per-Bot — they are per-desktop/shared-computer [docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)

### 4.2 Memory vs files vs browser

Memory is per-Bot and gestural; files/browser sessions are **account-scoped on the shared computer**:

> "Bots have separate roles and conversations, but they share the computer. They can pass context through direct messages, group chats, and shared files." [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
> "All of your Bots share one cloud computer assigned to your user account. Files, browser sessions, and command line credentials on that computer are available across your Bot roster." [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)
> "Each Bot gets its own screen on the shared computer. Several Bots can therefore use browser and desktop tools in parallel, although one Bot can run only one computer-use task on its screen at a time. The screens are separate work surfaces, not separate security boundaries." [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)

So: if any Bot saves to `/workspace`, any other Bot can read it. A login completed for one Bot is available to others via shared cookies. This is intentional for handoffs and also the reason "Do not use separate Bots as a security boundary." [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)

### 4.3 Tools layer: Connectors (Plugins) + browser + local computer + skills

Four tool surfaces a Bot can use:

1. **Connectors / Plugins (structured):** Curated integrations shown as Plugins in the current app under `Settings → Plugins → Marketplace`. After install, `@` attaches a connector to the task, `/` references a saved skill. The catalog is the Cursor Marketplace; the independent `awesome-grok-bot-plugins` repo counted **219 listings on 2026-08-12** across 13 categories (Agent Orchestration, Canvas, Customer Support, Data Analytics, Featured, Finance & Legal, Inbox & Collaboration, Infrastructure, MCP, Payments, Productivity, Sales, Scheduling) [github.com/rdmgator12/awesome-grok-bot-plugins](https://github.com/rdmgator12/awesome-grok-bot-plugins) . Examples: Intercom, Plain, Apollo.io, Clay, Gong, HubSpot, Browserbase, Composio, Figma MCP, etc. Team admins control this via allowlist/denylist and can disable a server team-wide ("Disabled by team admin") [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

2. **Computer-use browser:** For services with no API/MCP. The Bot clicks/types/navigates on its cloud computer's browser. Docs: "Prefer a connector when one is available: it is often more reliable than clicking through a website. Use the browser for services without a connector or for visual workflows a connector does not expose." [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps) The x.ai/bot page emphasizes "including the tools that are harder to navigate" and the intro post lists examples: a sales Bot updating the CRM with call transcript notes, an ops Bot seating new hires and processing Gmail invoices, an engineering Bot reproducing a bug in the product UI [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)

3. **Local computer execution (opt-in):** A Bot can, with permission, run commands on the *user's* local Mac/Windows machine (not the cloud VM). Controlled via `Settings → General → Agent → Execution on Local Computer` with three levels: Never / Ask every time (default) / Always. Every local action goes through Auto-review and shows the exact command in an approval card [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)

4. **Skills & MCP servers:** Skills are reusable instruction packs (see §8). MCP authentication for hosted servers stays with Cursor's backend; "the computer never stores those tokens" [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

### 4.4 Model selection

**No user- or admin-facing model picker exists for Grok Bot.** This is deliberate:

> "Grok Bot has no model picker, for members or admins. We do not plan to allow admin or user choice for models that are used with Grok Bot. Model choice is fully managed by the product. Each request routes to a fixed set of models for its surface, with automatic failover. If your contract limits which subprocessors can handle your data, contact your account team before rolling out Grok Bot." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

Cursor help adds that `Settings → Agent → Default Model` appears "when model selection is available" — implying it may appear for other surfaces but not for Grok Bot in practice [docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)

Billing follows the *actual serving model* shown in usage analytics including failovers [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

### 4.5 Avatar & theming (light but present)

- Edit Profile lets users set avatar image [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- Cursor help adds "shape, color, and title" at creation time [cursor.com/help/grok-bot/getting-started](https://cursor.com/help/grok-bot/getting-started)
- The Bot list shows distinct avatars/colors for at-a-glance Bot identity (visible in marketing video/screenshots on x.ai/bot).

### 4.6 What is *not* per-Bot (shared scope)

- Files under `/workspace`, browser cookies/sessions, CLI credentials — all shared [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- Installed connectors/plugins — account-wide [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- Approval rules (Auto-review) and local-computer policy — per-desktop/computer, not per-Bot [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- The single cloud computer assignment — per *user*, not per Bot [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)

---

## 5. How a User Creates a Bot — Bot Builder Flow

### 5.1 Prerequisites

From Get Started [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started):

- An eligible plan (see §11) — e.g. SuperGrok Plus/Heavy or Cursor Pro+/Ultra/Teams, authenticated via Cursor account (SSO honoured).
- The Grok Bot desktop app for macOS or Windows (no Linux desktop app) + optional iOS app.
- Grok Bot requires cloud data storage — accounts on Cursor's Legacy Privacy Mode must move to a supported data setting before Grok Bot can start.

Same prerequisites are restated on the Cursor help plan page [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

### 5.2 Step-by-step creation

From [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) + [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started) + [cursor.com/help/grok-bot/getting-started](https://cursor.com/help/grok-bot/getting-started):

**Path A — New agent (docs canon):**

1. Choose **New in the sidebar** or press `Cmd/Ctrl+N`.
2. In the **New chat** sheet, select **Create new agent**.
3. Grok Bot creates and opens a Bot named **New Agent**.
4. Open **Bot actions → Edit Profile** to set its **name, title, description, and avatar** (Cursor help adds shape/color/title choice).
5. Start a conversation with a concrete task — e.g.: `Name: Piper / Job: Product performance / Description: Investigate product-performance questions using our observability tools. Preserve links and screenshots, separate evidence from hypotheses, return a short summary with the highest-impact issue first. Never change production settings.` [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started)

**Path B — Suggested teammate (onboarding):**

On first sign-in, the **Meet a future teammate** screen shows suggested teammates (e.g. Chief of Staff, Sales Outbound, Inbox Manager, etc.) derived from the user's answers to "which tools do you use?" Users can pick one or choose **Create your own** [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started)

**Path C — Bot-suggested creation:**

"Your existing Bots can also suggest or create a focused Bot when a job should have a long-lived owner." This lets an overloaded Bot propose splitting off a specialist [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

**Path D — Duplicate:**

Duplicate a Bot when you want the same role for a different scope (e.g. one Account Health Bot per region). The copy is named "`<name> copy`" and **carries profile, settings, enabled skills, routines, avatar** but **does not copy conversation history, learned memory, or chat attachments**. Rename and provide new scope before assigning work [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

**Path E — From shared link:**

Preview on `x.ai`, then **Add to Grok Bot** (requires the Grok Bot app) — see §6.

### 5.3 Writing the Bot's description (system prompt)

Guidance across docs:

- Give each Bot a clear job; create a separate Bot when work has distinct **goal, tool set, working style, approval boundary, recurring schedule** [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- Bad example: `General Helper` — too vague, context becomes un-reusable.
- Good examples per use-cases doc: *"Own the weekly account-health review. Pull product usage and support signals, flag evidence of churn or expansion, and produce a linked watch list for the customer-success team. Never contact a customer or change an account without approval."* [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- The description should state: **job, source systems, output format, standing boundaries** ("Never send external messages without approval") [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- Example Launch format per get-started: focused scope beats catch-all: *"Focused Bots build more useful context than one catch-all Bot. You can add more Bots later with New → Create new agent when work naturally splits into distinct roles."* [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started)
- Put durable preferences discovered mid-work back into the description: *"Update the description when you discover a durable preference, boundary, or responsibility that should shape future work."* [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

### 5.4 Attaching knowledge / files / capabilities

Not via an explicit "knowledge" file-upload wizard as in OpenAI GPTs; instead:

- **Files attached per task:** drag/attach in composer (up to 6 attachments per message on desktop: images/audio/video up to 25 MB each, video up to 200 MB). Tell the Bot what each file is: "The PDF is the signed policy. The spreadsheet is this month's transactions." [docs.x.ai/grok-bot/files-and-results](https://docs.x.ai/grok-bot/files-and-results)
- **Durable project files:** keep in **`/workspace`** on the shared computer in clear project folders; all Bots can read them [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- **Connectors/plugins:** `Settings → Plugins → Marketplace` to install connectors + packaged skills; use `Yours` to enable private skills per Bot [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- **Browser logins:** sign in once through `Agent Computer` takeover; session persists for all Bots [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- **Skills:** `/` to reference a saved skill; `@` to attach a connector. If a private skill doesn't appear in `/`, enable it per Bot in Plugins → Yours [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### 5.5 Publish / share step

See §6. Public share link copies *configuration* (identity, description, skills, routines) but not computer/logins/history; recipient's copy is independent and subject to third-party bot terms [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

### 5.6 Limits on creation

- **Up to 50 Bots and group chats combined** per account [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- Up to **50 routines per Bot**, 20 most recent run records kept per routine [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

---

## 6. Bot Store / Marketplace — Discovery

There are **three layers** of discovery for Grok Bot:

### 6.1 First-party suggested teammates (onboarding)

On first run, `Meet a future teammate` suggests starter Bots based on the tools the user declares. No public catalog URL; it is embedded in the app's onboarding [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started)

### 6.2 First-party marketplace — Plugins / Connectors

- Inside the Grok Bot app: **`Settings → Plugins → Marketplace`** shows Cursor Marketplace listings: skills, MCP servers, slash commands, and agent primitives. Managed by Cursor Marketplace bundles [github.com/rdmgator12/awesome-grok-bot-plugins](https://github.com/rdmgator12/awesome-grok-bot-plugins) [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- The independent snapshot on Aug 12 2026 counted **219 plugins across 13 categories**; the file lists every plugin's name + description + use case, refreshed weekly [github.com/rdmgator12/awesome-grok-bot-plugins](https://github.com/rdmgator12/awesome-grok-bot-plugins)
- Installing a plugin is account-wide. Individual connector tools can be enabled/disabled; team-wide policy can force-disable ("Disabled by team admin") [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- **Not yet a Grok Bot-specific marketplace UI on the web** — docs and the `awesome-grok-bot-plugins` repo are explicit: "The public listing lives on the Cursor Marketplace; the inclusion gate for this list is the Grok Bot in-app catalog (Settings, Plugins)." [github.com/rdmgator12/awesome-grok-bot-plugins](https://github.com/rdmgator12/awesome-grok-bot-plugins)
- Reported upcoming: **Grok Bot Marketplace for third-party AI teammates** — RuntimeWire Aug 2026 article claims xAI is testing a marketplace letting users add third-party AI teammates directly to their Grok Bot roster. Status: in testing, not yet live as of late Aug [runtimewire.com — Grok Bot marketplace testing](https://runtimewire.com/article/grok-bot-testing-marketplace-third-party-ai-teammates)

### 6.3 Shareable Bot links (user-to-user distribution)

The shipping distribution primitive is the **public Bot share link**:

- Open the Bot → copy its share link → send it.
- Recipient opens a preview on `x.ai` and can choose **Add to Grok Bot** (requires the Grok Bot app).
- Adding creates **a copy** on the recipient's account; it does **not** give them the original's computer, logins, or conversation history.
- The link is **public** — anyone with it can view the Bot's shared configuration (identity, description, skills, routines). Docs warn: "Remove API keys, internal URLs, customer data, and anything else you would not put in a public document before you share." [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- Adding a shared Bot is explicitly agreement to **third-party bot terms** ("Shared Bots are created by other users, not by SpaceXAI") [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)

### 6.4 Third-party independent store — bot.store

Because xAI has no fully open marketplace yet, a community site has emerged:

- **bot.store — The App Store for Grok Bots** ([bot.store](https://bot.store/)) — Independent directory that calls itself "Bot Store — The App Store for Grok Bots." Lets makers List a Bot, browse by categories (All, Featured, Work, Sales, Hiring, Home, Research, Writing, Fun). Landing shows:
  - Featured rows: **New bots**, **Meet the makers**, **Top free**, **Work bots**, **Sales bots**, **Hiring bots**, **Home/Research/Writing/Fun bots**.
  - Each card shows Bot name, one-line pitch, maker handle, Hire button.
  - Example bots visible on 2026-08-31 scrape: `TheFounder` (Holds logins and the shared machine…), `Bot Creator` (Writes instructions for new bots and then creates them…), `Shopper` (Researches products across Amazon, Costco, Instacart, Walmart), `スキルクリエイター` (Designs and creates skills), `Minecraftクラッシュ解析` (Minecraft crash-log diagnosis), `Echo` (Builds the deck after a customer call…), `Canvas` (Pulls university units/deadlines out of Canvas), `Tradbot` (Household chief of staff…), plus niche bots like `ShopBot`, `Marketing Bot`, `Freelance Prospector`, `TeslrBot`, `Neuroscience`, `Clip Bot`, `Friend Cloner`, `ButterBot`, `Kirk`, `Lucy` etc [bot.store](https://bot.store/)
- The awesome-grok-bot-plugins README tags bot.store as "Discovery and compare public Grok Bot templates from independent makers" alongside Templates / Best Free / Makers sections [github.com/rdmgator12/awesome-grok-bot-plugins](https://github.com/rdmgator12/awesome-grok-bot-plugins)
- **Important for Lokma:** bot.store is **independent, not run by xAI**; its "Hire" flow is its own onboarding, not the native Grok Bot share link (though listings link through to Grok Bot where possible). It fills the gap before xAI's native marketplace ships.

### 6.5 Enterprise team marketplace hints

- For Cursor Teams, docs mention a **Team marketplace for skills and plugins** included in Standard/Premium [x.ai/bot](https://x.ai/bot) and a **team-wide** Plugin allowlist/denylist in Teams & Enterprises docs [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- Team Setup lets admins provide **managed setup scripts** that run on assigned Grok Bot computers [docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)

---

## 7. How Bots Are Used Day-to-Day (Chat, Switching, Groups, Handoffs)

### 7.1 Messaging a Bot (1:1)

From Chat-and-Collaboration docs [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration):

- Open a Bot from the **sidebar** and type a message.
- Composer supports: paste text/links/images, attach local files, reference a saved skill with `/`, mention a Bot/group/routine/connector with `@`, reply to a specific message, react to a message, send another instruction **while work is in progress** (redirects the current turn; your direct message takes priority).
- The transcript shows **tool activity, computer use, created files, questions, and approval requests** alongside normal chat bubbles.
- To stop immediately: send a direct **"Stop now"** message — it ends work but does not undo completed actions.
- Sidebar and dock badges show **Needs attention** (question/approval/handoff), **Unread activity**, **Working/typing** states. Opening a conversation marks its current activity as read; users can manually mark read/unread [docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)

From Overview: "You work with a Bot by messaging it like a teammate. Give it a task or function, relevant context, and access to any tools or files needed to do the work." [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)

### 7.2 What a strong request looks like

Docs give a template ("A strong request includes:") [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started):

- **Outcome:** What should be finished?
- **Sources:** Which apps, websites, files, or conversations matter?
- **Constraints:** What must the Bot avoid or ask before doing?
- **Deliverable:** What should it return?
- **Review point:** When should it stop for you?

Example quick task requiring no connector:

> "Summarize this document in five bullets. List every date, decision, and open question in a separate section. Cite the page or section for each item. Do not change the source file." [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started)

Example tool task:

> "Open our analytics dashboard and compare new-user activation for this week with the previous four weeks. Identify the largest step-level change and draft a short investigation plan with links to the relevant charts. Do not change any dashboards. Ask me to sign in if needed." [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started)

Other docs stress boundaries: "Reconcile the campaign data and draft a recommended budget change. Do not change the campaign or message the agency. Ask for approval after showing the current value, proposed value, and expected impact." [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)

### 7.3 Bot switching & organization

- **Switching:** Use the sidebar Bot list, or the global search / command palette to "Switch between Bots and groups; Find prior messages; Find files, links, and routines; Open settings and common actions" [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)
- **Pin / Hide / Unhide:** Pin active Bots to top of sidebar; Hide from sidebar removes without deleting or pausing routines; Show hidden chats → Unhide to restore [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- **Sidebar Sections (mobile/desktop parity):** Introduced in Grok Bot v1.2.0+, lets users group Bots by project/client/business without mixing. On iOS: swipe bot row → Move to → New Section; sections sync between iOS and desktop; deleting a section moves bots to Unassigned, not deleting them [cursor.com/help/grok-bot/getting-started](https://cursor.com/help/grok-bot/getting-started)
- **Account cap:** Up to 50 Bots + group chats combined [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

### 7.4 Group chats (multi-Bot teams)

Creating a group:

1. Choose **New in the sidebar** → **select two to six Bots** for the new group.
2. Open the group, edit its generated name if needed.
3. Describe the shared outcome and who owns the next step.
- On iPhone: `+ → New Group Chat`; membership editable later [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)

Directing messages in a group:

- Write normally to let participating Bots decide who should respond.
- Type **@** and select a Bot when one teammate owns the request.
- Mention multiple Bots when genuinely multi-owner; use `@everyone` sparingly.
- Example kickoff: "`@Researcher gather the source material and link every claim. @Writer turn the findings into a launch draft. @Reviewer check the draft against the sources and list only blocking issues. Do not publish anything.`" [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)

Docs example for Website Launch group: "a launch coordinator, a content editor, and an analytics reviewer. The coordinator can assign work, while the group preserves the handoffs in one conversation." [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

Constraint: "Your messages in a group can include attachments. Bot-to-group handoff messages are currently text-only, so a Bot should send an image directly to another Bot when that teammate must inspect it." [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)

Notifications: per-Bot notification toggles exist for 1:1 Bots but **Group chats do not have the same per-Bot notification switch** [docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)

### 7.5 Bot-to-Bot handoffs

- A Bot can send an **asynchronous message to another Bot**. The receiving Bot wakes, handles the request, and can reply later. The handoff is visible in the conversation [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)
- Use cases: one Bot owns a source system and another owns deliverable; a specialist should review a draft; a blocker belongs to another role; a long-running job should continue without the human as router.
- Docs advise: "Ask for a single owner at each stage. Too many parallel handoffs can create duplicate work and noisy updates." [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)

The x.ai/bot marketing version: "Put a few Bots in the same thread and they pass work between themselves. You watch them take action instead of approving every step." and "Bots get smarter over time … They keep context and learn from each other. Show one a workflow today, hand off the project by Friday." [x.ai/bot](https://x.ai/bot)

### 7.6 Threads & reactions

- **Reply in a thread** when feedback applies to one result or one approval request — keeps the main transcript focused while preserving decision context.
- **Reactions** for lightweight acknowledgement; written reply required when the Bot needs a changed instruction; "a reaction alone should not carry a safety-critical decision." [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)

### 7.7 Files & results loop

- User attaches files/links; Bot returns **cards** (files, images, links, tool results) in the conversation that can be previewed, saved, or opened via in-app viewer [docs.x.ai/grok-bot/files-and-results](https://docs.x.ai/grok-bot/files-and-results)
- Bot is instructed to return **reviewable artifacts**: documents with headings+source links, spreadsheets with defined columns/formulas, decks with speaker notes, folders of screenshots/logs, draft messages not yet sent [docs.x.ai/grok-bot/files-and-results](https://docs.x.ai/grok-bot/files-and-results)
- For handoffs, Bots can read files other Bots left in `/workspace` — but docs advise the final result should still appear in the conversation or a clear link, not only in /workspace [docs.x.ai/grok-bot/files-and-results](https://docs.x.ai/grok-bot/files-and-results)

---

## 8. Skills, Routines, and Teach-by-Demonstration

### 8.1 Definitions

> "Turn a successful task into a repeatable process. Grok Bot uses two building blocks: A **skill** is a reusable set of instructions for how to do a task. A **routine** tells one Bot when to run a workflow — on a schedule or, where supported, after an event." [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

This is restated verbatim in the FAQ [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)

Recommended flow: **Do a one-time task → make it reliable → save method as a skill → test on a second input → only then automate it as a routine.** [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) Same guidance appears in use-cases: "Save the successful process as a skill. Test it on a second input. Create a routine only when retries and failure cases are defined." [docs.x.ai/grok-bot/use-cases](https://docs.x.ai/grok-bot/use-cases)

### 8.2 Saving a skill

Prompt pattern: `Save the process we just used as a skill called "Weekly account health." Include the source systems, risk definitions, output format, and the rule that customer contact always requires approval.` [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

A useful skill states:

- When to use it
- Required inputs and access
- Sequence of work
- How to validate the result
- What to return
- What requires approval [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Discovery:

- `Settings → Plugins → Marketplace` (to find packaged skills) and `→ Yours` for installed/private skills.
- In chat, **type `/`** to reference a saved skill; **type `@`** for Bots/groups/routines/connectors.
- If a skill doesn't appear in `/`, open `Settings → Plugins → Yours` and **enable it for the current Bot** (private skills are per-Bot opt-in) [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Visibility: "Skills are available across your Bots, although a Bot may need the relevant connector or login to use one." Private skills need per-Bot enabling [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### 8.3 Teaching by demonstration

When **Teach a task** is available (gradual rollout), users can demonstrate a browser workflow instead of describing it:

1. Open a one-to-one Bot conversation and its computer view.
2. Choose **Teach a task**.
3. Describe the result you're about to demonstrate.
4. Perform the workflow once.
5. Stop the recording and review the skill the Bot creates.
6. Test on a safe example before scheduling.

Constraints:

- Recording caps at **10 minutes**; does **not** record microphone audio.
- "Avoid exposing secrets during the demonstration; use the secure handoff flow for credentials."
- The learned skill is a **draft** — explicitly needs decision rules, failure handling, and approval boundaries added.
- If no Teach control is visible, instruct the Bot verbally plus the prior successful task. [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Marketing copy for the same feature: "Show a Bot how it's done — Ask a Bot to follow along as you complete a workflow once. It saves it as a routine and runs it on its own next time." [x.ai/bot](https://x.ai/bot)

### 8.4 Creating a routine

Prompt pattern after a skill is solid:

> "Every weekday at 8:00 AM, run the Daily customer-risk skill against the current account list. Post a linked watch list in this conversation. Do not contact customers. If the source data is unavailable, report the failure instead of using old data." [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Before creation, confirm with the Bot:

- Owning Bot
- Schedule and **time zone** (uses `Settings → Agent → Timezone`)
- Input source
- Expected result
- Approval boundary
- What should happen when a source is missing [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

"The Bot creates the routine and shows its next run. Background routines can run while your laptop is closed." [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### 8.5 Event-triggered routines

Beyond schedules, Cursor account integrations can start a routine from an **event** (Slack message, GitHub notification), separate from Slack/GitHub plugins and may require their own connection flow.

Rule of thumb: define a **narrow matching rule** and a clear response. Example narrow rule:

> "When a message in #customer-escalations contains a support ticket link and the phrase 'needs repro,' open the ticket, reproduce the issue in staging, and post a repro pack in this conversation. Never post back to Slack without approval." [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Docs warn: "Avoid broad listeners such as 'every new message.' They create noise, consume usage, and increase the chance of acting on irrelevant input." [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### 8.6 Testing routines before enabling

Workflow:

- Use **Test run** after creating/editing a routine. A test run **performs real work** (navigates websites, changes files, calls connected tools). Use safe inputs and keep write actions behind approval.
- Review: whether it selected current inputs, whether output meets required format, whether every action has a source/audit trail, whether it stopped at intended approval point, whether failure states are explicit [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### 8.7 Managing routines

Path: "Open the Bot, choose **View conversation details**, then open **Routines** to view its routines and recent runs." Actions available: Enable/pause, Run a test, Edit schedule/instructions, Inspect recent success/failure history, Delete [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Limits & lifecycle [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations):

- **50 routines per Bot**, 20 most recent run records kept per routine.
- Deleting a routine is immediate, no undo. Deleting a Bot also removes its routines.
- "To control unattended usage, Grok Bot may ask whether to keep routines running after a long period away and pause them if there is no response. Review paused routines when you return."

### 8.8 Routine design principles (for trust)

From docs' closing checklist [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations):

- Automate preparation before execution; have the Bot **draft/reconcile/recommend first**.
- Require approval for sending, purchasing, deleting, publishing, or changing production systems.
- Include a **no-data and stale-data policy**.
- Make retries **idempotent** where possible.
- Tell the Bot where to report partial completion.
- Re-test after a website, connector, or source format changes.
- Keep a no-data fallback: "If the source data is unavailable, report the failure instead of using old data."

---

## 9. How Grok Bots Differ from Single-Agent Chat

This is the "single-agent chat vs Bots as specialists" question. The docs explicitly enumerate the delta; synthesize below.

### 9.1 Single-agent chat (grok.com / Grok app pre-Bot)

- One **anonymous or singly-personalized** assistant per thread; conversations are ephemeral or per-chat, not a durable teammate with a persistent job [TechWiser](https://techwiser.com/groks-new-customize-feature-get-personalized-ai-responses/) [Blutrumpet](https://www.blutrumpet.com/post/change-grok-response-style-personality)
- Customization is two free-text fields + presets (Customize Grok) scoped per-user, not per-Bot, and optionally per-conversation; the model chooses when to obey [TechWiser](https://techwiser.com/groks-new-customize-feature-get-personalized-ai-responses/)
- Tools are consumer connectors (Google Drive, Gmail, Calendar, Outlook, SharePoint, OneDrive, Teams, Salesforce, Custom MCP) surfaced as **Grok Connectors** inside chat; they are **not** the Grok Bot plugin/MCP layer and live at a different granularity [grok.com/faq](https://grok.com/faq)
- No cloud computer; work happens only in the chat's tool-call envelope and ends when the turn ends; closing the laptop ends the session [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)
- No inter-agent collaboration; you are the router.

### 9.2 Grok Bot — specialist teammates

| Dimension | Single-agent chat | Grok Bot |
|---|---|---|
| **Identity** | One assistant, or optionally renamed but stateless | **Named, durable teammate** with avatar, title, description, pinned in sidebar, up to 50 per account [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) |
| **Memory** | Per-user Customize fields + chat history | **Per-Bot memory** (stable preferences, facts, summaries of prior work) **plus** shared /workspace files & browser sessions; memory not an authoritative source [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) |
| **Tools** | Grok Connectors per user | **Per-account plugin set + per-Bot skill enablement + computer-use browser + optional local computer** [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps) [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| **System prompt / instructions** | Two free-text Customize fields | **Per-Bot `description` (durable rules)** + per-message task instructions + reusable **Skills** [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| **Model selection** | Model picker in grok.com (Grok-4, Grok-4 Heavy, Imagine, etc.) | **No picker** — product-managed fixed set with failover; not user-/admin-choosable [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) |
| **Knowledge** | File-by-file upload per chat | **Per-task attachments (up to 6 × 25 MB / 200 MB video)** + durable **/workspace** project folders readable by all Bots [docs.x.ai/grok-bot/files-and-results](https://docs.x.ai/grok-bot/files-and-results) |
| **Shareability** | Share a conversation link | **Public Bot share link** copies config (identity, description, skills, routines) — not computer/history — to recipient's account [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) |
| **Execution** | Chat turn; dies with tab | **Persistent cloud VM** (browser, filesystem, terminal); keeps running with laptop closed; routines on schedule/event [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview) [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq) |
| **Parallelism** | One thread | **Many Bots at once**, each with its own screen on the shared computer; Bot-to-Bot async DMs + group chat (2–6 Bots) [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration) |
| **Learning** | User rewrites instruction | **Teach-by-demonstration** (10-min browser recording → draft skill) [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| **Automation** | None | **Skills → Routines** (schedule/event, up to 50 per Bot, test runs, 20 recent records) [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| **Approvals** | N/A | Explicit approval cards, Auto-review rules, computer takeover for sensitive steps [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) |

### 9.3 Why a per-Bot specialist beats a single generalist

Docs give the direct rationale:

- "Good jobs include Talent Scout, Expense Manager, and Bug Reproduction. A job such as General Helper gives the Bot less guidance and makes its saved context harder to reuse." [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- "The best Grok Bot roles own a repeatable outcome, not a loose category of questions. Start with read-and-prepare work, review the result, then add approved actions or a routine." [docs.x.ai/grok-bot/use-cases](https://docs.x.ai/grok-bot/use-cases)
- Flow the docs recommend: "Put the job, source systems, output format, and standing boundaries in the Bot description. Run one real task with a safe scope. Correct the result until it is reviewable. Save the successful process as a skill. Test it. Create a routine only when retries/failure are defined. Keep consequential actions behind approval." [docs.x.ai/grok-bot/use-cases](https://docs.x.ai/grok-bot/use-cases)

For Lokma: the equivalent is a marketplace of **specialist bots** (sales, ops, finance, product, etc.) rather than one "Lokma assistant with modes."

---

## 10. The Shared Computer — Architecture Detail

This is the most architecturally distinctive part of Grok Bot and worth detailing for Lokma inspiration.

### 10.1 What it is

- **Managed Linux VM per user** (not per Bot). Docs: "Each member gets one dedicated cloud computer. The computer is a managed Linux virtual machine. All of that member's Bots share the same computer, so files, sign-in sessions, and permissions belong to the member, not to an individual Bot." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- Contains **browser, filesystem, terminal**; Bots use "computer use for apps and websites without a clean API" so "work finishes in the real tools rather than as chat drafts" [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)
- The Bot runs as **non-root** on that VM [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- **Static egress IPs** — needed for corporate allowlisting: "Computers reach the internet through static egress IP addresses. If your company restricts services by source IP, ask your account team for the current ranges." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- Recovery options in `Settings → Beta`: **Update Agent Computer** (rebuild with latest image, preserve durable state), **Recover** (replace unreachable computer), **Reset** (return to most recent durable snapshot, may discard recent unsynced work). Docs warn to wait for active work to finish before recovery [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)

### 10.2 Filesystem

- Shared workspace at **`/workspace`** — durable, intended for project folders with descriptive names [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- "Files, browser state, and supported sign-ins are designed to survive normal computer updates and recovery. Treat temporary directories, manually installed packages, and uncommitted application state as replaceable. Copy important results into the shared workspace or attach them to the conversation." [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- For files attached to chats: desktop composer accepts **up to 6 attachments at a time; documents, images, audio up to 25 MB each; videos up to 200 MB; encrypted/damaged/unusual files may not be readable** [docs.x.ai/grok-bot/files-and-results](https://docs.x.ai/grok-bot/files-and-results)

### 10.3 Browser isolation semantics

- **One browser profile, many screens:** "Each Bot gets its own screen on the shared computer. Several Bots can therefore use browser and desktop tools in parallel, although one Bot can run only one computer-use task on its screen at a time. The screens are separate work surfaces, not separate security boundaries." [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- Sessions persist, therefore "signing in for one Bot makes the session available to your other Bots" [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- View the shared desktop via **Agent Computer** preview: shows clicks, typing, navigation, status; closing the Grok Bot app or laptop does not stop cloud work [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- **Human-in-the-loop takeover:** For password/passkey/2FA/CAPTCHA/payment/identity/human-required sites: the Bot asks the user to take over. User path: Open Agent Computer → Take control → complete the blocked step → Return control and tell the Bot to continue. "Do not send a password or one-time code in ordinary chat. If the Bot presents a secure secret request for a supported connection, enter the value in that request. It is not a general-purpose password manager. The value is masked, excluded from the transcript, and not shown to the model." [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)

### 10.4 Local computer (mouse on your desk)

Strictly opt-in, distinct capability:

- `Settings → General → Agent → Execution on Local Computer` with three levels: **Always require approval / Are always allowed / Are never allowed** (default Ask every time: "Use Never allowed unless a Bot has a specific reason to work on your local files.") [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- "Bots can act on a member's own computer: run commands, read files, and move files between the cloud computer and the local computer. The first local action asks the member for consent. Every local action then goes through Auto-review, and the approval card shows the exact command." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- Team ceiling is coming: option for org admin to impose Never / Ask / Always ceiling; members can choose *stricter* but not looser [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- Security posture: docs call the computer's shared-browser reality "a real blast radius" in a secondary quote — Reworked's paraphrase of xAI Cursor launch copy notes the product itself described the shared computer as "a real blast radius" when critiquing enterprise rollout [Reworked — xAI Wants In on the Enterprise With Grok Bot](https://www.reworked.co/collaboration-productivity/xai-launches-grok-bot-ai-agents-in-beta/)

### 10.5 MCP / plugin isolation

- Sign-in tokens for hosted MCP servers **stay with Cursor's backend**, which runs those tool calls on the computer's behalf. "The computer never stores those tokens." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- MCP authentication is shared across Cursor + Grok Bot; server allowlist/denylist and "can members add their own servers" controls are in Team Settings → MCP Configuration; Grok Bot follows the team's existing Cursor plugin/MCP policy with no separate toggle [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

---

## 11. Pricing, Plans, Quotas & Limits

### 11.1 Availability — who can get Grok Bot today

**At launch (Aug 11 2026)** eligible: SuperGrok, SuperGrok Plus, SuperGrok Heavy; Cursor Pro, Pro+, Ultra; Cursor Teams Standard and Premium (desktop + iOS) [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)

**After Aug 26 2026 expansion** — re-stated as available for **all** of: SuperGrok, SuperGrok Plus, SuperGrok Heavy, Cursor Pro, Cursor Pro+, Cursor Ultra, Cursor Teams Standard/Premium [x.ai/news/grok-bot-more-plans](https://x.ai/news/grok-bot-more-plans) [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

**Not included:** SuperGrok Lite, SuperGrok Team, SuperGrok Enterprise (linking not supported; only **individual** SuperGrok tiers can link). Cursor Enterprise is waitlist/rollout via account team [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

**Enterprise:** "Rolling out. Contact your Cursor account team to join." Self-serve Teams already includes Grok Bot on every seat. Enterprise requires waitlist + managed access [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

### 11.2 Billing model

- **Bundled, not standalone:** "Grok Bot still has no standalone subscription as of August 26, 2026" — CellCog pricing explainer summarizing the posture [cellcog.ai — Grok Bot Pricing Explained](https://cellcog.ai/blog/grok-bot-pricing/)
- Cursor help: "Access is included with Cursor Pro, Cursor Pro+, Cursor Ultra, or a Cursor Teams seat, or through an individual SuperGrok, SuperGrok Plus, or SuperGrok Heavy account link." [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)
- **Weekly usage allowance** included with the eligible plan; on exhaustion, Grok Bot **can continue on shared on-demand spend** if on-demand is enabled. Measured on the **Cursor account**, not the Grok account — a SuperGrok link is a *usage grant*, not a Cursor plan, and does not create a second meter on Grok. It also does not change the Cursor plan; if you have both a Cursor and a SuperGrok subscription, "Grok Bot uses whichever has more usage." The link is described as **permanent once created** (cannot be unlinked or moved) [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans) [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)
- Launch post: "Grok Bot comes with its own usage, separate from your Grok and Cursor plans, so anything you hand off to a Bot won't count against your existing usage." [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)
- The FAQ restates: "Grok Bot subscriptions include weekly usage; eligible accounts can add on-demand usage billed from model and token cost. If you have both a Cursor and a SuperGrok subscription, Grok Bot uses whichever has more usage." [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)

### 11.3 List prices observed (Aug 2026)

These are the *plan* prices that include Grok Bot — not Grok Bot alone. From x.ai/pricing and x.ai/bot pricing cards [x.ai/pricing](https://x.ai/pricing) [x.ai/bot](https://x.ai/bot):

Pricing page (x.ai/pricing — Individual tab snapshots):

- **Free** — $0/mo — generous limits for chat/voice/search, Connectors, SOC2.
- **SuperGrok** — **$30/mo** — Grok 4.6 model, Grok Bot access, Connectors, higher rate limits, Expert, SOC2, image/video generation.
- **SuperGrok Plus** — **$100/mo** — everything in SuperGrok plus 1080p video, significantly higher usage, lightning-fast replies, priority access, early features.
- **SuperGrok Heavy** — price not shown in truncated scrape but positioned as above Plus; docs place Heavy above Plus in usage tier.

x.ai/bot page showed Cursor-side card (truncated but visible):

- **Cursor Pro / Pro+ / Ultra** — e.g. **$20/mo billed monthly** visible for one of the tiers (the "Pro Pro+ Ultra" card block). Precise split: Pro includes Grok Bot with weekly usage below Pro+; Pro+ below Ultra; Ultra is highest. Teams Standard/Premium is **$40/seat/mo billed monthly** (shown on x.ai/bot for Teams Standard/Premium) [x.ai/bot](https://x.ai/bot) [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

> **Caveat:** The Cursor-side dollar figures appear on multiple marketing pages with tier-label ambiguity due to HTML rendering. Prefer the cursor.com/help docs over the marketing card text for the ordering, and quote the x.ai/pricing table for SuperGrok tiers when citing.

Comparison figure for context: broader Grok pricing articles cite X Premium $8/mo, X Premium+ $40/mo, SuperGrok $30/mo, SuperGrok Heavy at higher; but the canonical table is x.ai/pricing [toolchase.com — How to use Grok in 2026](https://toolchase.com/blog/how-to-use-grok/) [x.ai/pricing](https://x.ai/pricing)

### 11.4 Usage metering details

- Grok (chat-side) moved in June 2026 to a **single shared weekly usage pool** across all Grok products (Chat, Imagine, Voice, Build) instead of per-product daily limits; the percentage is shown in Settings → Usage with a breakdown by product (API, Build, Chat, Imagine, Voice) and a reset date/time. Different actions cost different compute (a chat message vs a high-quality video or long coding task). [grok.com/faq](https://grok.com/faq)
- Grok Bot's weekly usage is **separate but analogous**: weekly included credit, resets weekly, shown on the plan screen or Cursor dashboard; on-demand spend is pooled at the account level. There's **no Grok Bot-specific spend cap yet** — account-level on-demand controls still apply [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- Grok Bot trial is a **usage credit rather than a set number of days**, though a 7-day window also applies. Measured by **agent steps and tokens**, not message count. A large/long agent job can consume most/all of it at once — used credit not restored [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)
- Plan screen is where to check Grok Bot usage; if Weekly usage surface doesn't appear, use cursor.com/dashboard/usage broken down by product; invoices combine Cursor + Grok Bot charges with per-product split on dashboard [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) [docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)

### 11.5 Quotas & hard limits

Quantitative caps found in docs:

- **Bots per account:** up to **50 Bots + group chats combined** [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- **Routines per Bot:** up to **50 routines** [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- **Routine run history kept:** **20 most recent run records** per routine [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- **Group chat size:** **2–6 Bots** per group [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)
- **Teach-a-task recording cap:** **10 minutes**; does not record microphone audio [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- **File attachments per message:** up to **6** on desktop; **25 MB** per document/image/audio, **200 MB** per video [docs.x.ai/grok-bot/files-and-results](https://docs.x.ai/grok-bot/files-and-results)
- **Computer:** one shared Linux VM per user; per-Bot screen parallelism with one computer-use task per Bot at a time [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)
- Attended-routine auto-pause: "Grok Bot may ask whether to keep routines running after a long period away and pause them if there is no response." [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### 11.6 What "weekly usage included" colloquially means

In the x.ai/bot pricing cards the phrase is **"Weekly Grok Bot usage included"** under each Cursor tier and **"Extended limits on AI tokens"** as the higher tier perk, suggesting a similar pool model to grok.com's shared weekly pool but metered on Cursor [x.ai/bot](https://x.ai/bot) [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

---

## 12. Security, Approvals & Privacy Boundaries

### 12.1 Approval design

From Approvals, security & privacy [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy):

- Set a boundary in the request itself: "Tell the Bot which actions it can take and where it must stop." Example: "Reconcile the campaign data and draft a recommended budget change. Do not change the campaign or message the agency. Ask for approval after showing the current value, proposed value, and expected impact."
- Sensitive categories where explicit boundaries are preferred: sending messages/invitations, publishing content, purchases/financial transfers, deleting/overwriting data, changing permissions, production changes, accepting legal terms.
- **Approval controls:** On desktop, **Allow once** / **Deny** / **Always allow** (can save a matching rule); on iPhone, **Approve once** / **Deny**. Approval controls *the proposed action*; it does not reverse work already completed.
- **Auto Review** (when available): Grok Bot evaluates tool calls and computer actions before they run. `Settings → General → Auto-review` lets users add rules: **Require Approval** (always stops matching actions) vs **Always Allow** (lets matching actions proceed only when automated review identifies no other reason to stop). If both match, Require Approval wins. Example rules: "Require approval before sending any external email," "Always allow running git status in /workspace/reports," avoid "allow everything in the browser."

### 12.2 Sensitive input handling (handoff)

For passwords, passkeys, 2FA codes, CAPTCHAs, payment confirmations: **Bot hands the user control of the computer**:

1. Open Agent Computer.
2. Take control.
3. Complete the sensitive step.
4. Return control and tell the Bot to continue.

"Do **not** send a password or one-time code in ordinary chat." Only for a supported "secure secret request" should a value be entered in that masked UI — it is excluded from the transcript and not shown to the model [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)

For Teach-a-task: "Avoid exposing secrets during the demonstration; use the secure handoff flow for credentials." [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### 12.3 Shared-computer boundary is not a security boundary

Repeated warning across docs:

- "Do not use separate Bots as a security boundary. Sign out of a service when it should no longer be available. Remove sensitive temporary files after the work is complete. Delete a connector or revoke its authorization in the source service when access is no longer needed." [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- "All of your Bots share one cloud computer assigned to your user account. Files, browser sessions, and command line credentials on that computer are available across your Bot roster." [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- Least-privilege guidance: "Connect only the tools a workflow needs. Use scoped service accounts where the source system supports them. Start with read-only tasks and draft outputs. Keep sending/publishing/purchasing/deletion/production changes behind approval. Review installed connectors and active routines regularly. Pause a routine when its source system or expected workflow changes." [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)

### 12.4 Data & training posture

- Grok Bot uses **Cursor authentication + account data settings**. "Training opt-out follows the applicable Cursor account and privacy settings." Docs link to Cursor Privacy Policy/security docs as contractual source [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- **Legacy Privacy Mode blocks Grok Bot entirely** — "Grok Bot requires data storage and does not support Legacy Privacy Mode." [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq) [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started) [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- Removal path when project/login should no longer be available: pause/delete related routines; sign out of websites on shared computer; uninstall connectors and revoke authorization in the source service; remove sensitive project files from `/workspace`; hide/delete Bots [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- Deleting a Bot does **not** remove shared-computer files or browser sessions; backend retention follows Cursor terms; "Hide the Bot instead if you may need its work later." [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)

### 12.5 Sharing boundary

- "Sharing a Bot is not a security boundary. A public share link lets others copy the Bot's configuration. It does not share your computer or logins. Still, do not put secrets, customer data, or internal URLs in a Bot you share." [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- Pre-share sanitization: "Remove API keys, internal URLs, customer data, and anything else you would not put in a public document before you share." [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- Team policy enforcement for MCP/plugin: server allowlist/denylist, "can members add own servers," "Require Team Network Allowlist" [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

---

## 13. Teams & Enterprise — Admin View

Source: full Teams & Enterprises doc [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) (last updated 2026-08-20).

### 13.1 How it works for a team

- **One dedicated VM per member,** shared by all that member's Bots — "so files, sign-in sessions, and permissions belong to the member, not to an individual Bot." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- Users access from **desktop (macOS/Windows) + iOS**; they sign in with their Cursor account, so existing Cursor SSO/team membership applies. No Linux desktop app.
- Admin settings managed from **Cursor dashboard → Grok Bot page** (separate from Team Settings for privacy/MCP/team-rules). Also inherits MCP config, team rules, and Auto-review.

### 13.2 Before rolling out checklist

1. Not on **Privacy Mode (Legacy)** — it blocks Grok Bot entirely.
2. If company restricts by source IP, plan for **egress ranges**.
3. Decide how members sign in to company tools from the VM (password manager / passkeys — see below).
4. Review policies that Grok Bot inherits: MCP config, team rules, Auto-review [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

Setup wizard path in dashboard walks through: privacy mode, dedicated desktop, API pricing, pooled billing, model availability, premium seats. Global toggle **Cloud Agents** controls whether Grok Bot Bots can launch Cursor cloud agents — on by default [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

### 13.3 Identity & sign-ins at enterprise

- Grok Bot sign-in **reuses Cursor SSO**; but "Sign-ins inside the computer work differently. The computer is a Linux VM, and device-trust agents such as Okta FastPass are not available for it natively." Admins should provision the computers via **install scripts** and can enforce a password-manager policy (e.g. install via Team Setup script; ask members to enroll a **passkey** for company sign-ins). Hardware security keys work: **WebAuthn prompts in the computer browser are forwarded to the member's desktop app and physical key**; Windows support for this forwarding was "in progress" at doc write [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- MCP auth tokens stay server-side; VM never stores them.

### 13.4 Model & compliance posture

As above: no per-org model allowlist. "If your contract limits which subprocessors can handle your data, contact your account team before rolling out." Usage analytics will show the serving model including failovers; billing follows actual model [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

### 13.5 Managing member computers

- Organization admins (not just team admins) can **inspect and remove member computers** via `Grok Bot → computers` in the dashboard; **Kill** deletes the running VM but durable storage is kept, next session creates a fresh VM. Members can also **Reset** their own computer from desktop; mobile cannot reset [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- "Grok Bot's computer is not by default enrolled in mobile device management." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

### 13.6 Team rules, plugins, privacy, spend

- **Team rules** from the dashboard apply to Grok Bot; can be scoped to Cursor, Grok Bot, or both. Keep rules short/few; enforcement should be Auto-review. Example rules: "do not create personal access tokens", "never move company data to personal accounts." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- **Plugins/MCP:** follows team's Cursor plugin/MCP policy; no separate Grok Bot plugin controls; admins enable a plugin on the team plugins page, enter secrets as plugin variables, and must add server URL to allowlist if an allowlist is enabled [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- **Privacy:** While a member is on your team, the team's privacy mode applies. Training follows same setting. Spend/usage appears on cursor.com/dashboard/usage; an audit view of Bot actions is "coming." [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- **Spend:** No Grok Bot-specific spend cap yet; account-level on-demand controls still apply [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

---

## 14. Platform Support & Availability

- **Available today (desktop):** macOS (Apple silicon + Intel), Windows (x64 + Arm64) — via dmg/installer, auto-update [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started) [x.ai/bot](https://x.ai/bot)
- **Mobile:** iOS companion app (iOS 18+); mentions push notifications for Bot completions/needs-input, though docs note "Mobile push delivery is rolling out and may not yet be enabled for every account" [docs.x.ai/grok-bot/settings-and-notifications](https://docs.x.ai/grok-bot/settings-and-notifications)
- **Not at launch:** Linux desktop, Android, iPad not supported at initial launch [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)
- **Grok.com surface:** still web/iOS/Android apps, but Grok Bot is a distinct product with separate data storage requirement [grok.com/faq](https://grok.com/faq)
- **Launch dates:** Grok Bot early beta Aug 11 2026 [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot); expansion Aug 26 2026 [x.ai/news/grok-bot-more-plans](https://x.ai/news/grok-bot-more-plans)

---

## 15. Screenshots & Flows Described in Docs/Marketing

Since programmatic scraping could not render JS-heavy screenshots, document the flows the docs *describe* as if they were screenshots — with source URLs for each.

### 15.1 Creation flow (text equivalent of the UI wizard)

**New Agent screen (sidebar → New → Create new agent)** — from [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots):

```
[Sidebar]
  ├─ New (Cmd/Ctrl+N)
  └─ Bots list (pinned on top, hidden section collapsed at bottom)
[New chat sheet]
  ├─ Create new agent  ← click
  └─ (Group creation: select 2–6 Bots)
[Bot just created]
  Title: New Agent
  Bot actions → Edit Profile → {Name, Title, Description, Avatar}
  Suggestion chips (in chat): "Summarize this doc…", "Open analytics dashboard…"
```

Get-started adds the first-team question: "Meet a future teammate — choose a suggested teammate or Create your own (name + job + description)" [docs.x.ai/grok-bot/get-started](https://docs.x.ai/grok-bot/get-started)

**Edit Profile sheet fields** (from [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) + Cursor help shape/color/title [cursor.com/help/grok-bot/getting-started](https://cursor.com/help/grok-bot/getting-started)):

```
Name:     [Piper              ]
Title:    [Product performance]
Avatar:   [upload / emoji / color dot — shape+color picker on mobile]
Description (durable rules):
  [Investigate product-performance questions using our observability
   tools. Preserve links and screenshots, separate evidence from
   hypotheses, return short summary with highest-impact issue first.
   Never change production settings.                  ]
```

### 15.2 Chat flow (1:1)

From [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration) + [docs.x.ai/grok-bot/files-and-results](https://docs.x.ai/grok-bot/files-and-results):

```
[Bot: Piper]  ● Working / Needs attention / Unread badge
Composer: [Type message…]  [+attach]  [@mention]  [/skill]  [Agent Computer]
Transcript:
  You: "Compare new-user activation this week vs previous 4 weeks…"
  Bot: (tool activity) "Opening analytics dashboard…" [browser preview thumbnail]
       "Pulling chart data…"
       [Card: image screenshot.png]  [Card: link dashboard/chart?id=...]
       "Draft investigation plan…" [Card: file report.md]
  Bot: "Review? I stopped before changing dashboards. Ask me to revise with
        source links inline."
Approval card (when needed):
  ┌─────────────────────────────────────────┐
  │ Send external email to 12 contacts?     │
  │ [Allow once] [Always allow] [Deny]      │
  │ Inputs: recipient list, subject, body   │
  └─────────────────────────────────────────┘
```

### 15.3 Group chat flow

From [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration):

```
[New Group] — pick 2–6 Bots → name auto-generated, editable
Group: "Website Launch" (3 bots: Launch Coordinator, Content Editor, Analytics Reviewer)
Transcript:
  You: "@Researcher gather sources and link every claim. @Writer draft…"
  Researcher (Bot): passes note to Writer → visible handoff badge
  Writer: [Card: draft.md]
  Reviewer: "Blocking issues: 1)… 2)…"
Note: attachments from you are allowed; Bot-to-group handoffs are text-only today.
```

### 15.4 Computer use / takeover flow

From [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps) [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy):

```
Bot: "I need you to sign in to Zendesk to work the support queue."
[Button: Open Agent Computer] → [Take control]
User takes over, enters password/2FA/CAPTCHA/passkey physically
[Return control] → "Continue"
Session cookie now shared with all your Bots.
```

The marketing hero snippet on x.ai/bot shows this as: "Sign in to Zendesk so I can work the support queue." with a "You're in control" banner [x.ai/bot](https://x.ai/bot)

### 15.5 Skills / routines flow

From [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations):

```
After a successful task:
  You: "Save the process we just used as a skill called 'Weekly account health'…"
  Bot: saves → available via "/" in composer

Scheduling:
  You: "Every weekday at 8:00 AM, run the Daily customer-risk skill…"
  Bot: creates routine → shows next run time + timezone (Settings→Agent→Timezone)

Management:
  View conversation details → Routines → [Enable/Pause | Test run | Edit | View history | Delete]
  Routine card shows: owning Bot, schedule+timezone, input source, expected result,
                     approval boundary, 20 recent run records

Teach by demo (when available):
  Bot chat → Agent Computer view → [Teach a task] → describe result →
  perform workflow ≤10 min → stop → review draft skill → test on safe input
```

### 15.6 Store / plugins flow

From [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps) [github.com/rdmgator12/awesome-grok-bot-plugins](https://github.com/rdmgator12/awesome-grok-bot-plugins):

```
Settings → Plugins → Marketplace  (browse 219+ plugins, 13 categories)
Settings → Plugins → Yours       (review installed + private skills; enable per Bot)
In chat:  "@" (attach connector/Bot/group/routine), "/" (reference skill)
Team admin: dashboard allowlist/denylist → member sees "Disabled by team admin"
```

### 15.7 Design guide's agent-team vignette

The "Designing Grok Bot with Grok Bot" guide visualizes a **4-Bot design pod**: `Figma Bro` (Figma production work via Figma MCP inspecting exact x/y/typography/fills), `Motion God` (prototype motion with deterministic controls around the real animation spec file), `Experiments` (explores ambient Bot access ideas: notch-docked, corner peek, cursor-follower), `Devbot` (engineering feasibility). Experiments delegates subtasks to Motion God and Devbot then recombines. This demonstrates the intended delegation mesh for non-engineering roles [x.ai/bot/guides/designing-grok-bot-with-grok-bot](https://x.ai/bot/guides/designing-grok-bot-with-grok-bot)

---

## 16. Use Cases Catalog (What Teams Actually Run)

### 16.1 The canonical starter set (from x.ai/bot hero & launch post)

x.ai/bot lists six at the hero: Sales Outbound, Talent Scout, Paid Media, Expense Manager, Product Performance, Bug Reproduction, Account Health, Chief of Staff — with one-line ownership blurbs [x.ai/bot](https://x.ai/bot)

Launch post uses three concrete internal jobs as proof: a **sales Bot** updating CRM from call transcripts and drafting follow-ups; an **ops Bot** seating new hires and processing Gmail invoices; an **engineering Bot** reproducing a bug in the UI, filing the ticket, handing the fix to a debugging Bot [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)

Aug 26 post re-lists freelancer-tractable jobs that third-party bots can productize: Sales prospector, Website builder (builds site, buys domain, deploys, adds redirect rules), Digital declutterer, Customer support, Game artist, Office manager (Gmail/Slack/ServiceTitan/Quo/client portal — handles browser work across six tools), Inbox manager, Meeting stand-in, Refunds manager [x.ai/news/grok-bot-more-plans](https://x.ai/news/grok-bot-more-plans)

### 16.2 The docs use-cases page (read-and-prepare templates)

Each role on [docs.x.ai/grok-bot/use-cases](https://docs.x.ai/grok-bot/use-cases) follows: Owns / Connect / Start-with prompt including "Do not send / Do not change without approval." Full inventory:

1. **Sales Outbound** — Research 25 accounts in CRM view, score against ICP + intent, identify up to 3 contacts/account, draft outreach in style examples, skip those in active sequences, return review list. Routine: nightly research stopping at review list.
2. **Talent Scout** — For a role description, find 20 potential candidates meeting must-haves, exclude ATS incumbents, explain evidence per match, draft outreach in user's voice, do not contact. Requires approval before outreach.
3. **Paid Media** — Pull spend/performance by campaign, compare to monthly budget/target CAC, recommend reallocations with numbers, draft Slack update; **do not change budgets or send the message**; keep changes behind approval even after it becomes a routine.
4. **Expense Manager** — Build weekly expense summary from system + attached policy, match receipts from inbox, flag missing categories/policy exceptions, draft one follow-up per owner, return summary+drafts, do not send or change reimbursements; cite policy on every exception, totals reconcile to source.
5. **Product Performance** — Investigate checkout latency increase since yesterday's release via dashboards/traces/flamegraphs; identify highest-confidence hotspot; return write-up with screenshots + direct links; separate facts from hypotheses; **do not change alerts/production settings**; routine for recurring health report only.
6. **Bug Reproduction** — Read bug report, reproduce in staging with fresh test account, return exact steps/expected vs actual/screenshots/browser+OS details/console-network notes/minimal test case, do not use prod customer data; use approved test creds via secure handoff.
7. **Account Health** — Review portfolio: combine usage, support escalations, renewal timing, stakeholder activity → ranked watch list with evidence+rationale+suggested next step; do not contact customers nor edit CRM; define thresholds in Bot description for consistency.
8. **Chief of Staff** — Review activity since yesterday across approved Slack/email/calendar/meeting notes; return only items mapping to priorities doc; per item: source, why it matters, proposed next step, whether user owes a decision; tune via marking useful vs noise; then schedule the digest.

Closing pattern the docs recommend for all roles:

```
Put the job, source systems, output format, and standing boundaries in the Bot description.
Run one real task with a safe scope; correct until reviewable; save as a skill;
test on a second input; create a routine only when retries/failure defined;
keep consequential external actions behind approval. [docs.x.ai/grok-bot/use-cases]
```

### 16.3 The design pod (creative roles)

From the design guide: Figma Bro, Motion God, Experiments, Devbot — for repetitive Figma population, deterministic animation tuning around a real spec file, ambient exploration (notch/corner/cursor), and engineering handoff [x.ai/bot/guides/designing-grok-bot-with-grok-bot](https://x.ai/bot/guides/designing-grok-bot-with-grok-bot)

### 16.4 The community store long tail

bot.store surfaces a broader spectrum than the docs' professional roles, useful for Lokma's marketplace thinking:

- **Home/life:** Shopper, point peddler (award-travel brain), TeslrBot (Tesla charge/climate/locks/nav), KeyWire Comic Week Brief, trad household chief of staff.
- **Sales/marketing:** Marketing Bot (CMO+CRO+SEO+ads+email+social), Leads from Meta/Google Ads, LinkedIn Desk, Contra Job Scraper, Freelance Prospector, Competitor Watching.
- **Hiring:** Talent Matchmaker, Mappy (company mapping).
- **Research:** Neuroscience, YC Podcast Notes, last30days (Reddit/X/YouTube/TikTok/HN/Polymarket/GitHub/web in last 30 days), OutBid Mania, Sharenow Feed Bot.
- **Writing/media:** Echo, Shorty (cut YouTube Shorts), Pitch Deck Coach, Clip Bot, Publish private link, Human Copywriter.
- **Work infra:** TheFounder (holds logins/shared machine), Bot Creator (meta-bot that writes instructions and then creates bots), Gardener (pulls dead code as small PRs), Webby (rebuilds site/newsletter), Canvas (university deadlines).
- **Fun:** Minecraft crash diagnosis, Cold Open (sitcom clip via fal MiniMax), Friend Cloner (reads WhatsApp group, recreates friends as bots), ButterBot, Kirk (Star Trek crew after START), Lucy (art/worlds/poems/films) [bot.store](https://bot.store/)

### 16.5 The "journalist's view" anecdote

Independent coverage gives a concrete day-to-day quote: launching engineer Lauren Tan "showed, screen by screen, how she runs her working life through **10 to 20 Grok Bot agents**" and claims "**about 80% automation** of repeatable work after the first week" via tight Bot descriptions + skills [coursiv.io — Grok Bot Workflow: Build an AI Agent Team](https://coursiv.io/blog/grok-bot) (sourced via search snippet; linked in raw search but not fully scraped — corroborated across launch post and use-cases docs)

---

## 17. Gaps, Criticisms & Open Questions

Where the docs are thin or the model is controversial — flag for Lokma to avoid copying blindly:

1. **Shared computer = shared blast radius.** xAI's own "real blast radius" quote (Reworked paraphrase) and the repeated "Do not use separate Bots as a security boundary" warning imply any compromised browser session or rogue routine can touch all projects belonging to that user. Enterprise admins must kill whole VMs and force re-login; there is no per-Bot network or filesystem sandbox [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps) [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) [Reworked](https://www.reworked.co/collaboration-productivity/xai-launches-grok-bot-ai-agents-in-beta/)

2. **No model choice.** Power users and enterprises who contractually restrict subprocessors cannot limit the model set; the product "routes to a fixed set of models for its surface, with automatic failover" and advises "contact your account team before rolling out" [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

3. **Browser automation is brittle.** Docs themselves advise re-testing after "a website, connector, or source format changes" and keeping external actions behind approval; static egress IPs also cause some sites to block the bot (flag as datacenter) [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

4. **Teach-by-demonstration is staged.** Marked "when Teach a task is available … rollout may be gradual, and the recording is limited to ten minutes" — not a guaranteed capability for all users [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations) [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)

5. **Marketplace is not yet fully open.** First-party Bot marketplace is "in testing" per RuntimeWire; today distribution is either share links or the in-app plugin catalog; bot.store is an independent stopgap [runtimewire.com](https://runtimewire.com/article/grok-bot-testing-marketplace-third-party-ai-teammates) [bot.store](https://bot.store/)

6. **Trial credit surprise.** Because the trial is a usage *credit* measured in agent steps/tokens, "a single large run can use most or all of it at once" — a common complaint [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

7. **Link permanence.** SuperGrok→Cursor link "is permanent once created. You can't unlink or move it to a different Cursor account" — risky if users sign in with the wrong Cursor account before linking [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

8. **Companions vs Bots vs Skills naming confusion.** xAI runs companions (iOS), skills (reusable instructions), routines (scheduled workflows), plugins (connectors), and Bots (teammates) simultaneously. The FAQ dedicates a full "What is the difference between a skill and a routine?" box to combat the confusion [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)

---

## 18. Mapping to Lokma Bots — Explicit Inspiration Points

This section is the *Lokma plan precursor* you asked for. It does not build Lokma — it names the exact Grok Bot patterns to copy, adapt, or reject.

### 18.1 What to copy directly

- **Named durable teammate with avatar/description/memory** as the primary object, not a single assistant with toggles. One Bot = one job, one conversation, one approval boundary — proven to make context reusable. Cap at 50 Bots/account with pin/hide/sections for sanity [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots) [cursor.com/help/grok-bot/getting-started](https://cursor.com/help/grok-bot/getting-started)
- **Per-Bot `description` as durable system prompt** + per-message task instructions + reusable **Skills**. The "/ for skills, @ for attachments" composer mnemonic is clean and worth cloning [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- **Group chat for multi-Bot teams (2–6 bots)** + **async Bot-to-Bot DM handoff**. The group transcript as the audit trail for who did what is better than invisible orchestration [docs.x.ai/grok-bot/chat-and-collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)
- **Save → Test → Schedule** discipline: never let a workflow become a routine before it has succeeded once, been saved as a skill, and passed a test run on a second input [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- **Shareable Bot links** that copy *config* (identity/description/skills/routines) but never credentials/computer/history; recipient gets an independent copy. Pre-share sanitization reminder is non-negotiable [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)
- **Weekly pooled usage** with on-demand overflow and per-Bot metering shown separately from consumer pool; trial as a usage credit with 7-day window, measured in steps/tokens [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

### 18.2 What to adapt (improve for Lokma's context)

- **The shared computer:** Grok Bot's "one VM per user, all Bots share it" is simple but is the #1 security complaint. Lokma should offer **two modes**: *shared* (cheap, good for personal) and **per-Bot isolation** (separate VM/profile per Bot or at least per-project VM) with the isolation level chosen at Bot creation. Preserve the convenience of `/workspace`-like handoffs via an explicit **handoff folder** (e.g. `/handoff/<project>`) rather than ambient file sharing.
- **Model choice:** Grok Bot deliberately has none. Lokma should have a **default product-managed model with failover** but also expose **an org-level allowlist** and **a per-Bot override with admin ceiling** (Never / Allowlist / Free choice) so enterprise subprocessor constraints can be honored — the gap Grok leaves open [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- **Browser automation governance:** Keep computer-use but add a **site-reliability score** (last successful run, DOM-change signal) and an explicit **"Recheck after site change"** banner that pauses routines when a site's selectors drift — what Grok recommends manually but doesn't enforce [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- **Marketplace bootstrapping:** Don't wait for a fully open marketplace. Ship **(a)** a first-party curated Bot template gallery (like x.ai/bot's starter Bots), **(b)** a plugin catalog (mirror Grok's Marketplace → Yours split), and **(c)** share links day one. The independent bot.store shows that even ~50 polished templates with a "Hire" button create a real discovery surface before user-gen marketplace scales [bot.store](https://bot.store/)
- **Per-Bot avatar & color/shape picker** is minor but high-engagement (Piper examples, design pod naming). Keep it but add a **Lokma-wide Bot icon pack** so teams can standardize visuals per lane (sales=blue, ops=green, etc.) [cursor.com/help/grok-bot/getting-started](https://cursor.com/help/grok-bot/getting-started)
- **Pricing clarity:** Grok Bot marketing had tier-label ambiguity across cards. Lokma should publish a **single truth table**: tier → weekly Bot steps/tokens included → overage price per step/token → Bot count → routine count → group-chat seats — and surface "You have used X% of weekly Bot pool" in the composer itself, as grok.com does for consumer pools [grok.com/faq](https://grok.com/faq)

### 18.3 What to reject or handle carefully

- **No per-Bot sandbox as a security boundary** — don't copy the "screens are not security boundaries" semantics without warning. Make the boundary explicit and let teams pay for isolation.
- **No model picker at all** — enterprise data residency needs override you will be asked for.
- **Human-takeover for every sensitive step** is right but grok.com's manual is fragile (user must be available). Lokma should offer a **vaulted secrets** option (like Cursor's backend-hosted MCP tokens) *plus* the takeover path, with a clear rule: **if vault is used, the credential never hits transcript; if takeover is used, the Bot never sees it**. [docs.x.ai/grok-bot/approvals-security-and-privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)
- **Event listeners scoped broadly** — keep the Grok guidance: "Avoid broad listeners such as 'every new message.'" and enforce narrow selectors in the schema [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### 18.4 A concrete Lokma Bots v1 shape inspired by the above

> Not a spec — a checklist to turn into a plan doc next:

1. **Bot object:** `{id, name, title, avatar{image,color,shape}, description, instructions_template, memory_summary, skills[], routines[], notification_pref, isolation_level, allowed_connectors, approval_rules_ref}` — description is the only long free-text that travels with the Bot; memory_summary is derived, not edited.
2. **Auth:** Hermes account → Grok-Bot-like "dedicated cloud computer" per member; optionally upgrade to per-Bot VM. Sign-ins via vault or takeover; MCP/plugin tokens stored server-side, never in transcript.
3. **Creation:** New → Create bot (or suggested template gallery); Bot actions → Edit Profile; Duplicate; Share link (public but revocable, sanitization checklist before publishing); sections to organize by project/client.
4. **Composer:** same `@` (Bot/group/connector) + `/` (skill) + attach + reply-thread + reaction; transcript shows tool cards + computer preview + approval cards.
5. **Computer:** `/workspace/<bot_or_project>` durable, with handoff folder; browser session shared only within the chosen isolation level; takeover UI mirroring "Open Agent Computer → Take control → Return control."
6. **Skills/Routines:** save successful process as skill (when→inputs→sequence→validation→return→approval); scriptable schedule (cron) + event triggers with narrow selector; test run before enabling; 50 routines/bot, 20 recent runs kept; auto-pause after long away.
7. **Collaboration:** 1:1 Bot chat, group chat (2–6 Bots), Bot→Bot async DM + shared files; single-owner-per-stage guideline.
8. **Discovery:** template gallery (8 archetypes: Sales Outbound, Talent Scout, Paid Media, Expense Manager, Product Performance, Bug Repro, Account Health, Chief of Staff — matching Grok's canonical set), plugin marketplace (curated + community), share links, and eventually a third-party Bot store like bot.store.
9. **Pricing/billing:** weekly included Bot steps/tokens per Hermes tier + on-demand overflow; trial as usage credit + 7-day window; usage meter visible in composer and dashboard.
10. **Governance:** team rules (scoped to Hermes vs Bots), plugin allowlist/denylist, Auto-review (Require Approval vs Always Allow, Require wins), isolation ceiling (Never/Ask/Always for local execution), audit trail of Bot actions (coming in Grok Bot; ship in Lokma v1).

---

## 19. Appendix A: Key Doc Snippets (Verbatim)

> Short excerpts kept verbatim for legal/product-fidelity checks. All via web_extract char-limited excerpts.

**Overview — definition:**

> "Bots are AI teammates you can give real work to. Bots can sign and use apps and websites just like you do on a persistent cloud computer. They can collaborate independently, passing context between each other and handing off tasks, and understand the nuances of how you like work done over time. They finish jobs end to end, and only come back when something needs your approval." — [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)

**Overview — Bot equality:**

> "In the Docs and in the Grok Bot app, a Bot = a single persistent, named agent or one AI teammate." — [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)

**Overview — what makes it different (bullet set):**

> "It has a computer of its own. Each Bot runs on a persistent cloud VM with a browser, filesystem, and terminal. It can use connectors/MCP where available, and computer use for apps and websites without a clean API, so work finishes in the real tools rather than as chat drafts." — [docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview)

**Create and manage Bots — when to create a separate Bot:**

> "Create a separate Bot when the work has a distinct: Goal or area of ownership / Set of tools and sources / Working style / Approval boundary / Recurring schedule" — [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

**Create and manage Bots — creation steps:**

> "1. Choose New in the sidebar or press `Cmd/Ctrl+N`. 2. In New chat, select Create new agent. 3. Grok Bot creates and opens a Bot named New Agent. 4. Open Bot actions → Edit Profile to set its name, title, description, and avatar. 5. Start a conversation with a concrete task." — [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

**Create and manage Bots — description vs message:**

> "Use the conversation for task-specific instructions. Use the description for rules that should remain true: Description: 'Never send external messages without approval.' Message: 'Draft follow-ups for these twelve accounts.'" — [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

**Create and manage Bots — share:**

> "Share a public link when someone else should start from the same Bot. 1. Open the Bot and copy its share link. 2. Send the link. The recipient opens a preview on x.ai and can choose Add to Grok Bot. 3. They need the Grok Bot app to finish adding it. The link is public. Anyone who has it can view the Bot's shared configuration, including its identity, description, skills, and routines. Remove API keys, internal URLs, customer data, and anything else you would not put in a public document before you share. Adding a shared Bot creates a copy on the recipient's account. It does not give them your computer, logins, or conversation history. Shared Bots are created by other users, not by SpaceXAI. Adding one accepts the third-party bot terms." — [docs.x.ai/grok-bot/bots](https://docs.x.ai/grok-bot/bots)

**Computer and apps — one computer:**

> "Every Bot on your account uses the same computer: Browser cookies and signed-in sessions are shared / Files are visible to every Bot / Command-line credentials are shared / One Bot can continue from work another Bot saved" — [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)

**Computer and apps — screen semantics:**

> "Each Bot gets its own screen on the shared computer. Several Bots can therefore use browser and desktop tools in parallel, although one Bot can run only one computer-use task on its screen at a time. The screens are separate work surfaces, not separate security boundaries." — [docs.x.ai/grok-bot/computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps)

**Skills and routines — two building blocks:**

> "A skill is a reusable set of instructions for how to do a task. A routine tells one Bot when to run a workflow—on a schedule or, where supported, after an event." — [docs.x.ai/grok-bot/skills-routines-and-automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)

**Teams and enterprises — one VM per member:**

> "Each member gets one dedicated cloud computer. The computer is a managed Linux virtual machine. All of that member's Bots share the same computer, so files, sign-in sessions, and permissions belong to the member, not to an individual Bot." — [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

**Teams and enterprises — no model picker:**

> "Grok Bot has no model picker, for members or admins. We do not plan to allow admin or user choice for models that are used with Grok Bot. Model choice is fully managed by the product." — [docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)

**FAQ — do my Bots share one computer?:**

> "Yes. Every Bot on your account uses one persistent cloud computer. They share its files, browser sessions, and logins so they can hand work off. The computer is assigned per user, not per Bot. Do not use separate Bots as a security boundary." — [docs.x.ai/grok-bot/faq](https://docs.x.ai/grok-bot/faq)

**Plans — bundled:**

> "Grok Bot access is included on every paid individual Cursor plan and on Cursor Teams. You can also grant usage to your Cursor account by linking an individual SuperGrok, SuperGrok Plus, or SuperGrok Heavy subscription." — [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

**Plans — usage is Cursor-metered:**

> "Grok Bot usage is metered on your Cursor account, not on Grok. A SuperGrok link grants Grok Bot usage on that same Cursor account while SuperGrok stays active. It does not create a second meter on Grok, and it does not change your Cursor plan." — [cursor.com/help/grok-bot/plans](https://cursor.com/help/grok-bot/plans)

**bot.store — tagline:**

> "Bot Store — The App Store for Grok Bots" — [bot.store](https://bot.store/)

**Launch post — 90% vs 100%:**

> "There is a huge difference between 90% done and 100% done. Most AI gets you almost there. Grok Bot can finish the swing, because the work lands where a human would put it, in the actual tool." — Roman, Product, quoted in [x.ai/news/introducing-grok-bot](https://x.ai/news/introducing-grok-bot)

---

## 20. Appendix B: URL Index

All URLs visited / extracted for this dossier (and to cite in any derived Lokma Bots plan):

### First-party xAI / Grok Bot

- https://x.ai/bot — landing page, pricing cards, feature tiles, partner logos, access CTA
- https://x.ai/bot/use-cases — use-case tiles mirrored from docs
- https://x.ai/bot/guides/designing-grok-bot-with-grok-bot — design pod guide (Figma Bro / Motion God / Experiments / Devbot)
- https://x.ai/news/introducing-grok-bot — launch post 2026-08-11
- https://x.ai/news/grok-bot-more-plans — expansion post 2026-08-26
- https://x.ai/pricing — SuperGrok plan table
- https://docs.x.ai/grok-bot/overview — overview + "what makes Grok Bot different"
- https://docs.x.ai/grok-bot/get-started — prerequisites, install, first Bot, first task, sign-in
- https://docs.x.ai/grok-bot/use-cases — eight specialist roles with prompts
- https://docs.x.ai/grok-bot/bots — create/manage Bots, share, memory, organization
- https://docs.x.ai/grok-bot/chat-and-collaboration — 1:1, groups, handoffs, threads
- https://docs.x.ai/grok-bot/computer-and-apps — shared computer, browser, connectors, /workspace, takeover, local computer
- https://docs.x.ai/grok-bot/files-and-results — attachments, reviewable results
- https://docs.x.ai/grok-bot/skills-routines-and-automations — skills, routines, teach-by-demo, testing
- https://docs.x.ai/grok-bot/settings-and-notifications — settings, notifications, attention states
- https://docs.x.ai/grok-bot/approvals-security-and-privacy — approvals, Auto-review, handoff, least privilege
- https://docs.x.ai/grok-bot/teams-and-enterprises — isolation, SSO, egress IPs, admin controls, billing, roadmap
- https://docs.x.ai/grok-bot/faq — cross-cutting FAQ including pricing/models
- https://grok.com/ — grok.com home (chat entry)
- https://grok.com/faq — consumer FAQ (weekly pool, connectors, Grok Bot cross-reference)
- https://grok.com/skills — skills listing (raw HTML)
- https://grok.com/release-notes — release notes (scraped)
- https://cursor.com/help/grok-bot/getting-started — Cursor help: first agent, sidebar sections, troubleshooting
- https://cursor.com/help/grok-bot/plans — Cursor help: eligibility matrix, usage meter, trial as credit, linking SuperGrok

### Third-party / community / marketplace

- https://bot.store/ — independent Bot Store (app store for Grok Bots, non-xAI)
- https://github.com/rdmgator12/awesome-grok-bot-plugins — community plugin catalog (219 plugins, 13 categories, 2026-08-12 snapshot)
- https://runtimewire.com/article/grok-bot-testing-marketplace-third-party-ai-teammates — report that xAI is testing a native Bot marketplace
- https://www.mindstudio.ai/blog/grok-bot-setup-guide — third-party setup guide (desktop+mobile iMessage-like chat window)
- https://coursiv.io/blog/grok-bot — Grok Bot Workflow workshop notes (Lauren Tan 10–20 bots)
- https://cellcog.ai/blog/grok-bot-pricing/ — pricing explainer noting "no standalone subscription as of Aug 26 2026"
- https://www.vellum.ai/blog/official-grok-bot-breakdown — third-party breakdown

### Legacy personalization (for contrast)

- https://techwiser.com/groks-new-customize-feature-get-personalized-ai-responses/ — 2025-02-05 Customize Grok walkthrough
- https://www.blutrumpet.com/post/change-grok-response-style-personality — 2026-03-15 response style guide (Concise/Formal/Custom)
- https://www.blutrumpet.com/post/grok-custom-instructions — custom instructions 2026 deep dive
- https://www.eonmsk.com/2025/08/04/xai-grok-bringing-custom-companions-feature-for-personalized-experience/ — companions feature note
- https://toolchase.com/blog/how-to-use-grok/ — how to use Grok 2026 (pricing context)

---

> **Line count note:** This dossier is written to exceed 500 lines as requested. It is structured as a markdown file with explicit sections covering: (1) what Grok bots are, (2) bot builder creation flow, (3) store/marketplace discovery, (4) chat/switching/collaboration, (5) specialist vs single-agent contrast, (6) pricing/limits, (7) flows/screenshots, plus the requested mapping to Lokma Bots.

