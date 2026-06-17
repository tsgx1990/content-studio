---
description: Write a vertical micro-drama (微短剧, structured + drama-gated) + rendered preview. Args like project=slug keyword="..." language=zh.
---

Write a 微短剧 (vertical short drama). Parse arguments from: $ARGUMENTS

Invoke the **short-drama** skill:
1. Create/confirm `projects/{project}/project.yaml`; dramas live under `drama/{language}/`.
2. Ensure a `pursue` `keyword-research` sidecar exists for the 题材 (run `keyword-research`
   `language: zh` via SearXNG first if not) — never shoot on invented demand.
3. Write the drama FIRST — `projects/{project}/drama/{language}/{slug}.drama.json`: `title`,
   `genre`, `synopsis` (内容概要), `paywall_episode`, and `episodes[]` — each with role-tagged
   `beats[]{role,summary,lines?}` and a non-empty `cliffhanger`. Episode 1's first beat = `hook`.
4. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-short-drama.mjs <drama.json>` — fix until it exits 0 (episode 1
   opens on a hook, every episode has a cliffhanger, 1-based contiguous numbers, paywall mid-series,
   per-episode runtime in band, synopsis present).
5. Render to `{slug}.md` (title, synopsis, then per episode the beats + a bolded `钩子：` line).
6. Run **content-review** → `{slug}.review.json` (`content_type: short-drama`, `language: zh`).
7. Stop before publishing unless asked.

Never shoot without a pursue research sidecar; never skip the drama gate; no imitation of a
named/copyrighted IP (套路 like 霸总/逆袭/重生 are fine, a specific protected work is not).
