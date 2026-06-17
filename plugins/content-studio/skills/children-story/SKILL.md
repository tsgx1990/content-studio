---
name: children-story
description: Write one age-appropriate children's story grounded in a structured spec (age band, educational takeaway, safety boundaries). Writes the story .md plus its .spec.json sidecar, then runs the deterministic readability gate. Refuses to skip the spec — a children's story without an age band and a takeaway is just noise.
---

# children-story

## When to use

The user wants a short, original children's story for a specific age band (3-5 / 6-8 / 9-12) with a
clear takeaway. One run = one story. This is a full content vertical (skill + schema + readability
gate + the shared review/publish gates) — the same file model as SEO and long-form.

## Why a spec + a readability gate

A children's story has two hard, *checkable* obligations on top of "is it good?": it must be
**age-appropriate in length/complexity** and **safe**. So before drafting we write a structured
`.spec.json` (conforming to `schemas/children-story.schema.json`), and after drafting we run
`scripts/check-readability.mjs` — the deterministic gate that enforces word count, average and
maximum sentence length for the age band, and that no `safety.avoid` term appears. Semantic quality
(warmth, clarity, whether the takeaway actually lands) stays with `content-review`. Same split as
the rest of the repo: **script enforces the reproducible floor, the LLM judges the rest.**

## Inputs

```yaml
project: string          # projects/{slug}; project.yaml type: children-story
age_band: "3-5"|"6-8"|"9-12"
educational_point: string  # the ONE takeaway (courage, sharing, honesty, curiosity…)
theme: string            # optional one-liner
language: string         # default "en"
```

## Outputs (next to each other under projects/{slug}/stories/{lang}/)

- `{slug}.spec.json` — the structured spec (age band, educational_point, characters, safety.avoid).
- `{slug}.md` — the story prose (a single `# Title` heading + body; NO front matter — that is
  generated at publish from the review metadata).
- `{slug}.review.json` — the `content-review` sidecar (reused; publish gate reads it).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml` with `type: children-story`,
   `content_policy.child_safety: true`.
2. **Write the spec first** (`{slug}.spec.json`): set `age_band`, a concrete `educational_point`,
   `characters` (keep the cast tiny), and `safety.avoid` — seed it with content inappropriate for the
   band (e.g. graphic violence, weapons, frightening death, romance). Validate:
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs projects/{slug}/stories/{lang}/{slug}.spec.json`.
3. **Draft** the story grounded in the spec. Honor the band: short sentences and simple words for
   3-5/6-8; you can vary rhythm more for 9-12. One clear problem → emotional beat → the takeaway
   shown through action, not preached. Original characters/world only (no protected IP).
4. **Readability gate:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-readability.mjs projects/{slug}/stories/{lang}/{slug}.md`.
   Fix until it exits 0 (it reports words / avg / longest sentence). If the story genuinely needs
   different bounds, override them in the spec's `readability` block — don't fight a sensible default.
5. **Review:** run `content-review` to write `{slug}.review.json` (set `content_type: children-story`,
   `metadata` with title/description/tags, `monetization: none`). The `copyright-risk-reviewer`
   should confirm no imitation. **Mandatory for children's content:** the
   `child-content-safety-editor` subagent must return `verdict: "safe"` (age-appropriateness,
   scariness, values, language difficulty) — an `unsafe`/`revise` verdict blocks publishing and its
   `must_fix` items go into the review's `must_fix`. This is the human-judgment layer above the
   deterministic readability gate.
6. **Publish (optional):** only via `publish-content`, which runs `check-prepublish.mjs`. NOTE: the
   demo blog is an English "AI Writing Blog" — a real children's story should target its own
   site/section; add a target (or change `postsDir`) in `config/publish.json` rather than mixing
   verticals onto an off-topic blog.

## Quality gates

- `.spec.json` passes `validate-sidecar`; `age_band` and `educational_point` are set.
- The story passes `check-readability.mjs` for its band.
- The `child-content-safety-editor` returns `verdict: "safe"` (mandatory for children's content).
- `content-review` marks it `publishable: true`, `copyright_risk: low`.
- The takeaway is *shown* (a choice the character makes), not stated as a moral tag-line.

## Failure handling

- Request imitates a known character/world (e.g. a named franchise) → refuse; offer an original
  character with a similar feeling.
- Spec asks for content that can't be made safe for the band → narrow the age band or the premise,
  and say why.
- Story keeps failing the sentence cap → split sentences (the gate is telling you the prose is too
  dense for the age), don't just widen the override to dodge it.
