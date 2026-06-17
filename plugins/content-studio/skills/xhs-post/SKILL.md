---
name: xhs-post
description: Write a Xiaohongshu (小红书) image-text note as a structured object (title + body + topic tags), then render a readable preview. The note (.note.json) is the source of truth and is enforced by the deterministic note gate (title ≤20 chars, body 100–1000 chars, tag count, and a 极限词/absolute-claim blocklist that triggers 限流). Topic must come from real keyword-research — never invent demand.
---

# xhs-post

## When to use

The user wants a 小红书 (Xiaohongshu / RED) note on a topic. One run = one note. Full content
vertical: the note schema + the note gate + the shared review/publish gates. Native ZH content —
research with SearXNG (`language: zh`).

## Real-data first (same rule as SEO)

A note competes in XHS search/推荐. Topic selection **reuses the SEO entry point**: run
`keyword-research` (`language: zh`, SearXNG) and only proceed on a `pursue` `*.research.json`. Put
that keyword in the note's `keyword` field. Never invent demand or fabricate stats/数据.

## Why a structured note + a note gate

XHS has hard, mechanical rules that sink a note no matter how good it reads: a title past **20
chars** is truncated; body must be **100–1000 chars**; **堆砌话题** (too many tags) and **极限词**
(绝对化用语 like 最/第一/100% — 《广告法》violations) trigger **限流**. Those are reproducibly
checkable. The note lives as a structured object (`{slug}.note.json`) and
`scripts/check-xhsnote.mjs` enforces title/body length, tag count, and the banned-term scan. Rules
are grounded in `docs/research/2026-06-06-xiaohongshu-note-rules.md`. Whether the hook/封面/选题 is
*good* stays with `content-review`.

## Inputs

```yaml
project: string          # projects/{slug}; project.yaml may be any type — notes live under xhs/
keyword: string          # the topic — needs a pursue *.research.json (zh)
language: zh
```

## Outputs (under projects/{slug}/xhs/{lang}/)

- `{slug}.note.json` — the **note** (source of truth): `title`, `body` (emoji + line breaks ok),
  `tags[]` (without the leading #), optional `cover_hint` / `images_hint`, optional `limits` /
  `banned_terms` overrides.
- `{slug}.md` — the **rendered preview**: title, body, and the tags as `#话题`. This is what gets
  reviewed + (optionally) published.
- `{slug}.review.json` — `content-review` sidecar (`content_type: xhs-post`, `language: zh`).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml`; notes live under `xhs/{lang}/`.
2. Ensure a `pursue` `keyword-research` sidecar exists for the topic (run it via SearXNG if not).
3. **Write the note** (`{slug}.note.json`): a tight **title ≤ 20 chars** (人群+关键词+数字+表情,
   front-load the keyword — first ~10 chars carry the search weight), a **100–1000 char** body in
   real 小红书 voice (short lines, emoji, a genuine experience/观点, a soft CTA), and a few precise
   `tags` (default ≤10). Keep claims honest — **no 极限词** (最/第一/100%/国家级…).
4. **Gate it:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-xhsnote.mjs projects/{slug}/xhs/{lang}/{slug}.note.json`. Fix
   until it exits 0 (it reports title/body chars + tag count). Also
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs {slug}.note.json` for the schema alone.
5. **Render to `{slug}.md`** — do NOT hand-assemble it; run the deterministic renderer so the
   preview never drifts from the note JSON:
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/render.mjs projects/{slug}/xhs/{lang}/{slug}.note.json --write` (emits `# title`,
   the body, then the `#tag #tag` line).
6. **Scrub AI 味 (mandatory):** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-ai-tells.mjs projects/{slug}/xhs/{lang}/{slug}.md`.
   It auto-detects 中文 and flags the ZH tells that get a note read as 机器写的 — 套话
   (在当今数字化时代 / 总而言之 / 值得一提的是), AI 腔成语 (息息相关 / 应运而生), 不是X而是Y, 破折号
   滥用, and 中/英引号混用 (中文正文应用「“ ”」, 不是 ASCII `"`). Fix offenders and re-run (`--strict`
   to clear warnings too). 小红书 voice should read like a real person, so this matters more here than anywhere.
7. **Review:** run `content-review` → `{slug}.review.json` (`content_type: xhs-post`, `language: zh`,
   metadata title/description/tags). 带货笔记 → set `monetization` honestly and disclose 合作/广告.

## Quality gates

- A `pursue` `*.research.json` (zh) exists for the topic.
- `{slug}.note.json` passes `check-xhsnote.mjs` (and `validate-sidecar`).
- `content-review` marks it `publishable: true`, `copyright_risk: low`.
- The note reads like a real person's note (体验 + 观点), not keyword-stuffed SEO.

## Failure handling

- Gate says title too long → cut to ≤20 chars, keep the keyword in the first ~10.
- Gate flags a 极限词 → soften the claim (it's a real 限流 risk, not pedantry); don't just delete the
  whole sentence — rewrite the promise honestly.
- Body too short → add a real detail/体验, not filler (XHS 原创 floor is ~100 chars, 完读率 best at
  600–800).
- No real demand (`decision: skip`) → reconsider the topic; don't post on a guess.
