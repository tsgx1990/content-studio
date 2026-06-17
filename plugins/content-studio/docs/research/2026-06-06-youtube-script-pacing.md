# YouTube-script pacing (for the script gate)

- **Date:** 2026-06-06
- **Topic:** Speaking rate (words→seconds) and hook-length thresholds, to ground
  `scripts/check-script.mjs` (the youtube-script deterministic gate).

## Question

What objectively-checkable numbers turn a script's narration word count into an estimated runtime,
and what structural rules (hook position/length, CTA) reflect real retention best practice — so the
gate enforces grounded values instead of invented ones?

## Method

Web search (US index) of video-script word-count/WPM guidance and YouTube hook/retention best
practice. Synthesized the recurring figures; these are pacing heuristics, recorded as such.

## Key findings

- **Speaking rate:** video narration averages **~130–150 wpm**; most creators land around **150 wpm**
  conversational. Educational content is slower (**120–130 wpm**); entertainment faster (140–150).
  → script length ≈ `words / wpm` minutes.
- **Hook:** the first **5–15 seconds** decide retention; a large share of viewers drop in the first
  10–15s if the hook fails. Recommended hook length **~5–15 seconds**, value proposition clear within
  the first 15s.
- **Structure:** a hook **first**, then the body, then a **call to action (CTA)** — standard
  retention-oriented structure.

## Decisions it drove

`check-script.mjs` defaults (all overridable in the `.script.json` spec):

| Knob | Default | Basis |
|------|---------|-------|
| `words_per_minute` | 150 | ~conversational YouTube average (120–130 if educational — set per script) |
| duration tolerance | ±15% of `target_seconds` | a script is "on length" if its estimated runtime is within tolerance |
| max hook seconds | 15 | hook should land in the first 5–15s |
| structure | first section must be `role: hook`; ≥1 `role: cta` | retention best practice |

Estimated runtime = `total narration words / wpm * 60` seconds (CJK-aware token count, same tokenizer
as the readability gate).

## Limitations / honesty

- WPM is an **estimate**; real runtime depends on delivery, pauses, b-roll, and edits. The gate
  checks the *script is in the right ballpark*, not exact runtime.
- It does not judge whether the hook is *good* — only that one exists, is first, and is short enough.
  Hook quality stays with `content-review`.
- English-derived rates; a non-English script may need a different wpm (set it in the spec).

## Sources (observed)

- Video script word count / WPM — https://lettercounter.org/blog/video-script-word-count/
- YouTube script length by format — https://sumera.io/blog/how-long-should-youtube-script-be
- Words per minute speaking (2026) — https://flowshorts.app/blog/words-per-minute-speaking
- Hook in first 30 seconds — https://1of10.com/blog/how-to-hook-viewers-in-the-first-30-seconds-of-a-youtube-video/
- YouTube hook lengths — https://unityfilms.net/youtube-hook-lengths/
