---
description: Write a branching choose-your-path story as a node graph (graph-gated) + rendered Markdown. Args like project=slug premise="..." language=en target_endings=3.
---

Write a branching interactive story. Parse arguments from: $ARGUMENTS

Invoke the **interactive-fiction** skill:
1. Create/confirm `projects/{project}/project.yaml` with `type: interactive-fiction` (propose a
   slug from the premise if `project` is missing).
2. Design the graph FIRST — `projects/{project}/if/{language}/{slug}.if.json` (`start`, `nodes[]`
   with `id`/`text`/optional `ending`/`choices[]`).
3. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-storygraph.mjs <story.if.json>` — fix until it exits 0 (every choice
   resolves, every node reachable, no silent dead-ends, a reachable ending).
4. Render the graph to `{slug}.md` (anchored `## ... {#node-id}` sections, choices as
   `- [label](#target)` links, endings labelled).
5. Run **content-review** → `{slug}.review.json` (`content_type: interactive-fiction`).
6. Stop before publishing unless asked.

Never skip the story-graph gate; never ship a graph with broken branches.
