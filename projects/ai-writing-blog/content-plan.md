# Content Plan — AI Writing Blog

> SEO article series plan. Niche: **AI writing / novel-creation tools**. Markets: **EN (Google) + ZH (Baidu/Bing)**.
> Monetization: **ads + affiliate**. Model: topic clusters — informational posts earn ad
> traffic and funnel (via internal links) to commercial posts that earn affiliate revenue.
>
> ⚠️ **Keywords below are unvalidated estimates** (no real search data yet). Treat them as
> candidate topics. Each must pass `keyword-research` (real SERP data → `decision: pursue`)
> before it gets drafted.

## Positioning

Teach novel/story writers how to write their book with AI, and recommend the AI writing
tools that help them. EN audience = global authors on Google; ZH audience = 国内网文/写作爱好者.

## Structure: 2 pillars + 2 clusters

- **Pillar 1 (informational hub, ads):** How to Write a Novel with AI / 如何用 AI 写小说
  — ✅ EN done: research(`pursue`, high-difficulty but keystone)→draft→review(SEO 9/10, copyright low)→**published to Hexo**. Tool-agnostic 7-stage workflow + copy-paste prompts + a copyright/legal section the competitors skip. Links DOWN to A2/A3 and ACROSS to B2/B4; A2+A3 now link UP to it (hub-and-spoke closed for cluster A).
- **Pillar 2 (commercial hub, affiliate):** Best AI Writing Tools for Novelists / 最佳 AI 小说写作工具
- Cluster A (informational) links up to Pillar 1 and funnels to Pillar 2 / B.
- Cluster B (commercial) links up to Pillar 2.

## Cluster A — informational (traffic + ads, funnel to B)

| # | Keyword EN / ZH | Intent | Money | Priority | Status |
|---|---|---|---|---|---|
| A1 | how to outline a novel / 如何写小说大纲 | informational | ads | — | ✅ done (demo) |
| A2 | ~~how to create characters with AI~~ → **how to develop fictional characters with AI** / 如何用 AI 设计人物 | informational | ads→B | high | ✅ research(re-targeted: head term is image-gen-dominated)→draft→review→**published to local Hexo**; funnels to B2+B4 via post_link |
| A3 | overcome writer's block with AI / 用 AI 克服写作卡壳 | informational | ads→B | high | ✅ research→draft→review→**published to local Hexo + deployed**; types the block into 4 kinds; funnels to B4, cross-links A2 |
| A4 | AI story prompts (50+ ideas) / AI 写作灵感提示词 | informational | ads→B | med | ✅ research(`pursue`)→draft→review(SEO 9/10, copyright low)→**published to Hexo**; 52 reusable copy-paste prompt templates grouped by Pillar-1 stage; funnels up to Pillar 1, across to A2/A3, to B4 |
| A5 | edit & revise a novel with AI / 用 AI 修改润色小说 | informational | ads→B | med | todo |
| A6 | worldbuilding with AI / 用 AI 构建世界观 | informational | ads→B | med | todo |

## Cluster B — commercial (affiliate, link up to Pillar 2)

| # | Keyword EN / ZH | Intent | Money | Priority | Status |
|---|---|---|---|---|---|
| B1 | best AI writing tools for fiction 2026 / 2026 最佳 AI 小说写作工具 | commercial | affiliate | ~~high~~ | ⏸ **defer** — real SERP too hard (authority + tested listicles); revisit after cluster has authority. See `seo/en/best-ai-writing-tools-for-fiction.research.json` |
| B2 | **Sudowrite vs NovelCrafter** / 主流 AI 写作工具对比 | commercial | affiliate | **high (entry point)** | ✅ research→draft→review→**published to local Hexo**; awaiting online deploy |
| B3 | NovelCrafter review / 某工具深度测评 | commercial | affiliate | med | todo |
| B4 | best free AI writing tools for novelists / 最好用的免费 AI 写作工具 | commercial | affiliate | **high (entry point)** | ✅ research→draft→review→**published to local Hexo**; awaiting online deploy |
| B5 | best AI tools for worldbuilding / 特定场景最佳工具 | commercial | affiliate | low | todo |

## Internal-linking rules (this is where money is made)

1. Every cluster post links up to its pillar; each pillar links down to all its cluster posts.
2. High-traffic Cluster-A posts link **into** Cluster-B commercial posts — this converts free
   ad traffic into affiliate clicks.
3. Cluster-B posts cross-link (comparison ↔ review).

## Rollout (keep bilingual workload sane)

- **Batch 1 (validate one full cluster, EN first):** Pillar 1 + A1 (have) + A2 + B1.
- **Batch 2:** finish EN Cluster A, then Pillar 2 + B2/B3.
- **Batch 3:** mirror only the EN winners into ZH (data-driven, not blind translation).

## Constraints

- **Affiliate disclosure is mandatory** (FTC) on EN commercial posts — candidate to add to
  `check-prepublish.mjs` as a required check later.
- Bilingual layout: `projects/ai-writing-blog/seo/en/` and `seo/zh/`; publish to `_posts/en|zh`.
- Cluster-B (tool reviews) must pass `content-review` + `copyright-risk-reviewer` — no copying
  vendor copy, no exaggerated claims.
