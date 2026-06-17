---
description: Gate-check and publish a reviewed file to Hexo (write-only). Args: file=path/to/content.md target=hexo.
---

Publish a reviewed content file. Parse arguments from: $ARGUMENTS (expects `file=...`).

Steps:
1. Run the deterministic gate FIRST:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prepublish.mjs <file>
   ```

   If it exits non-zero, STOP, show the reasons, and do not write to the target.
2. On pass, invoke the **publish-content** skill: build front matter from
   `config/publish.json` + the review sidecar, write the post to the Hexo `_posts` target
   (write-only — do not run `hexo g/d`), and append to `publish-log.jsonl`.
3. Report the written path and remind the user to run their Hexo deploy themselves.
