---
description: Make a market-native sibling of an article in another language (e.g. EN → ZH). Args like source=projects/{slug}/seo/en/{slug}.md target_lang=zh.
---

Localize an existing article into another market. Parse arguments from: $ARGUMENTS

Defaults: `target_lang=zh`.

This is **not** translation — invoke the **localize** skill, which re-targets for the
destination market and re-runs the pipeline natively.

Steps:
1. Read the `source` article and its sibling `*.research.json` (use as a reference, not as text
   to translate).
2. Invoke **localize**: run **keyword-research** for `target_lang` natively (do NOT translate the
   source keyword). If the native research's `decision` is not `pursue`, report the divergence
   and stop — a destination-market `skip/defer` is a valid finding, not a failure.
3. If `pursue`, draft natively via **seo-article** for the destination keyword (swap
   examples/tools/pricing for verified destination-market equivalents), then **content-review**.
4. Tell the user to run `/publish-content` (the publisher routes non-`en` under its lang prefix,
   e.g. `/zh/`). Do NOT publish here.
