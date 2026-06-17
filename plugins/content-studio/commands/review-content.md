---
description: Review a content file and write its .review.json sidecar. Args: file=path/to/content.md.
---

Review a content file. Parse arguments from: $ARGUMENTS (expects `file=...`).

Steps:
1. Invoke the **content-review** skill on the given `file`.
2. Delegate to the **seo-editor** and **copyright-risk-reviewer** subagents as appropriate.
3. Write `<basename>.review.json` next to the file, conforming to `schemas/review.schema.json`.
4. Report `publishable`, `copyright_risk`, and any `must_fix` items.
5. If not publishable, recommend revision before `/publish-content`.
