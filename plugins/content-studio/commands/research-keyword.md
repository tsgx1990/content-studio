---
description: Research a keyword with real SERP data and write its .research.json (pursue/skip decision). Args: keyword="..." language=en|zh project=slug provider=web-search|manual.
---

Research a keyword before drafting. Parse arguments from: $ARGUMENTS (expects `keyword=...`).

Steps:
1. Invoke the **keyword-research** skill with the parsed `keyword`, `language`, `project`,
   and optional `provider` (default `web-search`).
2. Use real web search to capture the SERP snapshot, related queries, and content gaps —
   do not rely on memory, and never fabricate search volume (leave it null if unknown).
3. Write `projects/{slug}/seo/{lang}/{keyword-slug}.research.json` per
   `schemas/keyword-research.schema.json`.
4. Report the `decision` (pursue / skip / defer) and the reasoning. Only `pursue` keywords
   should go on to `/generate-content`.
