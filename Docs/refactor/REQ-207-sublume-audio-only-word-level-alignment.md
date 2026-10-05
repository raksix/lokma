# REQ-207 — Sublume: audio-only mode needs word-level timing, so alignment enters here

**Status:** `pending`
**Date:** 2026-10-05
**Requested by:** Furkan
**Depends on:** REQ-206 (local mode), research doc `05` and D11 in `raksix/sublume`
**Rule:** no code until the owner says "yap" / "do it".

---

## What was asked

> "video artı ses dosyasını oraya atabileceğim video artı ses dosyasını atabildiğim için direkt olan
> sublight dan görebileceğim"

The phrase **"video artı ses dosyasını"** — video *plus* audio file — is the trigger for
this file. It implies two distinct cases, and the second one overturns an earlier decision.

## The two cases

| Case | Subtitles available? | Timing needed |
|---|---|---|
| Video + audio (audio replaces or augments the video track) | Yes — sidecar `.srt`/`.vtt` | sentence-level is enough (D11) |
| **Audio only** | **No** | **word-level is mandatory** |

**Why audio-only forces the issue.** With no subtitle to read, the transcript *is* the
subtitle. And a transcript that cannot say *which word is being spoken right now* is a wall
of text, not a karaoke line — which is the entire experience. So the deferred forced-alignment
stack (D11: WhisperX / stable-ts / MFA) is **not deferred for this path**; it becomes
load-bearing.

This does not contradict D11. D11 said v1 does not need word timing **for video with
subtitles**. Audio-only is a different slice and a different requirement.

## Measured on this machine (2026-10-05)

| Fact | Value |
|---|---|
| `faster-whisper` Python package | **not installed** |
| Whisper **model files** | **already downloaded** — `~/.cache/huggingface/hub/models--Systran--faster-whisper-base` and `-medium` |
| `ffmpeg` | available, 9.0.1 |

So the expensive part (model download) is already paid for. What remains is installing the
package and wiring the pipeline. `medium` was chosen over `base` in prior STT work in this
infrastructure; `base` is acceptable for a first pass and much faster on CPU.

## Pipeline options

| Option | Quality | Cost | Fits when |
|---|---|---|---|
| **`faster-whisper` with `word_timestamps=True`** | good, gives per-word spans directly | model already local, CPU seconds per minute of audio | default for audio-only |
| **WhisperX** | better alignment on noisy audio | heavier deps (torchaudio etc.), heavier install | only if `faster-whisper` alignment proves off |
| **`stable-ts`** | good, refines alignment | moderate | alternative to WhisperX |
| **MFA (Montreal Forced Aligner)** | best on clean speech | needs a pronunciation dictionary + corpus setup | overkill for v1 |
| **Interpolate from a transcript** | none | free | **never ship as fact** — flag `estimated` provenance (research `02` §5) |

**Recommendation:** `faster-whisper` + `word_timestamps=True` first, because the models are
already on disk and it returns word spans in one pass. Everything it produces is `source`
provenance, not `estimated`.

## The provenance rule (carried from research doc `02`)

The normalisation model must carry provenance on every word:

```
words: [{ text, start, end, source: 'cue' | 'aligned' | 'estimated' }]
```

and the UI must never present `estimated` as fact. This is the honest-reporting rule the
whole project has used so far (see `08-MEASURED-FINDINGS.md`).

## Slices

| # | Slice |
|---|---|
| A | Drop audio → transcribe with `faster-whisper` (medium) → show transcript with per-word timing as subtitles |
| B | Same, plus click-a-word popover on the generated transcript |
| C | Re-transcribe at `base` for speed; let the user pick quality per file |
| D | Optional: keep the user's own `.srt` and *align* it to audio instead of transcribing (cheaper, no ASR, better text quality) |

**Slice D is worth noting:** if the user has a subtitle file, aligning it is strictly better
than transcribing — the text is already human-authored and correct. Alignment only needs
faster-whisper (or even just audio silence detection) to place words. Slice D should be
considered before slice A for users who already have subs.

## Risks

| Risk | Note |
|---|---|
| Long files | A 2-hour film transcribes slowly on CPU. Must be background + cancellable + progress, and must never block playback of an existing subtitle. |
| Model availability | Models are cached now; a fresh machine needs the download. |
| Wrong transcription | Proper nouns in film dialogue transcribe badly. Slice D (align the user's own text) avoids most of this. |
| Legal | Transcribing the user's *own* local audio is fine. Doing it for a distributed catalogue is a different question — see REQ-205's open licensing question. |

## Decision needed from the owner

- Slice D first (align the user's own subtitles — cheaper and more accurate) or slice A
  first (transcribe from scratch — works with no subtitle at all)?
  **Recommendation: D first**, because a learner who has subtitles almost always wants them
  respected, and A is the fallback for when they do not exist.
- Model default: `medium` (better) or `base` (faster)?

## Status log

- 2026-10-05 — written as `pending`. Written specifically because "video artı ses
  dosyasını" in REQ-205 implies the audio-only case, which D11 did not cover. No code.