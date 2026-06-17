---
description: Draft content (defaults to the SEO-article flow). Args like type=seo keyword="..." project=slug.
---

Generate a content draft. Parse arguments from: $ARGUMENTS

Defaults: `type=seo`.

Steps:
1. **Research first.** If no sibling `{keyword-slug}.research.json` exists, invoke the
   **keyword-research** skill to produce it. If its `decision` is not `pursue`, report the
   reason and stop — do not draft.
2. If `type=seo` (or omitted), invoke the **seo-article** skill (which requires that research)
   with the parsed `keyword`, `search_intent`, `target_audience`, `word_count`, and `project`.
3. If `project` is missing, propose a slug from the keyword and create
   `projects/{slug}/project.yaml` first.
4. Write the draft and tell the user to run `/review-content` next.
5. Do NOT publish here.

Other `type` values (novel, youtube-script, …) are not implemented yet — say so and stop.
