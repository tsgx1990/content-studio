---
description: Write a Xiaohongshu (小红书) note (structured + note-gated) + rendered preview. Args like project=slug keyword="..." language=zh.
---

Write a 小红书 note. Parse arguments from: $ARGUMENTS

Invoke the **xhs-post** skill:
1. Create/confirm `projects/{project}/project.yaml`; notes live under `xhs/{language}/`.
2. Ensure a `pursue` `keyword-research` sidecar exists for the topic (run `keyword-research`
   `language: zh` via SearXNG first if not) — never post on invented demand.
3. Write the note FIRST — `projects/{project}/xhs/{language}/{slug}.note.json` (`title` ≤20 chars,
   `body` 100–1000 chars, `tags[]` without #, optional `limits`/`banned_terms`).
4. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-xhsnote.mjs <note.note.json>` — fix until it exits 0 (title/body
   length, tag count, no 极限词).
5. Render to `{slug}.md` (title `#`, body, then `#tag #tag`).
6. Run **content-review** → `{slug}.review.json` (`content_type: xhs-post`, `language: zh`).
7. Stop before publishing unless asked.

Never post without a pursue research sidecar; never skip the note gate; no 极限词.
