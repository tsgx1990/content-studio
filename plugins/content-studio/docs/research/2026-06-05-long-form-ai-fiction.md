# Research — long-form AI fiction: consistency & state management

- **Date:** 2026-06-05
- **Question:** How do mature systems keep a novel consistent across 60k+ words, and how should
  our long-form line be designed?
- **Method:** web search + fetched two engineering-oriented write-ups. (CN search providers were
  out of balance; used the US-index search — fine for English best-practice sources.)

## Key findings

1. **The hard part is state, not generation.** Builders repeatedly say the engineering challenge
   is maintaining consistency across the whole book, not producing good prose for one chapter.
2. **Story bible = structured memory**, not just prose: characters (with fixed appearance
   anchors, status, relationships), locations, world rules, timeline, foreshadowing.
3. **Enforcement is the differentiator.** *"A story bible without enforcement is a dictionary
   nobody consults."* Passive reference docs the model *can* read but isn't *forced* to use are
   weak. Strong systems add: automated **fact extraction** after each chapter → **structured
   storage** (atomic, typed, chapter-linked, with confidence) → **relevance-weighted injection**
   of only the facts a scene needs → **post-generation consistency verification**.
4. **Local + global context:** inject the last ~2–3 chapter summaries (local continuity) plus the
   relevant bible facts (global), rather than dumping the whole bible.
5. **Prevention > correction:** inject canon before generating, and verify after, to stop
   contradictions rather than only catching them later.

## How we applied it (decisions)

- Split memory: narrative bible in Markdown (`bible.md`, `style-guide.md`) + **structured state**
  in JSON (`novel/state.json`, `schemas/story-state.schema.json`).
- Made the bible *enforceable* via a deterministic gate `scripts/check-continuity.mjs`
  (referential integrity, timeline order, foreshadowing order, **no-resurrection**, blocks
  high-severity conflicts) — our analogue of the "verification" layer, reproducible and zero-dep.
- Kept the LLM/script split: `continuity-editor` subagent (semantic) writes `*.continuity.json`;
  the script enforces. Same shape as `content-review` + `check-prepublish`.
- `state-update` skill = the "fact extraction after each chapter" step.

## Sources

- Novarrium — AI Story Bible / structured memory: https://novarrium.com/blog/ai-story-bible-structured-memory
- Novarrium — AI story consistency guide: https://novarrium.com/blog/ai-story-consistency-complete-guide
- Indie Hackers — "I built an AI that writes full-length novels with consistent characters":
  https://www.indiehackers.com/post/i-built-an-ai-that-writes-full-length-novels-with-consistent-characters-heres-what-i-learned-f0d3211a8a
- Future Fiction Academy — using AI for series bibles: https://futurefictionacademy.com/using-ai-for-series-bibles/

## Limitations

- US-index search only (CN/Baidu providers were unavailable); sources skew to English tools.
- Vendor blog posts (some are marketing); cross-checked the recurring claims across ≥3 sources.
