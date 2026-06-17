---
description: Start a long-form project — build the bible + structured story state. Args like project=slug premise="..." genre="..." length=N.
---

Start a novel/serial. Parse arguments from: $ARGUMENTS

Invoke the **story-bible** skill:
1. Create/confirm `projects/{project}/project.yaml` with `type: novel` (propose a slug from the
   premise if `project` is missing).
2. Write `novel/bible.md`, `novel/style-guide.md`, and the structured `novel/state.json`
   (characters with appearance anchors + goal/fear, world rules, seeded foreshadowing, planned
   chapter ledger).
3. Validate + gate the skeleton:
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs projects/{project}/novel/state.json` and
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-continuity.mjs projects/{project}/novel/state.json` — both must exit 0.
4. Tell the user to run `/write-chapter project={project} number=1 goal="..."` next.

Do NOT draft chapters here.
