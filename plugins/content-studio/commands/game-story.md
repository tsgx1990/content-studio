---
description: Write a choice-based GAME with state (flags + inventory + conditional choices), winnability-gated, + rendered Markdown. Args like project=slug premise="..." language=en.
---

Write a stateful choice game. Parse arguments from: $ARGUMENTS

Invoke the **game-story** skill:
1. Create/confirm `projects/{project}/project.yaml` with `type: game-story` (propose a slug from
   the premise if `project` is missing).
2. Design the state machine FIRST — `projects/{project}/game/{language}/{slug}.game.json`:
   declare `flags[]` + `items[]`, then `scenes[]` (`id`/`text`/optional `outcome`/`choices[]`).
   Gate choices with `requires_flags`/`requires_items`; grant state with
   `set_flags`/`add_items`/`remove_items`; mark the win scene `outcome:"win"`. Give every
   non-terminal scene an always-available escape so the player can never get stuck.
3. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-game-story.mjs <story.game.json>` — fix until it exits 0 (a
   reachable win, no softlock, no orphan, no unobtainable requirement).
4. Render the state machine to `{slug}.md` (anchored `## … {#scene-id}` sections, choices as
   `- [label](#target)` links annotated with their requirement/effect, endings labelled win/lose).
5. Run **content-review** → `{slug}.review.json` (`content_type: game-story`).
6. Stop before publishing unless asked.

Never skip the winnability gate; never ship a game that is unwinnable or can softlock.
