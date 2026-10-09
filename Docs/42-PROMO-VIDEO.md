# 42 — Lokma promo video (the 25-second harness film)

> **Status: shipped.** Live at
> <https://files.fermag.com.tr/share/lokma-harness-promo.mp4>
> (1920×1080, 30 fps, 25 s, `video/mp4`, no auth).
> Authoring project `/root/lokma-promo`; deliverable repo
> <https://github.com/raksix/lokma-harness-promo> (private).

## What was asked

Make a promo for the Lokma harness in the shape of
<https://skillry.dev/ai-videos/opus-5-5/justinbuilds-412401> — a 22-second
kinetic-typography piece, built with HyperFrames.

The reference was pulled apart before anything was written: 1280×960, 30 fps,
22.5 s, and its own voiceover was transcribed with faster-whisper. Its structure
is the whole lesson:

| reference | beat |
| --- | --- |
| 0.0–6.3 | `How do you communicate that you're going through a change?` |
| 6.3–7.7 | `You don't.` |
| 7.7–10.4 | `You just show it.` |
| 10.4–18.3 | `Action.` `Intention.` `Curiosity.` — one word per beat |
| 18.3–22.5 | `Through one's own ability to love.` |

A question, a refusal, a statement, three one-word hits, a close. Cream/paper
grounds alternating with full-black ones, hard cuts, and a voiceover that owns
the timing. Lokma's version keeps that rhythm exactly and swaps in its own
words and numbers.

## The approved bed (25s, music-only)

The client picked a track **by ear** from six 15-second clips. The clip that won was cut
from 5 s of *Techno Fest Vibes* (Mixkit, royalty-free, no attribution required). The film
had been using a **different window** of the same track (85 s), so the section they signed
off on was not the section that played. Fixed by rebuilding the bed from the same 5 s
window and verifying it: the bed's first 15 s matches the approved clip's spectrum to
within 0.4 points of sub-150 Hz share.

Two lessons worth keeping:

- **A metric measures the axis it measures.** "Space Fighter Loop" scored closest to the
  reference on band shape (dist 0.073) and still sounded like arcade music in the cut. The
  score ranked *spectra*, not *genre* — so when the ear disagrees with the number, the
  number is answering a different question. Widening the candidate pool to modern
  electronic/trap/synth catalogues is what actually fixed it.
- **Ship the section that was approved, not the section that scored.** When approval comes
  from a clip, the clip's own window is the specification. Selecting a different window of
  the same track silently substitutes a different piece of music.

## The music-led cut (25s, no voice)

The voice was the problem, not its timing. It had been generated, timed and measured
for continuity — and the fix was to remove it: the reference the user pointed at
(`x.com/higgsfield_ai/status/2108308782757634471`) carries **no speech at all**. Its
audio is music and sound design. That is the target.

So the film now has one sound source, scored against the reference's own measurements:

| measurement | reference | the cut |
|---|---|---|
| sub-150 Hz share | 80.8 % | 80.2 % |
| 150–500 Hz | 8.5 % | 9.7 % |
| 500 Hz–2 kHz | 4.8 % | 5.0 % |
| 2–6 kHz | 3.3 % | 4.1 % |
| integrated loudness | −14.4 LUFS | −14.4 LUFS |

Bed: **"Space Fighter Loop" by Kevin MacLeod** (CC BY 4.0), cut at 10 s — the closest of
nineteen candidates, chosen by band-shape distance, transient density and spectral
centroid against the reference. Two traps worth keeping:

1. **Do not measure bands with cascaded ffmpeg filters.** `lowpass=150` + `bandpass` +
   `highpass=2000` are not disjoint; on the reference they summed to **153 %**, which
   inflates whichever band you look at. The FFT of a windowed frame gives disjoint bands;
   that is what the table above is built from.
2. **The short candidate wins for the wrong reason.** The first scoring pass sampled a
   25 s window at offsets up to 90 s without checking the window fit inside the file, so a
   55 s track got sampled at 45 s with 10 s of it missing — and its truncated tail scored
   as "energetic". Clamp the scan to `duration - window` or you are rewarding a
   measurement artifact.

Uploading the reference for measurement: `youtube-dl`-style extractors do not support
`x.com/.../status/<id>` URLs; the syndication JSON
(`cdn.syndication.twimg.com/tweet-result?id=<id>`) carries the direct
`video.twimg.com/amplify_video/...` variants, including the 1080p mp4.

## The continuous cut (25s, unbroken voice, measured bed)

The brief changed: **the voice must not stop for 25 seconds**, with music under it.
That kills the line-by-line approach — per-line files leave joins you can hear.

What changed, and how each claim is checked:

- **One unbroken read.** A single `edge-tts` utterance of the whole script, trimmed and
  normalised once. Proof, not assertion: `silencedetect=n=-45dB:d=0.2` finds **no**
  silence longer than 0.2 s in the voice track *or* in the final mix.
- **Scene changes on measured speech, not a grid.** Whisper word timings give the real
  moment each sentence starts (`"harness"` 3.50, `"prompt"` 4.94, `"reads"` 8.06,
  `"visible"` 14.36, `"reasons"` 19.04, `"acts"` 20.30, `"session"` 22.36), and the cuts
  land there. The picture follows the voice; the voice never waits for the picture.
- **The bed is chosen by measurement.** Eight candidates (Kevin MacLeod / incompetech)
  were scored for what actually matters under continuous speech: energy in the low end,
  a *hole* in the 300–3400 Hz speech band, and movement inside the window. Winner:
  **Impact Lento**, window from **182.5 s**, speech-band energy **3.6 %** (the next best
  was 23 %). Credit: *Music: "Impact Lento" by Kevin MacLeod — CC BY 4.0*.
- **The licence travels with the film.** Impact Lento is CC BY 4.0, which requires
  attribution wherever the work goes — a README does not satisfy it. The credit is burned
  into the sign-off frame: `music · impact lento — kevin macleod · cc by 4.0`, set in the
  cream-legible muted token (`#6b6862`, 5.03:1). Using `--muted-dk` there would have read
  at 2.40:1 on cream and failed the contrast gate.
- **Ducking is gentle on purpose.** The bed is cut at −27 LUFS and the lane ducks to
  `0.62`. Two hard attenuations (a quiet bed *and* a deep duck) make the music vanish
  instead of sitting under the voice.

**A trap worth remembering: the builder must build from a fixed head.** The first
attempt appended the new cut to the current file, so each rebuild left the previous
cut's CSS in place — stale `#s10` rules from the 33.5 s version ended up after the live
`#s8` rules and won the cascade, and the sign-off block measured as three stacked bars
at the top of the frame. The builder now reads `project/_head-pristine.html` (the
original film's CSS, extracted once) and appends everything else. Disposable assets do
not accumulate in a file that is regenerated.

## The extended cut (33.5s, 16 voice lines)

The first pass was 25s with 7 lines. The second pass grew the voice to 16 lines
and re-cut around them, and made the edit **flow**:

- a scene change lands on the frame its voice line starts, and the next scene's
  wipe begins **0.42 s before** the outgoing content is gone — so both scenes are
  on screen together for a moment and **no frame in the film is a still**;
- the picture never waits for the voice: the picture moves while the voice talks,
  rather than the voice filling a gap in the picture;
- the bed carries **one volume automation lane** that ducks to `0.42` under every
  line and lifts back to `1.0` in the gaps (one lane on the track, no volume tween
  — the contract says the lane wins and a tween would be ignored).

Two structural notes worth keeping:

1. **A scene's `data-duration` now overruns into the next scene's window.** That is
   the overlap: `dur = next_start - start + 0.42`. It is legal (each section is its
   own timed element on its own paint order) and it is what removes the still
   frames. `timeline` will show the sections overlapping — that is the design.
2. **More lines needed a longer bed**, so `gen_amb.py` was retargeted from 25 s to
   40 s and given a low-end lift at each of the ten new scene changes.

## The film

| t | scene | ground | on screen |
| --- | --- | --- | --- |
| 0.1–4.9 | the question | cream | `How do you explain a harness?` |
| 4.9–6.1 | the refusal | ink | `You don't.` |
| 6.1–8.0 | the statement | ink | `You just show it.` |
| 8.0–11.3 | the harness | ink | `Tools.` `Context.` `Permission.` |
| 11.3–17.0 | the proof | cream | a terminal types a real turn: edit → test → commit → push |
| 17.0–19.6 | the loop | ink | prompt → stream → **tools** → verify → commit |
| 19.6–21.4 | the point | cream | `The model only reasons.` / `The harness does the rest.` |
| 21.4–23.1 | two surfaces | cream | `lokma tui` · `23 panes` · four themes |
| 23.1–25.0 | sign-off | cream | `Lokma.` + `lokma.fermag.com.tr` |

Copy is this repo's README, not invented marketing: the terminal's turn, the
loop diagram's five stages and the pane count are all things Lokma actually does.

Palette is Lokma's `claude` theme — cream `#FAF9F5`, terracotta `#C96442`, ink
`#1A1917` — because it is the theme the owner ships and picked for the brand.

## Sound

Everything is generated, so nothing has to be licensed, and every render is
reproducible.

- **Voiceover** — eight lines through `edge-tts`
  (`en-US-AndrewMultilingualNeural`, `+6%`, `-2Hz`), then silence-trimmed with
  `silenceremove` and normalised with `loudnorm=I=-16`. Each line is a separate
  `<audio>` clip placed at its own timestamp, so the voice lands on the word.
- **Bed** — `scripts/gen_amb.py` (numpy, fixed seed): a warm A1 drone with slow
  swells, an airy noise bed, and a 41 Hz lift under each beat flash. 25 s.
- **Transitions** — the same script emits a filtered-noise whoosh, one per cut,
  and a small UI tick for the typed terminal lines.

## The composition

One `index.html`: markup, CSS, and a single paused GSAP timeline registered on
`window.__timelines["main"]`. `npx hyperframes check` passes with 0 errors.

Notable decisions, each of which came from a measurement:

- **One ease family for the whole film.** Arrivals are `expo.out`, exits are
  `expo.in`. Changing easing between cuts is what makes a motion piece read as
  separate screens instead of one camera move.
- **Ground changes are a wipe, not a fade.** A cream or ink sheet peels off the
  scene it was covering (`scaleX` 1 → 0) at every cut. A fade of the whole scene
  is not seek-safe; a wipe is.
- **The terminal lines reveal on themselves** (`y` + `opacity`), not behind an
  opaque cover. A cover that only spans part of a line reads as a defect, and
  `check` says so — see the skill note below.
- **Terracotta is split into two tokens.** `#C96442` on cream measures 3.9:1 and
  fails WCAG AA at body size, so small terracotta text uses `#B14E2E` (4.96:1).
  On the ink ground, `#E08A63` (6.7:1).

## Lessons worth keeping

1. **`data-layout-allow-occlusion` belongs on the covering element**, not on the
   text being covered — the rule reads where the intent sits. Marking the text
   changes nothing, and a partial cover still leaves transient info findings.
   When the goal is a staged reveal, revealing each element on itself is the
   clean fix and needs no escape hatch at all.
2. **`check`'s contrast audit is the gate that catches palette drift.** Two
   greys used for terminal chrome (`#7d7972`, `#8d8981`) measured 3.4–3.8:1 on
   cream and were reported as errors, not warnings.
3. **A `clip_media_fit` warning is a real shortcut.** An `<audio>` slot longer
   than the file gets shortened at render time; set `data-duration` to the file's
   real length so the timeline says what it does.
4. **Silence-trimming changes the edit.** `silenceremove` + `loudnorm` cut the
   generated lines to 60–70 % of their raw length, so the on-screen timing was
   retimed to the trimmed durations, not the raw ones.
5. **`crossorigin` on media is a hard lint error** — never add it, including for
   canvas/WebAudio readback.

## Two formats, one source

Landscape `1920x1080` and portrait `1080x1920` (Reels/TikTok/Shorts). The
portrait composition is **generated** from the landscape master by
`make_formats.py` — a measured transform, not a hand-forked copy, so the two
cannot silently drift. Every substitution is asserted: a master change the
generator cannot map fails loudly instead of shipping a wrong portrait.

Portrait is not a scale-down. Usable width drops 1520 -> 920 px, so:

- type scales **0.72–0.76**, not the raw 0.605 width ratio — portrait has far
  more vertical room, so blocks sit lower and larger than a pure scale would;
- the two surface cards stack into a column and the chips become stacked pills;
- the loop diagram is **re-laid-out** for the narrower frame (boxes and wires
  recomputed, pulses travel a start+delta so the geometry lives in one place);
- the wordmark steps **236 -> 126 px** so it fits the 1080 px width.

Two measured traps in this pass:

1. **The root's framed size is `data-width`/`data-height`, not the CSS vars.**
   Setting `--w`/`--h` to 1080/1920 leaves the root stamped at 1920x1080 — the
   probe printed `data=1920x1080 box=1080x1920`, which is what exposed it.
2. **A still page shows the START of the film, not its layout.** GSAP stamps
   tween start values (`scale: 1.06`, `x: -56`) at build time, so a geometry
   probe that does not neutralise transforms measures entrance offsets and
   reports overlaps that do not exist. The probe now forces
   `transform: none; opacity: 1` before measuring; the same three "overlaps"
   went to zero.

Portrait gate: `check --snapshots` **0 error**, geometry probe
**0 out-of-frame selectors**.

## Reproducing

```bash
cd /root/lokma-promo/project
npx hyperframes@0.8.143 check             # lint + runtime + layout + motion + contrast
npx hyperframes@0.8.143 render --quality delivery --crf 14 --output out/lokma-harness-promo-1080p.mp4
```

Portrait:

```bash
/usr/local/lib/hermes-agent/venv/bin/python3 /root/lokma-promo/make_formats.py
cd /root/lokma-promo/portrait
npx hyperframes@0.8.143 check
npx hyperframes@0.8.143 render --quality delivery --crf 14 --resolution portrait --output out/lokma-harness-promo-portrait.mp4
```

Rendering runs at roughly 1.2–1.35× realtime for 1080p30 on this box (Chrome
screenshot path, software GPU): ~35 s for 750 frames.

The project pins `hyperframes@0.8.143`, since the pin never advances on its own
and an older CLI prints no warning about being behind.
