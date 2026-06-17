# Long-form line (novels) — architecture

> Status: built + **validated at 24-chapter length / 3 arcs** (state model + continuity gate +
> skills/subagent + a deterministic relevance-injection script). Per-chapter loop proven on a
> 24-chapter, 3-arc novel (`projects/farbeacons`) and a 10-chapter novel (`projects/ninebridge`),
> not just the 3-chapter `saltlight`. Same v1 ethos as the SEO line: file-based, zero-dep,
> deterministic gates over trust.

## Why this design

Web research on long-form AI fiction (2026) converges on one lesson: **the hard part is not
generation, it is maintaining consistency across 60k+ words**, and **a story bible without
enforcement is "a dictionary nobody consults."** Mature tools (NovelCrafter's Codex, Sudowrite's
Story Bible) keep a structured memory of characters/world/timeline and inject it into generation;
the strongest approaches add **automated fact extraction after each chapter** + **relevance-weighted
fact injection** + **post-generation consistency verification**.

Sources: Novarrium (structured memory / consistency guide), Indie Hackers build write-up,
Future Fiction Academy (series bibles), Sudowrite/NovelCrafter docs.

We map that onto this repo's strength — deterministic gates — by splitting memory into:

- **Narrative bible** (Markdown, human-facing): `bible.md`, `style-guide.md` — premise, voice,
  themes, hard "do-not" list.
- **Structured state** (JSON, machine-read + gated): `novel/state.json` conforming to
  `schemas/story-state.schema.json` — characters (with appearance anchors, status, died_chapter,
  relationships), locations, world_rules, timeline, foreshadowing, and a chapter ledger (cast/pov).

The structured state is what makes the bible *enforceable*: `scripts/check-continuity.mjs` is a
deterministic gate (referential integrity, timeline order, foreshadowing order, **no resurrection**,
+ blocks high-severity conflicts from the continuity report). Semantic "does the prose contradict
the bible?" stays an LLM judgment (the `continuity-editor` subagent writes `*.continuity.json`) —
exactly the content-review (LLM) + check-prepublish (script) split, applied to fiction.

## Files per novel project

```text
projects/{slug}/
  project.yaml            # type: novel
  novel/
    bible.md              # narrative bible (premise, themes, voice, do-not list)
    style-guide.md        # voice / POV / tense / pacing rules
    state.json            # STRUCTURED state (schema-validated, continuity-gated)
    chapters/chapter-001.md
    chapters/chapter-001.continuity.json   # continuity-editor report (sidecar)
    chapters/chapter-001.review.json        # content-review sidecar (reused from SEO line)
```

## Per-chapter loop (research-grounded)

```text
story-bible (once)  → bible.md + state.json (skeleton)
        │
chapter-generation ─► read state.json + bible + last N chapter summaries
        │            ─► inject ONLY relevant facts (cast, their anchors, open foreshadowing,
        │               world rules in play) — relevance-weighted, not the whole bible.
        │               This selection is now a SCRIPT, not eyeballed:
        │               node scripts/build-chapter-context.mjs state.json <N> [--last 3] [--json]
        │               (emits the bounded pack + a report of what it excluded)
        │            ─► outline (must advance plot) → draft → chapters/chapter-NNN.md
        │
continuity-editor ──► compare draft vs state.json → chapters/chapter-NNN.continuity.json
        │
content-review ─────► chapters/chapter-NNN.review.json (quality/safety, reused)
        │
state-update ───────► extract new/evolved facts → update state.json (atomic, chapter-linked)
        │
GATE: node scripts/check-continuity.mjs state.json chapters/chapter-NNN.continuity.json
      node scripts/check-prepublish.mjs chapters/chapter-NNN.md   (when publishing)
```

## What is deterministic vs judgment

| Concern | Owner |
|---|---|
| Structural integrity of state (refs, order, no-resurrection, arc ranges) | `check-continuity.mjs` (script) |
| High-severity continuity conflict blocks progress | `check-continuity.mjs` (script) |
| Relevance-weighted per-chapter context (the 60k lever) | `build-chapter-context.mjs` (script) |
| Semantic continuity (prose vs bible) | `continuity-editor` (subagent → report) |
| Chapter quality / pacing / safety | `content-review` (skill + subagents) |
| Fact extraction back into state | `state-update` (skill) |

## Publishing a serial to Hexo

Chapters reuse the SEO publish path (`check-prepublish.mjs` gate + `publish.mjs`) — a chapter is
just a `.md` with a `.review.json` sidecar. The serial convention lives in the chapter's review
`metadata`:

- `categories: ["Fiction", "<Series>"]` — the `/categories/Fiction/<Series>/` page becomes the
  table of contents (all chapters grouped).
- `slug: "<series>-<n>-<title>"` — meaningful, collision-free URLs (publisher honors `metadata.slug`).
- `date: "YYYY-MM-DD HH:mm:ss"` — set per chapter so order is deterministic.
- **Reading order:** a blog lists newest-first, so add prev/next links in the chapter prose with
  Hexo `{% post_link <published-slug> 'label' %}` (resolves with the site root prefix). This is the
  reliable way to give a serial a forward reading path regardless of list order.

**Blog gotcha:** `hexo-renderer-marked` defaults to `breaks: true` (GFM), which turns every soft
newline in a soft-wrapped paragraph into a forced `<br>`. The blog `_config.yml` sets
`marked: { breaks: false }` so prose renders as flowing paragraphs (blank lines still separate
paragraphs). Required for any soft-wrapped Markdown content, not just fiction.

Proven on `projects/saltlight` (3 chapters live: `/saltlight-1-the-ninth-pane/` …). NOTE: the demo
blog is an "AI Writing Blog"; a real fiction serial would target its own site/section — change
`config/publish.json` `postsDir` (or add a target) rather than mixing verticals.

## Validated at length

- **10 chapters** (`projects/ninebridge`): continuity gate green at every checkpoint with negative
  proof against resurrection / foreshadowing-order / timeline-order. Closes the PRD Phase-3
  acceptance. See `docs/2026-06-07-phase3-10-chapter-run.md`.
- **24 chapters / 3 arcs** (`projects/farbeacons`): the loop holds past 10 with **bounded per-chapter
  context** — `build-chapter-context.mjs` keeps the injected pack flat (~3/13 characters, ~3 prior
  chapters) as the book triples in length, with a rotating cast per arc and 3 cross-arc deaths.
  Negative proof now also covers the arc invariants. This is the 60k-tractability proof. See
  `docs/2026-06-07-24-chapter-scale-run.md`.

## Not yet done

- A literal full-length book (60k+ words, ~150–200 chapters) end to end. The tooling now makes it
  *tractable* (bounded context per chapter) and the loop is proven at 24 chapters, but a complete
  60k draft has not been generated.
- Per-chapter `content-review` / `*.continuity.json` semantic reports produced as separate sidecars
  for an entire long-form work (both length runs applied those rubrics inline, gating continuity
  deterministically without a per-chapter review/continuity sidecar).
