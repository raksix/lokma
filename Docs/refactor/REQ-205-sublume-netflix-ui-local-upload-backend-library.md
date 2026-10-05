# REQ-205 — Sublume: Netflix-grade UI + local upload + server-side video library (backend)

**Status:** `pending`
**Date:** 2026-10-05
**Requested by:** Furkan
**Companion to:** REQ-204 (the product), REQ-206 (local-first mode)
**Rule:** no code until the owner says "yap" / "do it".

---

## What was asked

Verbatim intent, three parts:

> "Netflix UI benzeri bir uyay yap" — build a Netflix-like UI.
>
> "istersek kendi şeyimiz olacak, istersek de lokal olarak ben videoyu oraya yükleyebileceğim ama bir
> backend upload değil, direkt plan site olarak video artı ses dosyasını oraya atabileceğim video artı
> ses dosyasını atabildiğim için direkt olan sublight dan görebileceğim, lokadan çalışabileceğim."
> — either it is our own thing, or I can upload the video *locally*. Not a backend upload: a plain
> local page where I can drop video + audio files, and from those I can watch it with subtitles
> running, locally.
>
> "Dictionary falan, internete, backend'e falan bağırılır, hesap mantığı falan açmaya gerek olduğunu
> bilmiyorum." — dictionary and such can call the network / backend; I don't think we need an account.
>
> "yine biz hani backend'imize falan da şey ekleyebilirimi. Video, film, dizi, film ekleyebilirim ama
> backend için CDN falan kullanabiliriz, direkt frame falan çekebilirim" — and I can also add things to
> our backend: video, film, series. For the backend we can use a CDN, and I can pull frames directly.

## Three modes, not one

This is the clarification that matters most: Sublume is not a single deployment.

| Mode | Video comes from | Needs account | Needs network | Runs on |
|---|---|---|---|---|
| **1. Library mode** | Sublume's own backend + CDN | ✅ yes | ✅ yes | Lokma server |
| **2. Local mode** | files the user drops on the page | ❌ **no** | ❌ **no** | Lokma locally |
| **3. YouTube mode** | `yt-dlp` | ❌ no | ✅ yes | Lokma locally |

Modes 2 and 3 are the *default* and need no account. The account exists only for mode 1.
That directly satisfies "hesap mantığı falan açmaya gerek olduğunu bilmiyorum".

## What was asked, item by item

### 1. Netflix-like UI

Dark, cinematic, poster-forward, one dominant surface, minimal chrome during playback —
the opposite of Lokma's IDE density. Specifically:

- **Media rail / library grid** — poster cards, hover lift, progress indicator on
  continue-watching.
- **Detail view** — backdrop art, synopsis, cast row, episode list for series.
- **Player** — the focus is the frame; subtitles float above; popover appears near the word.
- **Chrome recedes while watching** — this is the Netflix trait that matters, and it maps
  onto a Sublume mode page rather than an Inspector pane.

**Constraint:** Lokma already owns a design system (shadcn) and its own themes. Netflix-like
means *this one surface* is cinematic — not that Lokma restyles. Everything stays inside
Lokma tokens; no new colour system.

### 2. Local mode — video + audio, dropped on the page

The user drops **video and/or audio files onto the page**. Not an upload to a backend — a
local file input / drag-drop, `URL.createObjectURL`, playback from disk.

| Case | Handling |
|---|---|
| Video **+** separate audio | Mux in-browser or via server-side ffmpeg; the video element gets the audio track |
| Video only | Normal playback |
| **Audio only** | Why this matters: the audio-only path is exactly where **word-level timing becomes mandatory** — there is no subtitle to read, so the transcript *is* the subtitle. This is the strongest v1 argument for a lightweight alignment/ASR step (see REQ-207) |

**Measured on this machine:** `ffmpeg` 9.0.1 is available at
`/root/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg`, and Lokma already shells out to it
(`packages/lokma-core/src/archify/webm.ts`). So muxing and frame extraction are not new
dependencies.

### 3. Dictionary over the network is fine; no account needed

Already settled as D13 (offline-first with a network fallback), but this confirms the
priority order: **local first, network allowed, never required.**

### 4. Backend library + CDN + frame extraction

- **CDN:** Cloudflare R2 or Backblaze B2. Backblaze B2 is already wired in this
  infrastructure (redwind uses `f003.backblazeb2.com` with SigV4 and an application key —
  the master key only works against the local B2 API). Reuse that pattern rather than
  inventing a new one.
- **Frames:** extract a poster and N scene frames with ffmpeg server-side, store them
  beside the media, serve through the CDN. This is what makes a Netflix-style grid
  possible without shipping original video to every client.
- **Streaming:** HLS via ffmpeg for adaptive delivery, or progressive MP4 for v1.

## Slices

| # | Slice |
|---|---|
| 1 | Local mode: drop video(+audio) → play → sidecar subtitle → per-word click → popover → bank |
| 2 | Netflix-style library grid + detail view, fed by local files only |
| 3 | Audio-only mode with generated transcript + word timing |
| 4 | Backend library mode: upload → CDN → poster/frame extraction → HLS |
| 5 | Accounts (only now does an account exist) |

**Slice 1 first** — it is the whole product promise with zero infrastructure, and it needs
no account, no CDN and no backend.

## Risks

| Risk | Note |
|---|---|
| **Media licensing** | A backend library of films/series is legally different from a local player. This is the owner's call and must be explicit — see the open question. |
| Audio-only needs ASR | Not free: model download + CPU time per file. `faster-whisper` **model files are already downloaded** on this machine (`models--Systran--faster-whisper-base`, `-medium`) but the Python package is not installed. |
| Frame extraction cost | Cheap with ffmpeg; the real cost is storage × catalogue size. |
| Scope | Three modes is a lot. Slice 1 proves the loop; the rest attach to it. |

## Decision needed from the owner

- **The media licensing question:** is the backend library meant for content the user owns,
  or for third-party films/series? This changes the legal surface completely and I will not
  guess it.
- Approve the Netflix-like direction for the Sublume surface, given Lokma keeps its own
  design system.
- Which slice first (recommendation: slice 1 — local mode).

## Status log

- 2026-10-05 — written as `pending`, from a mid-research addition to REQ-204.
  No code written.