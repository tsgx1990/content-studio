---
name: publish-content
description: Gate-check a reviewed content file, generate Hexo front matter from config/publish.json, and write the post to the target. Refuses to publish if the gate fails.
---

# publish-content

## When to use

A content file has a passing `*.review.json` sidecar and the user wants it published to
the Hexo blog. This is the only path to a publish target.

## Inputs

```yaml
file: string             # path to the reviewed content .md
target: string           # optional; defaults to config.defaultTarget (hexo)
```

## Workflow

1. **Run the gate (mandatory):**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prepublish.mjs <file>
   ```

   If it exits non-zero, STOP. Report the printed reasons and do not write anything to the
   target. Do not attempt to "fix" by editing the review sidecar to pass — fix the content.

2. Read `config/publish.json` for the target (`postsDir`, `subdirByContentType`,
   `frontMatter`). If `postsDir` still contains `EDIT_ME`, stop and ask the user to set it.

3. Build the Hexo front matter from `review.metadata` and the configured `fields`:

   ```yaml
   ---
   title: <metadata.title>
   date: <now, formatted per frontMatter.dateFormat>
   tags: [<metadata.tags...>]
   categories: [<metadata.categories... or content type>]
   description: <metadata.description>
   ---
   ```

4. Strip the draft's `<!-- meta -->` block from the body. Prepend the front matter.

5. Determine output path:
   - base = `postsDir` (resolved relative to repo root if not absolute);
   - if `subdirByContentType`, append `/<content_type-or-seo>/`;
   - filename = `{keyword-slug}.md`.

6. **Write only** (v1 `writeOnly: true`): write the `.md` to the target. Do NOT run
   `hexo g`/`hexo d` or any deploy command — tell the user to run those themselves.

7. Append a line to `projects/{slug}/publish-log.jsonl`:

   ```json
   {"content_id":"how-to-x","target":"hexo","path":"<written path>","published_at":"<iso>"}
   ```

## Quality gates

- Never publish without a passing `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prepublish.mjs` exit 0.
- Never invent missing metadata at publish time — it must come from the review sidecar.
- Never deploy (write-only) in v1 unless `writeOnly` is set to false and the user confirms.
- Never write secrets into the published file (the gate also scans for this).

## Failure handling

- Gate failed → surface reasons, point the user back to `content-review`/revision.
- `postsDir` unset → ask for the real Hexo path; do not guess and write to a random dir.
