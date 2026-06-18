---
name: audio-story
description: Write an audio story (narrated fiction / audio drama / TTS-voiced short) as a structured cue list — a declared cast of voices + declared sounds + ordered narration/dialogue/sfx/music cues — then render a producer-facing script. The cue list (.audio.json) is the source of truth and is enforced by the deterministic audio-story gate (every spoken cue resolves to a declared voice, every sfx/music to a declared sound, an orienting opening, runtime within tolerance, and a TTS-pronounceability scan — every hostile token must carry a say_as override). Refuses to skip the gate.
---

# audio-story

## When to use

The user wants something **heard, not read** — a narrated short story, an audio drama / radio play,
a podcast-style fiction segment, or a script meant to be voiced by a **TTS engine**. One piece =
one cue list. If the deliverable is a YouTube video script (on-screen visuals, a hook→CTA retention
arc), use `youtube-script` instead; use **this** when the channel is pure audio.

## Why a cue list + a TTS-safety gate

Every other vertical assumes the audience can *see* the text. Audio can't: it is consumed by ear and
often voiced by TTS, so its reproducible failures are different and belong to a gate, not to taste
(grounded in `docs/research/2026-06-06-audio-story-tts-safety.md`). The piece lives as
`{slug}.audio.json` and `scripts/check-audio-story.mjs` enforces:

- **speaker resolution** — every narration/dialogue cue names a *declared* voice and has words; no
  one speaks "off-cast" and the listener can always be told who is talking;
- **asset resolution** — every sfx/music cue names a *declared* sound; no declared voice/sound is
  left dangling;
- **an orienting opening** — the first cue may not be cold `dialogue` (open on narration or a sound:
  ear-only, no one knows who is speaking yet);
- **runtime** within tolerance of `target_seconds` — CJK-aware: Latin words at `words_per_minute`
  (default 155), CJK characters at `chars_per_minute` (default 240, since a Chinese narrator speaks
  ~240 字/分, not 155 "words"/分) + sfx/music seconds. A pure-English piece is unchanged; a 中文 念白 is
  no longer mis-estimated (~250 字 ≈ 60s, not ~98s). Override either rate per file when needed;
- **TTS-safety** — every TTS-hostile token in spoken text (digit runs, currency, `% & # @ ^ ~ _ = + * /`,
  URLs, emails, ALL-CAPS acronyms) must be covered by a `say_as` override declaring how to voice it.

The `say_as` values are the real SSML `interpret-as` set (`characters`, `cardinal`, `ordinal`,
`date`, `time`, `telephone`, `currency`, `digits`, …) so the artifact stays portable to any
SSML-capable engine. Prose, performance, and sound-design taste stay with `content-review`.

## Inputs

```yaml
project: string          # projects/{slug}; project.yaml type: audio-story
premise: string          # the story + who voices it (narrator? a cast?)
target_seconds: integer  # intended runtime (e.g. 120)
language: string         # default "en"
```

## Outputs (under projects/{slug}/audio/{lang}/)

- `{slug}.audio.json` — the **cue list** (source of truth): `audio_id`, `target_seconds`,
  `voices[]` (`{id, name?, kind?}`), optional `sounds[]` (`{id, description?}`), and `cues[]` where
  each cue is `narration`/`dialogue` (`voice` + `text`, optional `say_as[]`/`direction`) or
  `sfx`/`music` (`sound`, optional `seconds`).
- `{slug}.md` — the **rendered** producer script: a Cast list, then cues in order — narration as
  prose, dialogue as **Name:** lines, sfx/music as `> [SFX: …]` / `> [MUSIC: …]`, with any `say_as`
  pronunciations noted. This is what gets reviewed + published.
- `{slug}.review.json` — `content-review` sidecar (`content_type: audio-story`).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml` with `type: audio-story`.
2. **Write the cue list first** (`{slug}.audio.json`): declare every voice and sound up front; lay
   out cues in order; open on narration or an establishing sound; for any number/acronym/symbol in
   spoken text, add a `say_as` entry so TTS voices it correctly (or rewrite it as words).
3. **Gate it:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-audio-story.mjs projects/{slug}/audio/{lang}/{slug}.audio.json`.
   Fix until it exits 0 — it pinpoints an off-cast voice, a dangling sound, a cold-open, runtime
   drift, or any un-marked TTS-hostile token. Also `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs {slug}.audio.json`.
4. **Render to `{slug}.md`** from the cue list, faithfully — don't change wording the gate measured.
5. **Review:** run `content-review` → `{slug}.review.json` (`content_type: audio-story`, metadata
   title/description/tags, `monetization` as appropriate).
6. **Publish (optional):** via `publish-content` (`check-prepublish.mjs`).

## Quality gates

- `{slug}.audio.json` passes `check-audio-story.mjs` (and `validate-sidecar`).
- The rendered `.md`'s speaker labels and cues match the cue list.
- `content-review` marks it `publishable: true`, `copyright_risk: low`.
- Numbers/acronyms in spoken text are either written as words or carry a `say_as` — nothing is left
  for the TTS engine to guess.

## Failure handling

- Gate reports a **TTS-hostile token** → add a `say_as { text, as }` (e.g. `"0300"` → `as: "time"`),
  or rewrite the token as plain words ("three in the morning").
- Gate reports **opens on dialogue** → add a short narration or an establishing sfx/music cue first.
- Gate reports a **dangling voice/sound** → cue it or remove the declaration.
- Topic is demand-driven (a podcast you want discovered) → reuse `keyword-research` first; never
  invent demand. Imitative request (a named show/franchise) → refuse; offer an original premise.
