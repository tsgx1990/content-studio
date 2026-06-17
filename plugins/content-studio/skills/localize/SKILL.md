---
name: localize
description: Produce a market-native sibling of an existing article in another language (e.g. an EN winner → a ZH-native article). Localize = re-target for the destination market, NOT translate. Refuses to draft without native keyword-research that says pursue.
---

# localize

## When to use

You have a proven article in one market (e.g. a published / `review:ok` EN article) and want a
sibling in another language/market (the first case is EN → ZH). Use this instead of "translate
the article" — translation produces content nobody in the destination market is searching for.

## Core principle: localize ≠ translate

A `zh` article is **not** a translated `en` article. Chinese search lives in a different
ecosystem (Baidu / WeChat / Xiaohongshu / Zhihu) with different intent, competitors, examples,
and often different winning keywords. The source article is a **structural / angle reference**,
not source text to translate. Re-research and re-ground in the destination market.

What typically **carries over**: the article's shape (outline, the proven angle), the
content-gap insight, the internal-link *intent* (link to the sibling cluster).
What must be **re-done for the destination market**: the keyword (native research), the
competitor picture, the concrete examples/tools (e.g. swap English-market tools like
Sudowrite/NovelCrafter for the destination's real options — 国产工具 such as 秘塔写作猫 / 笔灵 /
蛙蛙写作 — only after verifying them), pricing/currency, platforms, and all time-sensitive facts.

## Inputs

```yaml
source: string             # path to the source article, e.g. projects/{slug}/seo/en/{slug}.md
target_lang: zh            # destination market language
project: string            # same project (cross-market siblings live under one project)
```

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
   `projects/{slug}/seo/{target_lang}/{dest-keyword-slug}.md` (the slug may differ from the
   source — it follows the *native* keyword). Set internal links to destination-language siblings
   when they exist (else link the source-language one and note it as a TODO).
5. **Review** with `content-review` (the article is `{target_lang}`), then **publish** with
   `publish-content` — the publisher routes non-`en` under its lang prefix (e.g. `/zh/`).

## Quality gates

- Never machine-translate-and-publish. Every published localized article is independently
  keyword-grounded and market-adapted.
- Never carry an English-market tool/product into the destination article as if it's relevant
  or available there without checking. Re-verify pricing, availability, and names for the market.
- Same originality rules as `seo-article`: no imitation of a named author or protected work.
- The destination article stands on its own for its market — not "the EN article, in Chinese."

## Failure handling

- Native research returns `skip/defer` → STOP, report the divergence, suggest the destination
  market's actual better keyword if the research surfaced one.
- No destination-market data source available → fall back to `manual` (ask the user for
  百度指数 / 下拉词 / competitor titles); do not proceed on guesses.

## Relationship to other skills

`localize` is an orchestration lens, not a bypass: it runs
`keyword-research → seo-article → content-review → publish-content` with a destination-market
framing and the source article as a reference. Every gate still applies.
