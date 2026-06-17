---
description: Write a CEFR-graded English-learning story (graded reader, structured + gated) + rendered learner page. Args like project=slug cefr_level=A2 topic="..." language=en.
---

Write a graded reader (English-learning story). Parse arguments from: $ARGUMENTS

Invoke the **english-learning-story** skill:
1. Create/confirm `projects/{project}/project.yaml`; lessons live under `learn/{language}/`.
2. Pick `cefr_level` (A1–C2) and a concrete `learning_objective` (a can-do statement).
3. Write the lesson FIRST — `projects/{project}/learn/{language}/{slug}.lesson.json`: `cefr_level`,
   `title`, `learning_objective`, `story` (controlled text), `target_vocabulary[]{word,gloss}`
   (3–8 new words, each used ≥2×), optional `allowed_extra` / per-level overrides.
4. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-graded-reader.mjs <lesson.json>` — fix until it exits 0 (per-level
   sentence-length cap, word-count band, every target word repeated, beyond-core word budget). It
   prints the worst sentences + the flagged hard words.
5. Render to `{slug}.md` (title, **Objective**, **Story**, then a **Glossary** of the target words).
6. Run **content-review** → `{slug}.review.json` (`content_type: english-learning-story`).
7. Stop before publishing unless asked.

Never skip the CEFR level or the gate; harder words must be glossed target words or `allowed_extra`,
not smuggled in; original stories only (no imitation of a named author or protected work).
