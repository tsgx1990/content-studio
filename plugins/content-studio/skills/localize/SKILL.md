---
name: localize
description: Produce a market-native sibling of an existing article for a different market — a different LANGUAGE (e.g. an EN winner → a ZH-native article) OR a different REGION in the same language (e.g. a guide written for one province/state → another, where the local data differs). Localize = re-target for the destination market, NOT translate or find-replace. Refuses to draft without native keyword-research that says pursue, and (for a region re-target) refuses to carry the source region's data over — every region-specific number must be re-sourced.
---

# localize

## When to use

You have a proven article in one market and want a sibling in another. Two cases:

- **Cross-language** (e.g. a published / `review:ok` EN article → a ZH-native one). Use this instead
  of "translate the article" — translation produces content nobody in the destination is searching for.
- **Cross-region, same language** (e.g. a guide written for one region → another region in the same
  language). Use this instead of find-replacing the region name — the regions share a structure but
  **not** their data: local ranking/score tables, thresholds/cutoffs, quotas, prices and the set of
  local institutions/competitors all differ, so a copied number is a factual error (and, in a
  YMYL/regulated niche, a credibility risk). Same demand-research discipline, plus a hard data
  re-sourcing rule.

## Core principle: localize ≠ translate ≠ find-replace

The source article is a **structural / angle reference**, not source text to copy. Re-research and
re-ground in the destination market every time.

- A `zh` article is **not** a translated `en` article. Chinese search lives in a different ecosystem
  (Baidu / WeChat / Xiaohongshu / Zhihu) with different intent, competitors, examples, keywords.
- A destination-region article is **not** a source-region article with the place name swapped. Same
  language, but a different region means a different set of local institutions/competitors, different
  thresholds/cutoffs, different ranking/score tables, often different search phrasing. **Every
  region-specific number must be re-sourced from the destination region's real data — never carried
  over from the source region.**

What typically **carries over**: the article's shape (outline, the proven angle), the
content-gap insight, the internal-link *intent* (link to the sibling cluster).
What must be **re-done for the destination market**: the keyword (native research), the
competitor picture, the concrete examples/tools (e.g. swap English-market tools like
Sudowrite/NovelCrafter for the destination's real options — 国产工具 such as 秘塔写作猫 / 笔灵 /
蛙蛙写作 — only after verifying them), pricing/currency, platforms, and all time-sensitive facts.

## Inputs

```yaml
source: string             # path to the source article, e.g. projects/{slug}/seo/en/{slug}.md
target_lang: zh            # destination market language (for a cross-language re-target)
target_region: string      # destination region, e.g. a different province/state (for a same-language cross-region re-target)
project: string            # destination project (a cross-region re-target usually lives in its own project, one per region)
```

Give `target_lang` for a language re-target, `target_region` for a region re-target (same language).

## Workflow

1. **Read the source** article and its sibling `*.research.json` (angle, `content_gaps`,
   internal-link targets). Treat it as a reference, not as text to translate.
2. **Native keyword-research (hard precondition).** Run the `keyword-research` skill for the
   destination market with `language: target_lang` — research the *destination* keyword natively
   (do NOT translate the source keyword and assume demand transfers). Honor the data-source rules:
   a US-index search is not a valid Baidu SERP → fall back to `manual` and say so; never fabricate.
3. **Respect the decision gate.** If the native research's `decision` is not `pursue`, **STOP**
   and report it. A destination-market `skip/defer` for a topic that wins in the source market is
   a real, valuable finding — not a failure. Do not force a translation through the gate.
4. **Draft natively** via `seo-article` semantics for the destination keyword: keep the proven
   structure/angle where it still fits, but replace examples/tools/pricing/platforms with
   verified destination-market equivalents, and match destination search norms. Write to
   `projects/{dest-project}/seo/{lang}/{dest-keyword-slug}.md` (the slug follows the *native*
   keyword and, for a region, carries the region — e.g. `<region>-<native-keyword-slug>`).
   Set internal links to destination siblings when they exist (else link the source one as a TODO).
5. **(Region re-target) Re-source every region-specific number — do NOT carry the source's over.**
   The destination region needs its **own** data anchor (e.g. `<region>-rankings-2025.data.json`
   per `schemas/data-anchors.schema.json`, with a real `source`); re-gather the local ranking/score
   tables, thresholds/cutoffs, quotas and the set of local institutions from the destination region's
   authoritative source. Declare the article against THAT anchor with a
   `<!-- data: {"data_year":N,"dataset":"…"} -->` block and cite each figure in the anchored form
   `check-freshness.mjs` verifies, so the gate will **block** any number that drifted (a source-region
   figure left in a destination-region article is exactly the drift it catches). Never reuse the
   source region's anchor.
6. **Review** with `content-review`, then **publish** with `publish-content` — for a cross-language
   article the publisher routes non-`en` under its lang prefix (e.g. `/zh/`); a same-language region
   sibling publishes under its own project/site.

## Quality gates

- Never machine-translate-and-publish. Every published localized article is independently
  keyword-grounded and market-adapted.
- Never carry an English-market tool/product into the destination article as if it's relevant
  or available there without checking. Re-verify pricing, availability, and names for the market.
- **(Region) Never carry the source region's numbers, institutions, or thresholds into the
  destination.** Every region-specific figure is re-sourced from the destination region and verified
  against its own `*.data.json`; `check-freshness.mjs` must pass with no drift before publishing.
- Same originality rules as `seo-article`: no imitation of a named author or protected work.
- The destination article stands on its own for its market — not "the EN article, in Chinese" and
  not "the source-region article with the destination region pasted over it."

## Failure handling

- Native research returns `skip/defer` → STOP, report the divergence, suggest the destination
  market's actual better keyword if the research surfaced one.
- No destination-market data source available → fall back to `manual` (ask the user for
  百度指数 / 下拉词 / competitor titles); do not proceed on guesses.
- (Region) Can't find the destination region's real local data (ranking/score tables, thresholds) →
  STOP; do not publish a region article with the source region's numbers as placeholders. Missing
  data is a hard stop, not a fill-in-later.

## Relationship to other skills

`localize` is an orchestration lens, not a bypass: it runs
`keyword-research → seo-article → content-review → publish-content` with a destination-market
framing and the source article as a reference. Every gate still applies.
