---
name: game-story
description: Write a choice-based GAME (a branching story with state — flags + an item inventory + conditional choices), then render it to a playable Markdown page. The graph (.game.json) is the source of truth and is enforced by the deterministic game-story winnability gate (every choice + every flag/item resolves, a reachable win, no softlock / unwinnable state, no orphan scene). Refuses to skip the gate.
---

# game-story

## When to use

The user wants a text **game**, not just a branching story: the player picks up items, sets
flags, and some choices are only available when state allows (a locked door that needs a key, a
guard you can only pass once disguised). One run = one game. This is the stateful sibling of
`interactive-fiction`: use that one for a pure choose-your-path story with no inventory/state;
use **this** when choices depend on what the player has done or carries.

## Why a state machine + a winnability gate

A branching story's failures are structural (a dead link, an orphan). A *game's* worst failure is
worse and sneakier: a **softlock / unwinnable state** — the player reaches a scene from which they
can neither win nor make progress (the classic "walking dead": you missed the key, the door is
shut, but the game doesn't tell you it's over). That is reproducibly checkable, so it belongs to a
gate, not to taste. The game lives as a state machine (`{slug}.game.json`) and
`scripts/check-game-story.mjs` enforces — by searching **(scene × state)** — that:

- ids are unique, `start` is real, every `choice.target` resolves;
- every flag/item named by a requirement or effect is **declared** (state referential integrity);
- a terminal scene (outcome/ending) has no choices; a non-terminal scene has ≥1 choice;
- no requirement is **statically unsatisfiable** (an item no choice ever grants; a flag value
  never reachable);
- **a winning ending is reachable** (the game is winnable);
- **no reachable non-terminal scene is a softlock** (every reachable state has an available move);
- **no orphan scene** (every scene is reachable in some state).

State is restricted to **booleans + items** (no open-ended numeric stats) so winnability is
decidable. Prose quality, pacing, and fairness stay with `content-review`. Same split as the rest
of the repo. Grounded in `docs/research/2026-06-06-game-story-state-machine.md`.

## Inputs

```yaml
project: string          # projects/{slug}; project.yaml type: game-story
premise: string          # the situation + the player's goal (what counts as winning)
language: string         # default "en"
```

## Outputs (under projects/{slug}/game/{lang}/)

- `{slug}.game.json` — the **state machine** (source of truth): `game_id`, `start`,
  `flags[]` (`{id, initial?, label?}`), `items[]` (`{id, label?}`), and `scenes[]` where each scene
  has `id`, `text`, optional `outcome` (`win`/`lose`/`neutral`) / `ending`, and `choices[]`. Each
  choice is `{ label, target }` plus optional availability (`requires_flags`/`requires_items`) and
  effects (`set_flags`/`add_items`/`remove_items`).
- `{slug}.md` — the **rendered** playable page: an anchored section per scene
  (`## … {#scene-id}`), choices as in-page links with their gates/effects noted, win/lose endings
  marked. This is what gets reviewed + published.
- `{slug}.review.json` — `content-review` sidecar (`content_type: game-story`).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml` with `type: game-story`.
2. **Design the state machine first** (`{slug}.game.json`): declare every `flag` and `item` up
   front; lay out scenes; gate choices with `requires_*`; grant state with the effect arrays; mark
   the win scene(s) `outcome: "win"`. Give every non-terminal scene an **always-available escape**
   (a "step back") so the player can never get stuck — this is how you avoid softlocks.
3. **Gate it:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-game-story.mjs projects/{slug}/game/{lang}/{slug}.game.json`.
   Fix until it exits 0 — it pinpoints any unreachable scene, unwinnable goal, softlock, or
   unobtainable requirement. Also `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs {slug}.game.json` for the
   schema alone.
4. **Render to `{slug}.md`** from the state machine: title, then one anchored section per scene in
   reading order (start first), choices as `- [label](#target)` links annotated with their
   requirement/effect (e.g. *needs the brass key* / *take the key*), endings labelled
   "**You win.**" / "**You lose.**". Keep prose faithful to the scene `text`.
5. **Review:** run `content-review` → `{slug}.review.json` (`content_type: game-story`, metadata
   title/description/tags, `monetization` as appropriate).
6. **Publish (optional):** via `publish-content` (`check-prepublish.mjs`). Confirm the target site
   keeps heading ids so in-page anchor links work.

## Quality gates

- `{slug}.game.json` passes `check-game-story.mjs` (and `validate-sidecar`).
- The rendered `.md`'s links match the scenes (every link target is a real anchor).
- `content-review` marks it `publishable: true`, `copyright_risk: low`.
- Choices and state are meaningful — items/flags actually gate progress, not decoration.

## Failure handling

- Gate reports **unwinnable** → trace the dependency chain to the win scene; usually a required
  item is never granted, or is gated behind itself (a circular dependency).
- Gate reports a **softlock** → give that scene an always-available escape choice, or mark it a
  terminal `lose` ending if being stuck *is* the intended outcome.
- Gate reports an **orphan** → link it or delete it; don't leave unreachable scenes.
- Numeric "stats" you want the player to manage → out of scope for the gate (it reasons over
  flags + items). Model the decisive states as flags, or keep stats as flavor `content-review` judges.
- Imitative request (named franchise/world) → refuse; offer an original premise.
