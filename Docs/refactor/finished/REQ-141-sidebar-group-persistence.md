# REQ-141 — The sidebar remembers which groups you folded

**Status:** done · 2026-09-14

## Request (user, verbatim)

> "abi mesla ben home'u gizledim ya f5 atınca da gizli kalsın yaptıklarımı hatırlasın amk"

Screenshot: the sidebar with the **Home** group folded and only the project
list visible — after a refresh Home was open again.

## Root cause

`expandedProjects` lived in `React.useState` inside `sessions-sidebar.tsx`, so
the layout existed only for the lifetime of the tab:

```tsx
const [expandedProjects, setExpandedProjects] = React.useState<Set<string>>(new Set([HOME_KEY]));
```

Every reload re-ran that initialiser and re-opened Home. Worse, the
`[query, groupBy]` effect (`setExpandedProjects(new Set([HOME_KEY]))`) also
fires on mount, so even a correct initial read would have been overwritten.

## Change

New store `packages/lokma-web/web/src/components/sessions/group-storage.ts`:

| Export | Behaviour |
| --- | --- |
| `GROUP_STORAGE_KEY` | `lokma-sidebar-groups` — one JSON array of group keys |
| `parseGroupKeys(raw)` | never throws: corrupt JSON, non-arrays and non-string/empty entries are discarded (returns `null` when there is no usable record) |
| `serializeGroupKeys(keys)` | sorted, so two equal layouts produce the same string |
| `readExpandedGroups(storage?, fallback)` | stored layout, else the caller's default (`[HOME_KEY]`) |
| `writeExpandedGroups(keys, storage?)` | guarded write |

Wiring in `sessions-sidebar.tsx`:

1. `useState(() => readExpandedGroups(undefined, [HOME_KEY]))` — the fold is
   read back before the first paint.
2. The `[query, groupBy]` effect now collapses to `new Set()` **only while a
   query is active**; clearing the query restores the user's layout instead of
   forcing Home open.
3. A second effect persists, and it is skipped while searching — the
   search-time collapse is transient and must not overwrite the preference.

Key semantics: `null` (never stored) = no opinion → default layout;
`[]` (stored) = "I folded everything" → honoured. That distinction is the
whole reason a bare array is enough.

## Evidence

- Unit — `group-storage.test.ts`: round trip, missing-vs-empty layout, corrupt
  JSON, non-array record, dropped non-string entries, and hostile storage that
  *throws* on read and write (found by the test: the first `readExpandedGroups`
  only guarded access, not the `getItem` call). All PASS.
- Regression — `sessions.test.ts` 45/45; `bun x tsc --noEmit` 0; `bun run build`
  green; `pm2 restart lokma-web` → `http://127.0.0.1:3457/` 200.
- Live — `scripts/probe-sidebar-persistence.cjs` against
  `https://lokma.fermag.com.tr`: **13/13 PASS** — fresh browser starts open
  (`["home"]`), fold writes `[]`, **F5 keeps it folded** (`aria-expanded=false`,
  stored `[]`), a search does not overwrite the stored layout, clearing the
  search brings the fold back, unfolding writes `["home"]`, no failed requests.

## Pitfall (probe, not app)

The first probe run reported "F5 keeps Home folded" as a failure while the app
was already correct: the probe seeded its token with
`addInitScript(() => { localStorage.clear(); ... })`, and `addInitScript` runs
on **every** navigation — it deleted the stored layout on reload. A fresh
browser context already starts with empty storage, so the seed must only write
the token.

## Files

- `packages/lokma-web/web/src/components/sessions/group-storage.ts` (new)
- `packages/lokma-web/web/src/components/sessions/group-storage.test.ts` (new)
- `packages/lokma-web/web/src/components/sessions/sessions-sidebar.tsx`
- `scripts/probe-sidebar-persistence.cjs` (new)

Commits: `4308ccc` (store + wiring), `284c1e3` (tests), `52613f4` (probe).
