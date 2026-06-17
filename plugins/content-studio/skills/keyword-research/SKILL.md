---
name: keyword-research
description: Gather REAL keyword/SERP data for a target keyword and write a <slug>.research.json sidecar with a pursue/skip decision. Required before drafting any SEO article — never draft on guesses.
---

# keyword-research

## When to use

Before drafting any SEO article. This skill is the **real-data entry point**: it produces
the `*.research.json` sidecar that `seo-article` requires. No research → no drafting.

The whole point: stop writing on guesses. Ground every article in what is *actually*
ranking and *actually* being searched.

## Providers (same contract, pick by what's available)

Fill `schemas/keyword-research.schema.json` from one of these. Always record `source` and
`data_quality` honestly.

1. **web-search** (default, automated) — use the available web search / web-reader tools to
   look up the keyword, read the current top results, and harvest the real SERP picture and
   related queries. `data_quality: "estimated"`, `search_volume: null` (web search does not
   give exact volume — leave it null, do **not** fabricate a number).
2. **manual** (baseline, zero-dep) — the user pastes data from their tool (Ahrefs free,
   Ubersuggest, Google Keyword Planner, 百度指数). If it includes real volume/difficulty,
   set `data_quality: "measured"` and fill the numbers.
3. **api:<name>** (reserved, not implemented) — Ahrefs/Semrush/DataForSEO via MCP. When
   wired, it fills the same contract with `data_quality: "measured"`.

## Language / market (ZH is native, not translated)

Research is **per market**, not per translation. A `zh` article is NOT a translated `en`
article — Chinese search lives in a different ecosystem (Baidu / WeChat / Xiaohongshu / Zhihu),
with different intent, different competitors, and often different winning keywords.

- **Do not translate an EN keyword into ZH and assume the demand transfers.** Research the ZH
  keyword on its own. (E.g. Chinese users searching AI-writing tools mostly look for 国产工具
  like 秘塔写作猫 / 笔灵 / 蛙蛙写作, and phrase intent as "AI写小说怎么写", not English product names.)
- **ZH data sources:** real Baidu SERP needs a CN-capable search (`web_search_prime` with
  `location: cn`); a US-index search will return EN pages and is NOT a valid ZH SERP — say so
  and fall back to `manual`. ZH volume comes from 百度指数 / 5118 / 站长之家 (manual, `measured`).
- A faithful ZH-native result may be `skip/defer` for a topic that wins in EN — that divergence
  is a real, valuable finding, not a failure. Record it in `reason`.
- Path stays `projects/{slug}/seo/zh/{keyword-slug}.research.json`; set `language: zh`.

## Inputs

```yaml
keyword: string            # the primary keyword to research (in the target market's language)
language: en | zh          # market — research natively, do NOT translate an EN keyword
project: string            # projects/{slug}
provider: web-search | manual   # optional; default web-search, fall back to manual
```

## Workflow

1. Pick the provider (default `web-search`; if no search tool is available, ask the user for
   `manual` data).
2. **web-search path:** search the keyword (and a couple of variations). Read the top ~5–10
   results. Record for each: title, url, format (how-to / listicle / video / forum / product).
   Harvest related searches / People-Also-Ask. Identify what the top results all do — and
   what they all **miss** (`content_gaps`). Infer the dominant `search_intent` from the SERP.
3. **manual path:** ask the user to paste their keyword data; map it into the schema.
4. Judge `monetization_fit` (ads = informational; affiliate = commercial "best/vs/review").
5. Make a `decision`: `pursue` (good opportunity), `skip` (too hard / no fit / no real
   search), or `defer`. Always give a `reason`.
6. Write `projects/{slug}/seo/{lang}/{keyword-slug}.research.json` per the schema.
7. **Validate the contract** — run `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs <path-to.research.json>`.
   If it exits non-zero, fix the file until it conforms (the schema is enforced, not advisory).
8. Tell the user the verdict. Only `pursue` items go on to `seo-article`.

## Output — `<keyword-slug>.research.json`

Conforms to `schemas/keyword-research.schema.json`. Key fields: `source`, `data_quality`,
`search_intent`, `serp_snapshot`, `related_queries`, `content_gaps`, `recommended_angle`,
`monetization_fit`, `decision`.

## Honesty rules (the reason this skill exists)

- Never label inferred data as `measured`. Web-search data is `estimated`.
- If you cannot get a real number (e.g. search volume), set it to `null` — do not invent it.
- `serp_snapshot` and `related_queries` must come from actually observed results, not memory.
- If the SERP is dominated by huge authority sites with no gap, prefer `decision: skip/defer`
  and say so — a realistic "don't bother" is more valuable than a hopeful draft.
- **Year-stamped reference data** that several pieces will cite (e.g. a 一分一段 分数→位次 table)
  goes ONCE into a `*.data.json` (`schemas/data-anchors.schema.json`) with `data_year` + a real
  `source` (name + URL) — same honesty contract as research. Content then cites it via the
  `分数≈位次万` form and declares `<!-- data: … -->` so `check-freshness.mjs` verifies it. Never
  hand-copy the numbers into each file (that is the drift TC-006 prevents).

## Failure handling

- No search tool and no manual data → stop and ask the user for manual data; do not proceed
  on guesses (that is exactly the failure mode this skill prevents).
- Ambiguous keyword → research the dominant intent, note alternatives in `reason`.
