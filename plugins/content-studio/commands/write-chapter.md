---
description: Write the next chapter of a long-form project, grounded in story state. Args like project=slug number=N goal="..." importance=normal|important|climax|ending.
---

Write one chapter. Parse arguments from: $ARGUMENTS

Invoke the **chapter-generation** skill:
1. **Precondition gate:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-continuity.mjs projects/{project}/novel/state.json`
   must exit 0. If not, stop and fix the state first.
2. Load relevant facts only (this chapter's cast + anchors, world rules in play, open
   foreshadowing, last 2–3 chapter summaries) and draft
   `projects/{project}/novel/chapters/chapter-{NNN}.md` toward `goal`.
3. Run the **continuity-editor** subagent → `chapter-{NNN}.continuity.json`; revise if it reports a
   `high` conflict.
4. Run **content-review** → `chapter-{NNN}.review.json`.
5. Run **state-update** to extract new/evolved facts into `state.json`.
6. **Final gate:**
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-continuity.mjs projects/{project}/novel/state.json projects/{project}/novel/chapters/chapter-{NNN}.continuity.json`
   must exit 0.

Report the chapter + any continuity notes. Publishing is separate (`/publish-content`).
