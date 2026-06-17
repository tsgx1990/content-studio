---
name: state-update
description: After a chapter is drafted, extract its new and evolved facts back into the structured story state (novel/state.json). The automated fact-extraction step that keeps the bible enforceable. Must leave state.json passing the continuity gate.
---

# state-update

## When to use

Right after a chapter draft (and its continuity check) inside the `chapter-generation` loop. This
is the **fact-extraction** step the research calls essential: scan the new chapter, turn its
story-critical assertions into structured updates, and write them back so the next chapter is
generated against current truth.

## Inputs

```yaml
project: string            # projects/{slug}
chapter_number: number
# reads: chapters/chapter-{NNN}.md, novel/state.json, the chapter's continuity report
```

## Workflow

1. Read the chapter draft and the current `novel/state.json`.
2. **Extract atomic, typed facts** introduced or changed this chapter:
   - new characters (give a stable `id`, appearance anchors, goal/fear if known) and
     `first_appeared_chapter`;
   - status changes — if a character died, set `status: dead` and `died_chapter` (this is what the
     no-resurrection gate checks); relationship-state shifts;
   - new `locations` / `world_rules` revealed;
   - `timeline` event for this chapter (keep chapter numbers non-decreasing);
   - foreshadowing: add newly planted threads (`open`); mark paid-off ones `resolved` with
     `resolved_chapter` = this chapter;
   - the `chapters` ledger entry: `number`, `title`, one-line `summary` (used as future context),
     `pov`, and `cast` (character ids who appear).
3. **Preserve history** — update evolved facts in place but do not erase prior truth (e.g. a
   relationship's new `state`); do not overwrite settings that did not change.
4. Bump `updated_at`.
5. **Gate** — run
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-continuity.mjs projects/{slug}/novel/state.json`. If it fails (e.g. you cast
   a dead character, or resolved a thread before its setup), fix the extraction until it exits 0.

## Quality gates

- Every status change traceable to the chapter (don't invent facts the prose didn't establish).
- `cast` lists exactly the characters who appear; `pov` is set.
- Resolved foreshadowing has `resolved_chapter >= setup_chapter`; dead characters carry
  `died_chapter`.
- `state.json` still conforms to the schema and passes `check-continuity`.

## Failure handling

- The chapter contradicts the established state (e.g. a dead character acts) → do NOT "fix" it by
  rewriting state to match; flag it as a continuity problem for the chapter to be revised. State
  follows the canon, not the mistake.
