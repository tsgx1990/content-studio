---
name: interactive-fiction
description: Write a branching (choose-your-path) story as a structured node graph, then render it to a readable Markdown page. The graph (.if.json) is the source of truth and is enforced by the deterministic story-graph gate (every choice resolves, every scene reachable, no dead-ends, a reachable ending). Refuses to skip the graph gate.
---

# interactive-fiction

## When to use

The user wants a branching / choose-your-path / gamebook-style story where the reader makes choices.
One run = one branching story. Full content vertical: the graph schema + the story-graph gate +
the shared review/publish gates.

## Why a graph + a graph gate

A branching story's worst failures are *structural*, not stylistic: a choice that leads to a node
that doesn't exist, a scene no path can reach, a "dead-end" the author forgot to mark as an ending,
or a story the reader can never finish. Those are reproducibly checkable, so they belong to a gate,
not to taste. The story lives as a **node graph** (`{slug}.if.json`) and
`scripts/check-storygraph.mjs` enforces: unique ids, a real `start`, every `choice.target` resolves,
every node reachable from start, every node is an ending or has a choice, and at least one ending is
reachable. Prose quality stays with `content-review`. Same split as the rest of the repo.

## Inputs

```yaml
project: string          # projects/{slug}; project.yaml type: interactive-fiction
premise: string          # the situation + the reader's role
language: string         # default "en"
target_endings: number   # optional — how many distinct endings to aim for
```

## Outputs (under projects/{slug}/if/{lang}/)

- `{slug}.if.json` — the **graph** (source of truth): `story_id`, `start`, `nodes[]` where each node
  has `id`, optional `title` (the human-readable scene heading), `text` (scene prose), optional
  `ending: true`, and `choices[]` of `{ label, target }`.
- `{slug}.md` — the **rendered** readable page (a deterministic projection via `render.mjs`, NOT
  hand-written): each node as an anchored section (`## title {#node-id}`), each choice an in-page link
  (`- [label](#target)`), endings marked `**An ending.**` with a restart link, and a derived
  ending-count line. This is what gets reviewed + published (anchored links work on a static Hexo page).
- `{slug}.review.json` — `content-review` sidecar (`content_type: interactive-fiction`).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml` with `type: interactive-fiction`.
2. **Design the graph first** (`{slug}.if.json`): a `start` node, branching choices, and ≥1
   `ending`. Keep ids stable slugs and give each node a `title` (its scene heading). Aim for
   meaningful choices (each changes the path), not fake ones that re-merge immediately. Original
   characters/world only.
3. **Gate the graph:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-storygraph.mjs projects/{slug}/if/{lang}/{slug}.if.json`.
   Fix until it exits 0 — it reports node + ending counts and pinpoints any broken branch / orphan /
   dead-end. Also `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs {slug}.if.json` for the schema alone.
4. **Render to `{slug}.md`:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/render.mjs projects/{slug}/if/{lang}/{slug}.if.json --write`
   — never hand-assemble the page (it would drift from the graph the gate trusts). The renderer
   projects the headings, anchored sections, choice links, ending markers and ending-count line from
   the JSON; node `title` becomes the heading (falls back to the id if omitted).
5. **Review:** run `content-review` → `{slug}.review.json` (`content_type: interactive-fiction`,
   metadata title/description/tags, `monetization` as appropriate).
6. **Publish (optional):** via `publish-content` (`check-prepublish.mjs`). In-page anchor links
   render on a static page; confirm the target site keeps heading ids.

## Quality gates

- `{slug}.if.json` passes `check-storygraph.mjs` (and `validate-sidecar`).
- The rendered `.md`'s links match the graph (every link target is a real anchor).
- `content-review` marks it `publishable: true`, `copyright_risk: low`.
- Choices are real forks (the graph actually branches; not a single line dressed up as choices).

## Failure handling

- Gate reports an unreachable node → either link to it or delete it; don't leave orphan scenes.
- Gate reports no reachable ending (usually a loop) → add an exit branch to an ending.
- Imitative request (named franchise/world) → refuse; offer an original branching premise.
