---
name: short-drama
description: Write a serialized vertical micro-drama (微短剧 / 竖屏短剧) as a structured object — ordered episodes, each with role-tagged beats and a mandatory end-of-episode cliffhanger — then render a readable preview. The drama (.drama.json) is the source of truth and is enforced by the deterministic short-drama gate (episode 1 opens on a hook, EVERY episode ends on a non-empty cliffhanger, 1-based contiguous episode numbers, paywall episode resolves mid-series, per-episode spoken runtime within tolerance, synopsis present). Native ZH; topic must come from real keyword-research — never invent demand.
---

# short-drama

## When to use

The user wants a 微短剧 (vertical short drama) script. One run = one drama (a season of short
episodes). Full content vertical: the drama schema + the short-drama gate + the shared
review/publish gates. Native ZH content — research with SearXNG (`language: zh`).

## Real-data first (same rule as SEO)

A micro-drama competes for 投流/推荐 on 红果/抖音/快手/小程序. Topic/题材 selection **reuses the
SEO entry point**: run `keyword-research` (`language: zh`, SearXNG) for the 题材/setup and only
proceed on a `pursue` `*.research.json`. Put that keyword in the drama's `keyword` field. Never
invent demand or fabricate trend numbers.

## Why a structured drama + a gate

竖屏微短剧 has hard, mechanical structure rules that sink a script no matter the premise (grounded
in `docs/research/2026-06-06-short-drama-structure.md`):

- **黄金前3秒** — 第1集开篇即强冲突 (episode 1's first beat must be a `hook`).
- **每集结尾必有钩子** — the genre's #1 rule: every episode ends on a cliffhanger driving the next
  click. Miss one and you lose the viewer.
- **付费卡点** — the paywall episode sits mid-series (typically ~ep 15–20), not at the end.
- **单集时长** — 竖屏 ~1–2 min; egregiously long/short episodes break the format.
- **序列化** — episodes are 1-based, contiguous, unique.

Those are reproducibly checkable. The drama lives as a structured object
(`{slug}.drama.json`) and `scripts/check-short-drama.mjs` enforces them. Whether the reversals are
*juicy*, the 人设 lands, or the 价值导向 is sound stays with `content-review`.

## Inputs

```yaml
project: string          # projects/{slug}; project.yaml may be any type — dramas live under drama/
keyword: string          # the 题材/topic — needs a pursue *.research.json (zh)
language: zh
```

## Outputs (under projects/{slug}/drama/{lang}/)

- `{slug}.drama.json` — the **drama** (source of truth): `title`, `genre`, `synopsis` (内容概要),
  `paywall_episode`, and `episodes[]` — each `{ number, title?, beats[]{role,summary,lines?},
  cliffhanger }`. Optional `target_seconds_per_episode` / `spoken_cpm` / `tolerance` /
  `min_episodes` / `min_synopsis_chars` overrides.
- `{slug}.md` — the **rendered preview**: synopsis, then per episode the beats + the cliffhanger.
  This is what gets reviewed + (optionally) published.
- `{slug}.review.json` — `content-review` sidecar (`content_type: short-drama`, `language: zh`).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml`; dramas live under `drama/{lang}/`.
2. Ensure a `pursue` `keyword-research` sidecar exists for the 题材 (run it via SearXNG if not).
3. **Write the drama** (`{slug}.drama.json`): a `genre`, a `synopsis` (≥100 chars; aim toward
   备案's 500), and `episodes[]`. For each episode: order the `beats` as a micro three-act
   (`hook`/`setup`/`escalation`/`twist`/`payoff`), put the spoken 对白/旁白 in `lines` (action-only
   beats can omit it), and write a real `cliffhanger`. Episode 1's first beat is a `hook`. Set
   `paywall_episode` to a mid-series episode.
4. **Gate it:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-short-drama.mjs projects/{slug}/drama/{lang}/{slug}.drama.json`.
   Fix until it exits 0 (it reports episode count + avg dialogue seconds). Also
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs {slug}.drama.json` for the schema alone.
5. **Render to `{slug}.md`** — do NOT hand-assemble it; run the deterministic renderer so the preview
   never drifts from the drama JSON:
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/render.mjs projects/{slug}/drama/{lang}/{slug}.drama.json --write` (emits title,
   subtitle, synopsis, then per episode a heading, role-tagged beats, and the `🪝 钩子：` line; marks
   the paywall episode; pulls `decision` from a sibling `*.research.json` if present).
6. **Scrub AI 味 (mandatory):** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-ai-tells.mjs projects/{slug}/drama/{lang}/{slug}.md`.
   It auto-detects 中文 and flags ZH tells that make 旁白/对白 read as 机器写的 — 套话 (总而言之 /
   值得一提的是), AI 腔成语 (息息相关 / 应运而生), 不是X而是Y, and 破折号 滥用. Fix and re-run
   (`--strict` to clear warnings). 短剧台词要像人说的话, not narration prose.
7. **Review:** run `content-review` → `{slug}.review.json` (`content_type: short-drama`,
   `language: zh`). 价值导向/版权 (no imitation of a named work) are review's call.

## Quality gates

- A `pursue` `*.research.json` (zh) exists for the 题材.
- `{slug}.drama.json` passes `check-short-drama.mjs` (and `validate-sidecar`).
- `content-review` marks it `publishable: true`, `copyright_risk: low`.
- Every episode genuinely earns its cliffhanger (a real unresolved beat, not a label).

## Failure handling

- Gate says an episode has no cliffhanger → write a real end-of-episode hook (危机/反转/重大决定),
  don't just fill the field.
- Episode 1 not opening on a hook → reorder so the 强冲突 lands first (黄金前3秒).
- Paywall on the last episode → move it mid-series; there must be episodes left to pay for.
- An episode's dialogue too long/short → it's not 竖屏-paced; tighten or expand the `lines`.
- No real demand (`decision: skip`) → reconsider the 题材; don't shoot on a guess.

## Copyright

Same rule as every vertical: no imitation of a named living author or reuse of a protected
work's characters/world/terminology. 套路 (霸总/逆袭/重生) are genre conventions and fine; a
specific copyrighted IP is not. `copyright-risk-reviewer` checks this during review.
