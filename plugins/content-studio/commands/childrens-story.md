---
description: Write one age-appropriate children's story with a spec + readability gate. Args like project=slug age_band=6-8 educational_point="..." theme="..." language=en.
---

Write a children's story. Parse arguments from: $ARGUMENTS

Invoke the **children-story** skill:
1. Create/confirm `projects/{project}/project.yaml` with `type: children-story` and
   `content_policy.child_safety: true` (propose a slug if `project` is missing).
2. Write the spec FIRST — `projects/{project}/stories/{language}/{slug}.spec.json` with `age_band`,
   a concrete `educational_point`, a tiny `characters` cast, and `safety.avoid`. Validate it:
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs <spec.json>`.
3. Draft the story `{slug}.md` (single `# Title` + body, no front matter), honoring the age band.
4. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-readability.mjs <story.md>` — fix until it exits 0.
5. Run **content-review** to write `{slug}.review.json` (`content_type: children-story`).
6. Stop before publishing unless asked. If publishing, note the demo blog is an English
   "AI Writing Blog" — a children's story wants its own target in `config/publish.json`.

Never skip the spec or the readability gate.
