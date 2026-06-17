---
name: chapter-generation
description: Generate one chapter of a long-form project, grounded in the structured story state. Reads state.json + bible + recent chapter summaries, injects only the RELEVANT facts, drafts the chapter, then triggers continuity + review. Refuses without a passing story state.
---

# chapter-generation

## When to use

To write the next chapter of a novel/serial that already has a `story-bible` foundation. One
invocation = one chapter. See `docs/long-form.md` for the full loop.

## Inputs

```yaml
project: string            # projects/{slug}
chapter_number: number
chapter_goal: string       # what must change this chapter (plot/relationship/info)
importance: normal | important | climax | ending   # optional
# precondition: projects/{slug}/novel/state.json exists and passes check-continuity
```

## Workflow

1. **Require a passing story state (hard precondition).** Run
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-continuity.mjs projects/{slug}/novel/state.json`. If it fails, STOP and fix
   the state first — never write a chapter on a broken foundation.
2. **Load context, relevance-weighted (do NOT dump the whole bible).** Run the deterministic
   selector instead of eyeballing it — first add a **planned** ledger stub for this chapter
   (`number` + `pov` + `cast`), then:
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/build-chapter-context.mjs projects/{slug}/novel/state.json {chapter_number} [--last 3]`.
   It emits ONLY what this scene needs — premise + containing arc + this chapter's cast cards
   (**appearance anchors** + relationship states) + offstage links + `world_rules` in play + live
   `foreshadowing` (planted/open or due to pay off here) + the last N chapter summaries — plus a
   bounding report of what it excluded. This keeps the injected context flat as the book grows (the
   60k-tractability lever). Two scale levers it applies: **arc-scoped world rules** (a rule tagged with
   `arcs:[...]` is injected only inside those arcs; untagged rules stay global) and a
   **long-dormant-thread flag** (an open thread untouched for ≥ `--dormant-after` chapters, default 6,
   is marked ⚠ "pay off or cut" — never dropped). If a thread is flagged dormant, deliberately advance
   it, pay it off, or consciously abandon it (set its status) — don't let it silently rot. Read
   `bible.md` / `style-guide.md` for voice.
3. **Outline the chapter.** A beat sheet that delivers `chapter_goal`. Gate yourself: the chapter
   must produce a real change (information, relationship, or situation) — no filler/recap-only.
4. **Draft** in Markdown to `projects/{slug}/novel/chapters/chapter-{NNN}.md`, honoring the
   style-guide, the appearance anchors, and the world rules. Plant/advance foreshadowing
   deliberately. Stay in the established POV.
5. **Continuity check** — invoke the `continuity-editor` subagent to compare the draft against
   `state.json`; it writes `chapters/chapter-{NNN}.continuity.json`. If it reports a `high`
   conflict, revise the draft (do not proceed).
6. **Review** — run `content-review` on the chapter (quality/pacing/safety), writing
   `chapters/chapter-{NNN}.review.json`.
7. **Update state** — invoke `state-update` to extract this chapter's new/evolved facts back into
   `state.json` (new characters, status changes incl. `died_chapter`, relationship shifts, resolved
   foreshadowing, timeline event, and the chapter ledger entry with `cast`/`pov`/`summary`).
8. **Gate** — run
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-continuity.mjs projects/{slug}/novel/state.json chapters/chapter-{NNN}.continuity.json`.
   It must exit 0 before the chapter is considered done.

## Quality gates

- The chapter delivers `chapter_goal` and changes the situation — not a flat recap.
- Appearance anchors, world rules, and POV match the state/style-guide.
- No `high`-severity continuity conflict; `check-continuity` passes after `state-update`.
- Original prose — no imitation of a named author or protected work.

## Failure handling

- Precondition gate fails → STOP; report the continuity reasons; fix `state.json` first.
- The goal can't be hit without breaking a world rule → surface the tension to the user (the rule
  may need to evolve in the bible) rather than silently violating it.
