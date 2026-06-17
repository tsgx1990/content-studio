---
name: story-bible
description: Establish the foundation of a long-form project (novel, serial). Writes the narrative bible (bible.md, style-guide.md) plus the STRUCTURED, schema-validated novel/state.json that the continuity gate enforces. Run once at the start, before any chapter.
---

# story-bible

## When to use

At the start of a long-form project (novel, interactive fiction, serial). Run this **once** to
lay the foundation; chapters come later via `chapter-generation`. See `docs/long-form.md`.

## Why structured state (not just prose)

Research on long-form AI fiction is blunt: *a story bible without enforcement is a dictionary
nobody consults.* So the bible has two halves:

- **Narrative** (Markdown, for humans + flavor): `bible.md`, `style-guide.md`.
- **Structured state** (JSON, machine-read + gated): `novel/state.json` per
  `schemas/story-state.schema.json` — this is what `scripts/check-continuity.mjs` enforces.

## Inputs

```yaml
project: string            # projects/{slug}; project.yaml type: novel
premise: string            # one-to-three sentence story idea
genre: string              # optional
length: number             # planned chapters, optional
```

## Outputs

- `projects/{slug}/novel/bible.md` — premise, core conflict, themes, world overview, and a hard
  **do-not list** (continuity invariants + safety/copyright boundaries).
- `projects/{slug}/novel/style-guide.md` — POV, tense, voice, pacing, prose dos/don'ts.
- `projects/{slug}/novel/state.json` — the structured skeleton: `premise`, the main `characters`
  (each with `id`, `status`, `appearance` anchors, `goal`, `fear`, `relationships`), key
  `locations`, `world_rules`, seeded `foreshadowing` (status `open`), and an empty/planned
  `chapters` ledger. For a **long work (multi-arc / aiming at book length)** also declare optional
  `arcs[]` (id, title, start/end chapter, goal) — they bound what's "in play" so per-chapter context
  stays small (`build-chapter-context.mjs`) and the gate can keep the structure honest. Conform to
  the schema.

## Workflow

1. Confirm/create `projects/{slug}/project.yaml` with `type: novel`.
2. Draft `bible.md`: one-sentence premise → core conflict → world rules → main characters
   (goal + fear each) → themes → the **do-not list** (hard setting facts, plus "no imitation of a
   named author / protected world").
3. Draft `style-guide.md`: POV, tense, narrative distance, sentence rhythm, dialogue style.
4. Build `state.json`: give every character a stable `id` and **appearance anchors** (the fixed
   physical details that must stay consistent). Set `world_rules` as hard constraints. Seed the
   `foreshadowing` threads you intend to pay off (status `open`). Leave `chapters` planned/empty.
5. **Validate + gate** — run:
   - `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs projects/{slug}/novel/state.json`
   - `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-continuity.mjs projects/{slug}/novel/state.json`
   Fix until both exit 0. The skeleton must pass before any chapter is written.
6. Tell the user the foundation is ready; next step is `chapter-generation` for chapter 1.

## Quality gates

- Every main character has a goal AND a fear, and fixed appearance anchors.
- World rules are concrete constraints (not vibes) — chapters can violate them, so they must be
  checkable.
- The do-not list captures the hard continuity facts + the originality/safety boundaries.
- `state.json` passes `validate-sidecar` and `check-continuity`.

## Failure handling

- Premise too thin to build characters → ask one clarifying question, then proceed with a stated
  assumption.
- Protected/imitative request (named living author, copyrighted world) → refuse and offer an
  original alternative (same rule as the rest of the repo).
