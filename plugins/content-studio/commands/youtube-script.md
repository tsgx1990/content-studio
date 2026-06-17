---
description: Write a YouTube video script (role-segmented, script-gated) + rendered teleprompter doc. Args like project=slug keyword="..." target_seconds=480 language=en.
---

Write a YouTube script. Parse arguments from: $ARGUMENTS

Invoke the **youtube-script** skill:
1. Create/confirm `projects/{project}/project.yaml` with `type: youtube-script`.
2. Ensure a `pursue` `keyword-research` sidecar exists for the topic (run `keyword-research` first if
   not) — never script on invented demand.
3. Write the script FIRST — `projects/{project}/video/{language}/{slug}.script.json` (`target_seconds`,
   `sections[]` with role/title/narration/visual; first section role `hook`; include a `cta`).
4. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-script.mjs <story.script.json>` — fix until it exits 0 (hook first, a
   CTA, runtime within tolerance of target, hook short enough).
5. Render to `{slug}.md` (teleprompter doc: estimated-runtime line, a section per beat, `[VISUAL: …]`).
6. Run **content-review** → `{slug}.review.json` (`content_type: youtube-script`).
7. Stop before publishing unless asked.

Never script without a pursue research sidecar; never skip the script gate.
