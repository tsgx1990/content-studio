---
description: Write a short prose card / micro-story (structured + length-gated) + rendered card. Args like project=slug language=zh keyword="...".
---

Write a prose card (micro-story / short narrative). Parse arguments from: $ARGUMENTS

Invoke the **prose-card** skill:
1. Create/confirm `projects/{project}/project.yaml`; cards live under `prose/{language}/`.
2. (Optional) If the card chases search/recommendation demand, ensure a `pursue` `keyword-research`
   sidecar exists — don't invent demand. A pure micro-story needs no research.
3. Write the card FIRST — `projects/{project}/prose/{language}/{slug}.prose.json` (`prose_id`,
   `title`, `body`; optional `summary`/`tags`/`length`; add a `compliance` block for branded prose).
4. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prose.mjs <…>.prose.json` — fix until it exits 0 (CJK-aware length
   band; opt-in 极限词/承诺词 scan).
5. Render: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/render.mjs <…>.prose.json --write`; then scrub AI 味 with
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-ai-tells.mjs <…>.md`.
6. Run **content-review** → `{slug}.review.json` (`content_type: prose-card`).
7. Stop before publishing unless asked.

Use this (not audio-story) for plain text; never hand-assemble the .md; soften any flagged 极限词.
