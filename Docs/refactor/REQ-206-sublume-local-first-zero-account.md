# REQ-206 — Sublume: local-first mode, zero account, zero backend

**Status:** `pending`
**Date:** 2026-10-05
**Requested by:** Furkan
**Companion to:** REQ-204 (product), REQ-205 (UI + backend library)
**Rule:** no code until the owner says "yap" / "do it".

---

## What was asked

> "istersek kendi şeyimiz olacak, istersek de lokal olarak ben videoyu oraya yükleyebileceğim ama bir
> backend upload değil, direkt plan site olarak video artı ses dosyasını oraya atabileceğim… direkt
> olan sublight dan görebileceğim, lokadan çalışabileceğim. Dictionary falan, internete, backend'e
> falan bağırılır, **hesap mantığı falan açmaya gerek olduğunu bilmiyorum.**"

The last clause is a requirement, not a shrug: **no account for the core experience.**

## The decision

Sublume's default mode is a **local-first player**. Everything works with no account, no
backend and — for the core loop — no network.

| | Local mode | Library mode (REQ-205) |
|---|---|---|
| Account | **none** | required |
| Backend | **none** | required |
| Media source | files the user drops | CDN |
| Dictionary | bundled offline data, network only for gaps (D13) | same |
| Vocabulary bank | local SQLite (`~/.lokma/sublume/vocab.db`) | same, per account |
| Auth | none | Lokma auth (Docs/36) |

**The account is not a prerequisite — it is a later feature.** REQ-205 slice 5 is where
accounts appear, and only because a shared backend library needs an owner to attach media to.

## Why this is the right default, beyond following the ask

- **DRM is the moat, not the obstacle.** Netflix/Prime/Disney are out of scope (D12)
  because decryption happens inside the CDM. A local player sidesteps the entire legal and
  technical problem, and it is the *better* product for a serious learner: own files, no
  subscription ladder, works on a plane.
- **Privacy.** A vocabulary bank is a map of what someone doesn't know. Keeping it local by
  default is the correct default for that data.
- **It is a smaller first slice.** No upload, no CDN, no storage cost, no accounts, no
  abuse surface. Slice 1 of REQ-205 becomes genuinely shippable on its own.

## What "local" means concretely

| Concern | Decision |
|---|---|
| Video | `<input type=file>` + drag-drop → `URL.createObjectURL` → `<video>` |
| Audio track | Muxed in-browser (Web Audio / MSE) or server-side with the local ffmpeg |
| Subtitles | sidecar `.srt`/`.vtt` dropped alongside, or auto-matched by filename |
| Storage | nothing leaves the machine; only the vocabulary bank and settings persist |
| Data root | `~/.lokma/sublume/` (vocab.db, media/ for dropped files if retained) |
| Network | dictionary gaps only, per D13 |

**Cleanup is a real requirement.** If files are copied into `~/.lokma/sublume/media/`,
there must be a "forget this file" action that removes the copy — silently duplicating a
4 GB film into Lokma's data dir is a trap, not a feature. Holding an `objectURL` without
copying is the default; copying is opt-in.

## Non-goals for this mode

- No transcoding on import (v1 plays what the browser can play).
- No upload progress, no resumable transfer — there is no upload.
- No sharing of a local library between machines.

## Risks

| Risk | Note |
|---|---|
| Browser codec limits | Some containers won't play in-browser. Fallback: report it honestly and offer server-side remux with the local ffmpeg rather than pretending it will work. |
| "Local" is three different things | A blob URL (dies with the tab), a copy in the data dir (uses disk), and a user path (best). The UI must be explicit about which one is in play. |
| Accidental disk fill | Mitigated by opt-in copying + a visible total size. |

## Decision needed from the owner

- Should dropped files be copied into `~/.lokma/sublume/media/` by default, or referenced
  in place (recommendation: referenced in place, copy is opt-in)?
- Should the local mode support folders/watch-later, or just single files?

## Status log

- 2026-10-05 — written as `pending`. No code written.