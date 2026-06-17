# Audio story — TTS-safety + ear-only structure (gate design)

- **Date:** 2026-06-06
- **Topic:** What makes an *audio* story (narrated fiction / audio drama / TTS-voiced short) reliably
  *correct*, in a way a deterministic gate can enforce — distinct from the existing text/video gates.
- **Method:** SearXNG (free, `language=en`) over two questions: (1) TTS / SSML pronunciation best
  practices (how engines mis-speak formatted text, and the standard fix), (2) audio-drama / radio /
  podcast scripting conventions (speaker labels, sound/music cues, openings). Sources observed below.

## The question

The other eight verticals all assume the reader can *see* the text. Audio cannot: the listener
consumes it linearly, **by ear**, and increasingly the voice is a **TTS engine** rather than a human
narrator. So the reproducible, checkable failure modes are different from "is the prose good":

1. **Un-pronounceable tokens.** Numbers, acronyms, currency, symbols (`&`, `%`, `#`, `@`), URLs and
   emails are routinely mis-spoken by TTS unless the author declares how to say them. This is the
   single most consistent finding across every vendor.
2. **Un-attributable speech.** With no visual cue, a line of dialogue with no established speaker, or
   audio that opens cold on dialogue with no scene-setting, leaves the listener disoriented.
3. **Unscored sound.** Audio drama conveys place/action through sound; an SFX/music cue that points
   at nothing is a production hole.
4. **Runtime drift** — same pacing discipline as the YouTube-script gate.

## Key findings

- **SSML `<say-as interpret-as="…">` is the cross-vendor standard fix** for formatted text. Google
  Cloud TTS, Microsoft Azure, Amazon Polly and the W3C SSML 1.1 spec all document the *same*
  mechanism and the *same* `interpret-as` values: `characters`/`spell-out`, `cardinal`, `ordinal`,
  `date`, `time`, `telephone`, `currency`, `digits`, `verbatim`, `fraction`, `unit`. The consistent
  message: **without `say-as`, numbers/dates/acronyms/URLs are mis-read** ("misreadings without
  `<say-as>`"). Microsoft's docs explicitly note `net:uri` mis-handles the `http://` punctuation, and
  acronyms are "often not handled" and "can be confusing" without an explicit spoken form.
- **Audio drama is purely auditory** — it "relies only on dialogue, sound effects, and music to
  convey the story" — so scripts use **clear speaker labels, sound-effect notation, and music cues**
  as first-class elements (SFWA, Faber Academy, BBC Writers' Room, DCMP Captioning Key). Sound is
  captioned/noted "if necessary for understanding" — i.e. every cue must resolve to a real sound.
- **Openings must orient the listener.** Guidance on writing for the ear stresses establishing place
  and who is speaking up front; you cannot open ear-only audio cold on an unattributed line.

## Decisions this drove (the audio-story gate)

The structured source of truth is `{slug}.audio.json` (declared `voices[]` + declared `sounds[]` +
an ordered `cues[]` of `narration` / `dialogue` / `sfx` / `music`). `scripts/check-audio-story.mjs`
enforces, mechanically:

1. schema conformance (`schemas/audio-story.schema.json`);
2. unique voice ids / sound ids; ≥1 voice and ≥1 spoken (narration/dialogue) cue;
3. **speaker resolution** — every narration/dialogue cue's `voice` is a declared voice; spoken cues
   carry non-empty `text`;
4. **asset resolution** — every sfx/music cue's `sound` is a declared sound; no declared voice or
   sound is left unused (no dangling cast/asset);
5. **ear-only opening** — the first cue may not be `dialogue` (it must orient: narration, or an
   establishing sfx/music);
6. **runtime within tolerance** of `target_seconds` (spoken words / wpm, plus any sfx/music
   `seconds`), default wpm 155 / tolerance 0.15 — same discipline as the script gate;
7. **TTS-safety / pronounceability scan** (the distinguishing teeth): each spoken `text` is scanned
   for TTS-hostile tokens — digit runs ≥ 4, currency amounts, `%`/`&`/`#`/`@`/`^`/`~`/`_`, URLs,
   emails, and ALL-CAPS acronyms (≥2 letters) — and each such token must be covered by a `say_as`
   entry on that cue declaring its spoken form (`text` + an SSML `interpret-as`). This is what no
   other gate does: a reproducible *pronounceability lint* for ear-only delivery.

State/representation choices: pronunciation overrides are modelled as a `say_as: [{text, as}]` array
(the validator has no conditional schema, so requiredness-by-cue-type lives in the gate script). The
`as` values are restricted to the real SSML `interpret-as` set so the artifact stays portable to any
SSML-capable engine. Prose/voice-acting quality stays with `content-review`.

## Limitations

- The gate proves *pronounceability hygiene*, not perfect pronunciation — a correctly-marked token
  can still be voiced oddly by a given engine; `<phoneme>`-level tuning is out of scope.
- It does not synthesize audio or measure real durations; runtime is a word-count estimate like the
  script gate.
- Homographs ("read", "lead", "bass") are not flagged — detecting them reliably needs a lexicon; the
  `say_as`/alias mechanism is available to authors who hit one.

## Sources (observed via SearXNG, 2026-06-06)

- Google Cloud Text-to-Speech — SSML: https://docs.cloud.google.com/text-to-speech/docs/ssml
- Microsoft Azure — SSML pronunciation: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation
- Amazon Polly — say-as tag: https://docs.aws.amazon.com/polly/latest/dg/say-as-tag.html
- W3C — SSML 1.1 (`say-as`): https://www.w3.org/TR/speech-synthesis11/
- ElevenLabs — TTS best practices (phone numbers / emails mis-pronounced): https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
- SFWA — Tips and Tricks for Writing Audio Drama: https://sfwa.org/2022/09/29/tips-tricks-writing-audio-drama/
- Faber Academy — How to Write Audio Drama: https://faberacademy.com/reading-room/features/reading-room-how-to-write-audio-drama/
- DCMP Captioning Key — Sound Effects and Music: https://dcmp.org/learn/602-captioning-key---sound-effects-and-music
- BBC Writers' Room — Radio Drama scripts: https://www.bbc.co.uk/writers/scripts/radio-drama
