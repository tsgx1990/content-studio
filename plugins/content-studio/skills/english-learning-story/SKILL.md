---
name: english-learning-story
description: Write one CEFR-graded English-learning story (a graded reader) as a structured object — a target CEFR level, a controlled-vocabulary story, and a glossary of target words it actually teaches — then render a learner-facing page. The lesson (.lesson.json) is the source of truth and is enforced by the deterministic graded-reader gate (per-level sentence-length cap, story word-count band, every target word repeated, undeclared-beyond-core word budget). Refuses to skip the CEFR level or the gate — a graded reader without a controlled vocabulary is just a story.
---

# english-learning-story

## When to use

The user wants a graded reader / English-learning story at a target CEFR level (A1–C2). One run =
one lesson story. Full content vertical: the lesson schema + the graded-reader gate + the shared
review/publish gates.

## Why a structured lesson + a graded-reader gate

A graded reader is defined by **controlled difficulty**, which is reproducibly checkable (grounded
in `docs/research/2026-06-06-cefr-graded-reader.md`):

- **Sentence length** is capped per level (A1 ≤8 words/sentence … C2 ≤26).
- **Story length** sits in a per-level band (a single lesson story, not a whole book).
- **Target vocabulary is actually taught** — every new word appears ≥2× (you can't teach a word you
  don't use and repeat).
- **Beyond-core words are declared, not smuggled in** — any word past a shipped high-frequency core
  that isn't a glossed target word, a name, or in `allowed_extra` counts against a per-level budget.

Those live in the `{slug}.lesson.json` and `scripts/check-graded-reader.mjs` enforces them. Whether
the story is *pedagogically* good, age-apt, and culturally fine stays with `content-review`.

> Honest scope: the shipped core (`scripts/lib/english-core-vocab.mjs`) is a **starter** high-frequency
> list, not an authoritative CEFR wordlist; the gate is an approximate floor and reports the words it
> flags. Extend per lesson via `allowed_extra` rather than editing the core.

## Inputs

```yaml
project: string          # projects/{slug}; lessons live under learn/{lang}/
cefr_level: A1|A2|B1|B2|C1|C2
topic: string            # what the story is about
language: en             # the language being taught (this vertical: en)
```

## Outputs (under projects/{slug}/learn/{lang}/)

- `{slug}.lesson.json` — the **lesson** (source of truth): `cefr_level`, `title`,
  `learning_objective`, `story` (the graded text), `target_vocabulary[]{word,gloss,example?}`, and
  optional `allowed_extra` / per-level overrides.
- `{slug}.md` — the **rendered learner page**: title, the can-do objective, the story, then a
  glossary of the target words. This is what gets reviewed + (optionally) published.
- `{slug}.review.json` — `content-review` sidecar (`content_type: english-learning-story`).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml`; lessons live under `learn/{lang}/`.
2. Pick the `cefr_level` and a concrete `learning_objective` (a can-do: "describe the weather and a
   simple event").
3. **Write the lesson** (`{slug}.lesson.json`): keep sentences within the level's cap, hit the
   word-count band, choose 3–8 `target_vocabulary` words and **use each ≥2×**, and write mostly
   from high-frequency words — any harder word should be a glossed target or go in `allowed_extra`.
4. **Gate it:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-graded-reader.mjs projects/{slug}/learn/{lang}/{slug}.lesson.json`.
   Fix until it exits 0 — it reports the worst over-long sentences and the flagged beyond-core words,
   so you know exactly what to simplify or gloss. Also `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs {slug}.lesson.json`.
5. **Render to `{slug}.md`** — do NOT hand-assemble it; run the deterministic renderer so the page
   never drifts from the lesson JSON:
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/render.mjs projects/{slug}/learn/{lang}/{slug}.lesson.json --write` (emits title,
   **Objective**, the **Story**, and a **Glossary** table). Put paragraph breaks in the `story` string
   (blank lines) — the renderer preserves them and the gate ignores them.
6. **Review:** run `content-review` → `{slug}.review.json` (`content_type: english-learning-story`).

## Quality gates

- `{slug}.lesson.json` passes `check-graded-reader.mjs` (and `validate-sidecar`).
- `content-review` marks it `publishable: true`, `copyright_risk: low`.
- The story reads naturally at the level — controlled, not stilted; the target words feel motivated,
  not crammed.

## Failure handling

- Gate flags over-long sentences → split them; don't just delete clauses and lose meaning.
- Gate flags beyond-core words over budget → for each: simplify it, or if it's worth teaching, add
  it to `target_vocabulary` with a gloss and use it ≥2×, or add a justified `allowed_extra` entry.
- A target word appears <2× → weave it back in naturally (repetition is the point), don't pad.
- Story outside the band → it's the wrong length for the level; expand/trim with level-appropriate
  sentences.

## Copyright

Original stories only — no imitation of a named author or reuse of a protected work's
characters/world. Generic learner-story situations (a rainy day, a market, a first job) are fine.
